import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REALTIME_PORT: z.coerce.number().int().positive().default(4001),
  REDIS_URL: z.string().url().default("redis://redis:6379"),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@postgres:5432/rtcp"),
  SNAPSHOT_EVERY_UPDATES: z.coerce.number().int().positive().default(50),
  DOC_CACHE_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(1200),
  AUTH_TOKEN: z.string().min(8).default("dev-token")
});

export const config = configSchema.parse(process.env);
