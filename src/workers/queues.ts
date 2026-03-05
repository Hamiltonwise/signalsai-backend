import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
      ...(process.env.REDIS_TLS === "true" && { tls: {} }),
    });
  }
  return connection;
}

const queues: Record<string, Queue> = {};

export function getMindsQueue(name: string): Queue {
  const queueName = `minds-${name}`;
  if (!queues[queueName]) {
    queues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
    });
  }
  return queues[queueName];
}

export async function closeQueues(): Promise<void> {
  for (const queue of Object.values(queues)) {
    await queue.close();
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
