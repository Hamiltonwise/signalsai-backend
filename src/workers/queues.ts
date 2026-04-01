import { Queue } from "bullmq";
import { getSharedRedis, closeSharedRedis } from "../services/redis";

/**
 * Re-export for backward compatibility. All consumers now share the
 * self-healing connection from src/services/redis.ts.
 */
export function getRedisConnection() {
  return getSharedRedis();
}

const queues: Record<string, Queue> = {};

export function getMindsQueue(name: string): Queue {
  const queueName = `minds-${name}`;
  if (!queues[queueName]) {
    queues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
      prefix: '{minds}',
    });
  }
  return queues[queueName];
}

export function getPmQueue(name: string): Queue {
  const queueName = `pm-${name}`;
  if (!queues[queueName]) {
    queues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
      prefix: '{pm}',
    });
  }
  return queues[queueName];
}

export async function closeQueues(): Promise<void> {
  for (const queue of Object.values(queues)) {
    await queue.close();
  }
  await closeSharedRedis();
}
