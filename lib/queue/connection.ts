import { Redis } from "ioredis";

// Shared across all Queue/Worker instances, and reused across hot reloads in dev.
// BullMQ requires maxRetriesPerRequest: null on the underlying ioredis connection.
const globalForRedis = globalThis as unknown as { redisConnection?: Redis };

export function getRedisConnection(): Redis {
  if (!globalForRedis.redisConnection) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not configured");
    }
    globalForRedis.redisConnection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return globalForRedis.redisConnection;
}
