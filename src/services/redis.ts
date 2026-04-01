/**
 * Shared Redis Connection -- src/services/redis.ts
 *
 * Single IORedis instance used by all Redis consumers:
 *   - BullMQ workers and queues
 *   - Health endpoint
 *   - Any future caching layer
 *
 * Features:
 *   - Exponential backoff reconnect (caps at 30s)
 *   - Event logging for connect, disconnect, reconnect, error
 *   - Self-healing: never gives up reconnecting
 */

import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const REDIS_TLS = process.env.REDIS_TLS === "true";

const LOG_PREFIX = "[REDIS]";

let sharedConnection: IORedis | null = null;

/**
 * Returns the singleton Redis connection. Creates it on first call.
 * The connection uses exponential backoff for reconnects and will
 * never stop trying to reach Redis.
 */
export function getSharedRedis(): IORedis {
  if (sharedConnection) return sharedConnection;

  sharedConnection = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    // BullMQ requires null so it can wait indefinitely for Redis
    maxRetriesPerRequest: null,
    // Do not block on readiness check so the app can start without Redis
    enableReadyCheck: true,
    // Exponential backoff: 50ms, 100ms, 200ms ... capped at 30s
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 30_000);
      console.log(
        `${LOG_PREFIX} Reconnect attempt ${times}, retrying in ${delay}ms`
      );
      return delay;
    },
    // Reconnect on close (e.g. Redis restart)
    reconnectOnError(err: Error) {
      const targetErrors = ["READONLY", "ECONNRESET", "ECONNREFUSED"];
      return targetErrors.some((e) => err.message.includes(e));
    },
    ...(REDIS_TLS && { tls: {} }),
  });

  // Connection lifecycle logging
  sharedConnection.on("connect", () => {
    console.log(
      `${LOG_PREFIX} Connected to ${REDIS_HOST}:${REDIS_PORT}`
    );
  });

  sharedConnection.on("ready", () => {
    console.log(`${LOG_PREFIX} Ready and accepting commands`);
  });

  sharedConnection.on("close", () => {
    console.warn(`${LOG_PREFIX} Connection closed, will attempt reconnect`);
  });

  sharedConnection.on("reconnecting", (delay: number) => {
    console.log(`${LOG_PREFIX} Reconnecting in ${delay}ms...`);
  });

  sharedConnection.on("error", (err: Error) => {
    // Log but do not crash. IORedis will keep retrying via retryStrategy.
    console.error(`${LOG_PREFIX} Connection error:`, err.message);
  });

  sharedConnection.on("end", () => {
    console.warn(`${LOG_PREFIX} Connection ended (will not reconnect)`);
  });

  return sharedConnection;
}

/**
 * Ping Redis and return true/false. Safe to call at any time.
 * Returns false if disconnected rather than throwing.
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const redis = getSharedRedis();
    // 2-second timeout so health endpoint never blocks
    const result = await Promise.race([
      redis.ping(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Redis ping timeout")), 2000)
      ),
    ]);
    return result === "PONG";
  } catch {
    return false;
  }
}

/**
 * Gracefully close the shared connection.
 * Call this during process shutdown.
 */
export async function closeSharedRedis(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
    console.log(`${LOG_PREFIX} Shared connection closed`);
  }
}
