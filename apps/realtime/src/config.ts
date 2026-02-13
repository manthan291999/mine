export const config = {
  port: Number(process.env.REALTIME_PORT ?? 4001),
  redisUrl: process.env.REDIS_URL ?? "redis://redis:6379",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@postgres:5432/rtcp",
  snapshotEveryUpdates: Number(process.env.SNAPSHOT_EVERY_UPDATES ?? 50)
};
