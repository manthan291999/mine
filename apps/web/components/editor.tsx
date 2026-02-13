"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { messageSchema, type WireMessage } from "@rtcp/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4001";

export function Editor({ docId }: { docId: string }) {
  const wsRef = useRef<WebSocket | null>(null);
  const ydoc = useMemo(() => new Y.Doc(), []);
  const text = ydoc.getText("content");
  const [value, setValue] = useState("");
  const [presence, setPresence] = useState<string[]>([]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: "sync_request", docId }));
    ws.onmessage = (e) => {
      const msg = messageSchema.parse(JSON.parse(e.data)) as WireMessage;
      if (msg.type === "sync_response" || msg.type === "update") {
        Y.applyUpdate(ydoc, Buffer.from(msg.update, "base64"));
        setValue(text.toString());
      }
      if (msg.type === "awareness") {
        setPresence((prev) => [...new Set([...prev, msg.actorId])]);
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
    const update = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
    wsRef.current?.send(JSON.stringify({ type: "update", docId, update, actorId: "web-user" }));
    wsRef.current?.send(JSON.stringify({ type: "awareness", docId, actorId: "web-user", state: { cursor: next.length } }));
  }

  return (
    <section>
      <h2>Document: {docId}</h2>
      <p>Presence: {presence.join(", ") || "No collaborators yet"}</p>
      <textarea style={{ width: "100%", minHeight: 320 }} value={value} onChange={(e) => onChange(e.target.value)} />
    </section>
  );
}
