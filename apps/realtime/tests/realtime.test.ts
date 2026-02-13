import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { messageSchema } from "@rtcp/shared";

describe("message schema", () => {
  it("accepts update payload", () => {
    const valid = messageSchema.safeParse({
      type: "update",
      docId: "doc-1",
      update: Buffer.from("abc").toString("base64"),
      actorId: "user-1"
    });
    expect(valid.success).toBe(true);
  });
});

describe("crdt convergence", () => {
  it("converges concurrent edits", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const aText = a.getText("content");
    const bText = b.getText("content");
    aText.insert(0, "hello ");
    bText.insert(0, "world");

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    expect(aText.toString()).toBe(bText.toString());
  });
});
