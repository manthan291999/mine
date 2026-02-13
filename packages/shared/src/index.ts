import { z } from "zod";

export const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), ts: z.number().optional() }),
  z.object({ type: z.literal("sync_request"), docId: z.string() }),
  z.object({ type: z.literal("sync_response"), docId: z.string(), update: z.string() }),
  z.object({ type: z.literal("update"), docId: z.string(), update: z.string(), actorId: z.string() }),
  z.object({
    type: z.literal("awareness"),
    docId: z.string(),
    actorId: z.string(),
    state: z.record(z.any())
  })
]);

export type WireMessage = z.infer<typeof messageSchema>;

export interface AuthClaims {
  sub: string;
  teamIds: string[];
}
