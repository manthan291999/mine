import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import Redis from "ioredis";
import pino from "pino";
import * as Y from "yjs";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";
import { config } from "./config.js";
import { DocStore } from "./doc-store.js";
import { Persistence } from "./persistence.js";
import { messageSchema, type WireMessage } from "@rtcp/shared";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const docs = new DocStore();
const persistence = new Persistence(config.databaseUrl);
const redisPub = new Redis(config.redisUrl);
const redisSub = new Redis(config.redisUrl);
const rooms = new Map<string, Set<WebSocket>>();

const registry = new Registry();
collectDefaultMetrics({ register: registry });
const activeConnections = new Gauge({ name: "rtcp_active_connections", help: "Open sockets", registers: [registry] });
const receivedUpdates = new Counter({ name: "rtcp_updates_total", help: "Updates received", registers: [registry] });

function send(ws: WebSocket, msg: WireMessage) {
  ws.send(JSON.stringify(msg));
}

function broadcast(docId: string, msg: WireMessage, except?: WebSocket) {
  for (const ws of rooms.get(docId) ?? []) {
    if (ws !== except) send(ws, msg);
  }
}

function parseAuth(req: http.IncomingMessage): string {
  const token = req.headers["authorization"]?.toString().replace("Bearer ", "") ?? "anon";
  return token;
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200).end("ok");
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
  activeConnections.inc();
  const actorId = parseAuth(req);
  let msgCount = 0;

  ws.on("message", async (raw) => {
    msgCount++;
    if (msgCount > 3000) return ws.close(1011, "rate limit");

    const parsed = messageSchema.safeParse(JSON.parse(raw.toString()));
    if (!parsed.success) return;
    const msg = parsed.data;

    if (msg.type === "sync_request") {
      const entry = docs.get(msg.docId);
      const state = Y.encodeStateAsUpdate(entry.doc);
      send(ws, { type: "sync_response", docId: msg.docId, update: Buffer.from(state).toString("base64") });
      rooms.set(msg.docId, rooms.get(msg.docId) ?? new Set());
      rooms.get(msg.docId)?.add(ws);
      redisSub.subscribe(`doc:${msg.docId}`);
      return;
    }

    if (msg.type === "update") {
      receivedUpdates.inc();
      const update = Buffer.from(msg.update, "base64");
      const entry = docs.get(msg.docId);
      Y.applyUpdate(entry.doc, update);
      broadcast(msg.docId, msg, ws);
      await persistence.appendUpdate(msg.docId, update, actorId);
      await redisPub.publish(`doc:${msg.docId}`, JSON.stringify(msg));
      const count = docs.markUpdate(msg.docId);
      if (count % config.snapshotEveryUpdates === 0) {
        await persistence.snapshot(msg.docId, count, Y.encodeStateAsUpdate(entry.doc));
      }
      return;
    }

    if (msg.type === "awareness") {
      broadcast(msg.docId, msg, ws);
      await redisPub.publish(`doc:${msg.docId}`, JSON.stringify(msg));
      return;
    }

    if (msg.type === "ping") send(ws, { type: "ping", ts: Date.now() });
  });

  ws.on("close", () => {
    activeConnections.dec();
    for (const members of rooms.values()) members.delete(ws);
  });
});

redisSub.on("message", (_, payload) => {
  const parsed = messageSchema.safeParse(JSON.parse(payload));
  if (!parsed.success) return;
  broadcast(parsed.data.docId, parsed.data);
});

const shutdown = async () => {
  logger.info("shutting down");
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
server.listen(config.port, () => logger.info({ port: config.port }, "realtime online"));
