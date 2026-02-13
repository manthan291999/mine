import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { wireMessageSchema } from "@rtcp/shared";
import { SlidingWindowRateLimiter } from "../src/rate-limit";

describe("wire protocol", () => {
  it("accepts versioned update payload", () => {
    const valid = wireMessageSchema.safeParse({
      v: 1,
      type: "update",
      docId: "doc-1",
      update: Buffer.from("abc").toString("base64"),
      actorId: "user-1"
    });
    expect(valid.success).toBe(true);
  });

  it("rejects payload with unknown version", () => {
    const invalid = wireMessageSchema.safeParse({
      v: 9,
      type: "ping"
    });
    expect(invalid.success).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks when limit is exceeded", () => {
    const limiter = new SlidingWindowRateLimiter(2, 1_000);
    expect(limiter.allow("a", 100)).toBe(true);
    expect(limiter.allow("a", 200)).toBe(true);
    expect(limiter.allow("a", 300)).toBe(false);
    expect(limiter.allow("a", 1_500)).toBe(true);
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
