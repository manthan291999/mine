import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import Redis from "ioredis";
import pino from "pino";
import * as Y from "yjs";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { config } from "./config.js";
import { DocStore } from "./doc-store.js";
import { Persistence } from "./persistence.js";
import { parseAuth } from "./auth.js";
import { SlidingWindowRateLimiter } from "./rate-limit.js";
import { decodeUpdate, encodeUpdate, wireMessageSchema, type WireMessage } from "@rtcp/shared";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const instanceId = randomUUID();
const docs = new DocStore(config.DOC_CACHE_MAX);
const persistence = new Persistence(config.DATABASE_URL);
const redisPub = new Redis(config.REDIS_URL);
const redisSub = new Redis(config.REDIS_URL);
const rooms = new Map<string, Set<WebSocket>>();
const wsMeta = new WeakMap<WebSocket, { actorId: string; connectionId: string; docs: Set<string> }>();

const registry = new Registry();
collectDefaultMetrics({ register: registry });
const activeConnections = new Gauge({ name: "rtcp_active_connections", help: "Open sockets", registers: [registry] });
const activeRooms = new Gauge({ name: "rtcp_active_rooms", help: "Active room count", registers: [registry] });
const receivedUpdates = new Counter({ name: "rtcp_updates_total", help: "Updates received", registers: [registry] });
const messageLatency = new Histogram({
  name: "rtcp_update_persist_seconds",
  help: "Time to persist updates",
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
  registers: [registry]
});
const rateLimiter = new SlidingWindowRateLimiter(config.RATE_LIMIT_PER_MINUTE, 60_000);

function send(ws: WebSocket, msg: WireMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function joinRoom(docId: string, ws: WebSocket) {
  const room = rooms.get(docId) ?? new Set<WebSocket>();
  room.add(ws);
  rooms.set(docId, room);
  activeRooms.set(rooms.size);
}

function leaveAllRooms(ws: WebSocket) {
  const meta = wsMeta.get(ws);
  if (!meta) return;
  for (const docId of meta.docs) {
    rooms.get(docId)?.delete(ws);
    if ((rooms.get(docId)?.size ?? 0) === 0) rooms.delete(docId);
  }
  activeRooms.set(rooms.size);
}

function broadcast(docId: string, msg: WireMessage, except?: WebSocket) {
  for (const ws of rooms.get(docId) ?? []) {
    if (ws !== except) send(ws, msg);
  }
}

function parseIncoming(raw: string): WireMessage | null {
  try {
    const payload = JSON.parse(raw);
    const parsed = wireMessageSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function ensureHydrated(docId: string) {
  const entry = docs.get(docId);
  if (entry.hydrated) return;
  const snapshot = await persistence.latestSnapshot(docId);
  if (snapshot) Y.applyUpdate(entry.doc, snapshot);
  docs.markHydrated(docId);
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/healthz") {
    const dbHealthy = await persistence.ping();
    const redisHealthy = redisPub.status === "ready" && redisSub.status === "ready";
    const ok = dbHealthy && redisHealthy;
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok, dbHealthy, redisHealthy }));
    return;
  }

  if (req.url === "/metrics") {
    res.setHeader("content-type", registry.contentType);
    res.end(await registry.metrics());
    return;
  }

  res.writeHead(404).end("not found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const claims = parseAuth(req, config.AUTH_TOKEN);
  const connectionId = randomUUID();
  wsMeta.set(ws, { actorId: claims.sub, connectionId, docs: new Set() });
  activeConnections.inc();

  ws.on("message", async (raw) => {
    const meta = wsMeta.get(ws);
    if (!meta) return;

    if (!rateLimiter.allow(meta.connectionId)) {
      send(ws, { v: 1, type: "error", code: "rate_limit", message: "Rate limit exceeded" });
      ws.close(1011, "rate limit");
      return;
    }

    const msg = parseIncoming(raw.toString());
    if (!msg) {
      send(ws, { v: 1, type: "error", code: "bad_payload", message: "Invalid message payload" });
      return;
    }

    if (msg.type === "ping") {
      send(ws, { v: 1, type: "ping", ts: Date.now(), requestId: msg.requestId });
      return;
    }

    if (msg.type === "sync_request") {
      await ensureHydrated(msg.docId);
      const entry = docs.get(msg.docId);
      const state = Y.encodeStateAsUpdate(entry.doc);
      joinRoom(msg.docId, ws);
      meta.docs.add(msg.docId);
      await redisSub.subscribe(`doc:${msg.docId}`);
      send(ws, { v: 1, type: "sync_response", docId: msg.docId, update: encodeUpdate(state), requestId: msg.requestId });
      return;
    }

    if (msg.type === "update") {
      const start = process.hrtime.bigint();
      receivedUpdates.inc();
      await ensureHydrated(msg.docId);
      const updateBytes = decodeUpdate(msg.update);
      const entry = docs.get(msg.docId);
      Y.applyUpdate(entry.doc, updateBytes);

      const outbound: WireMessage = { ...msg, source: instanceId, actorId: meta.actorId };
      broadcast(msg.docId, outbound, ws);
      await persistence.appendUpdate(msg.docId, updateBytes, meta.actorId);
      await redisPub.publish(`doc:${msg.docId}`, JSON.stringify(outbound));

      const count = docs.markUpdate(msg.docId);
      if (count % config.SNAPSHOT_EVERY_UPDATES === 0) {
        await persistence.snapshot(msg.docId, count, Y.encodeStateAsUpdate(entry.doc));
        await persistence.compactUpdates(msg.docId);
      }

      const seconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      messageLatency.observe(seconds);
      return;
    }

    if (msg.type === "awareness") {
      const outbound: WireMessage = { ...msg, source: instanceId, actorId: meta.actorId };
      broadcast(msg.docId, outbound, ws);
      await redisPub.publish(`doc:${msg.docId}`, JSON.stringify(outbound));
      return;
    }
  });

  ws.on("close", () => {
    leaveAllRooms(ws);
    activeConnections.dec();
  });
});

redisSub.on("message", (_, payload) => {
  const msg = parseIncoming(payload);
  if (!msg || (msg.type !== "update" && msg.type !== "awareness")) return;
  if (msg.source === instanceId) return;
  broadcast(msg.docId, msg);
});

const shutdown = async () => {
  logger.info({ instanceId }, "shutting down");
  wss.close();
  server.close();
  await redisPub.quit();
  await redisSub.quit();
  await persistence.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await persistence.init();
server.listen(config.REALTIME_PORT, () => logger.info({ port: config.REALTIME_PORT, instanceId }, "realtime online"));
