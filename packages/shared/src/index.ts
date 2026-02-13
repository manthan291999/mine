import { z } from "zod";

export const protocolVersion = 1;

const baseEnvelope = z.object({
  v: z.literal(protocolVersion),
  requestId: z.string().uuid().optional()
});

export const wireMessageSchema = z.discriminatedUnion("type", [
  baseEnvelope.extend({ type: z.literal("ping"), ts: z.number().int().nonnegative().optional() }),
  baseEnvelope.extend({ type: z.literal("sync_request"), docId: z.string().min(1) }),
  baseEnvelope.extend({
    type: z.literal("sync_response"),
    docId: z.string().min(1),
    update: z.string().min(1)
  }),
  baseEnvelope.extend({
    type: z.literal("update"),
    docId: z.string().min(1),
    update: z.string().min(1),
    actorId: z.string().min(1),
    source: z.string().optional()
  }),
  baseEnvelope.extend({
    type: z.literal("awareness"),
    docId: z.string().min(1),
    actorId: z.string().min(1),
    state: z.record(z.unknown()),
    source: z.string().optional()
  }),
  baseEnvelope.extend({
    type: z.literal("error"),
    code: z.string().min(1),
    message: z.string().min(1)
  })
]);

export type WireMessage = z.infer<typeof wireMessageSchema>;

export const authClaimsSchema = z.object({
  sub: z.string().min(1),
  teamIds: z.array(z.string()).default([])
});

export type AuthClaims = z.infer<typeof authClaimsSchema>;

export function encodeUpdate(update: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(update).toString("base64");
  let binary = "";
  update.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

export function decodeUpdate(update: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(update, "base64"));
  const binary = atob(update);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
