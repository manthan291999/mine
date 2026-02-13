import type http from "node:http";
import { authClaimsSchema, type AuthClaims } from "@rtcp/shared";

const anon: AuthClaims = { sub: "anonymous", teamIds: [] };

export function parseAuth(req: http.IncomingMessage, expectedToken: string): AuthClaims {
  const value = req.headers["authorization"]?.toString() ?? "";
  const token = value.replace("Bearer ", "");
  if (!token || token !== expectedToken) return anon;

  const actor = req.headers["x-actor-id"]?.toString() ?? "authenticated-user";
  const teams = req.headers["x-team-ids"]?.toString()?.split(",").filter(Boolean) ?? [];
  return authClaimsSchema.parse({ sub: actor, teamIds: teams });
}
