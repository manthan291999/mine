"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { decodeUpdate, encodeUpdate, wireMessageSchema, type WireMessage } from "@rtcp/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4001";

export function Editor({ docId }: { docId: string }) {
  const wsRef = useRef<WebSocket | null>(null);
  const ydoc = useMemo(() => new Y.Doc(), []);
  const text = ydoc.getText("content");
  const [value, setValue] = useState("");
  const [presence, setPresence] = useState<string[]>([]);
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    const ws = new WebSocket(WS_URL, []);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Connected");
      ws.send(JSON.stringify({ v: 1, type: "sync_request", docId }));
    };

    ws.onclose = () => setStatus("Disconnected");

    ws.onmessage = (e) => {
      const parsed = wireMessageSchema.safeParse(JSON.parse(e.data));
      if (!parsed.success) return;
      const msg = parsed.data as WireMessage;

      if (msg.type === "sync_response" || msg.type === "update") {
        Y.applyUpdate(ydoc, decodeUpdate(msg.update));
        setValue(text.toString());
      }

      if (msg.type === "awareness") {
        setPresence((prev) => [...new Set([...prev, msg.actorId])]);
      }

      if (msg.type === "error") {
        setStatus(`Error: ${msg.code}`);
      }
    };

    return () => ws.close();
  }, [docId, text, ydoc]);

  function onChange(next: string) {
    ydoc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, next);
    }, "local");
    setValue(next);
    const update = encodeUpdate(Y.encodeStateAsUpdate(ydoc));
    wsRef.current?.send(JSON.stringify({ v: 1, type: "update", docId, update, actorId: "web-user" }));
    wsRef.current?.send(
      JSON.stringify({ v: 1, type: "awareness", docId, actorId: "web-user", state: { cursor: next.length } })
    );
  }

  return (
    <section>
      <h2>Document: {docId}</h2>
      <p>Status: {status}</p>
      <p>Presence: {presence.join(", ") || "No collaborators yet"}</p>
      <textarea style={{ width: "100%", minHeight: 320 }} value={value} onChange={(e) => onChange(e.target.value)} />
    </section>
  );
}
