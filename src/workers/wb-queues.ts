import { Queue } from "bullmq";
import { getRedisConnection } from "./queues";

const wbQueues: Record<string, Queue> = {};

export function getWbQueue(name: string): Queue {
  const queueName = `wb-${name}`;
  if (!wbQueues[queueName]) {
    wbQueues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
      prefix: "{wb}",
    });
  }
  return wbQueues[queueName];
}

export async function closeWbQueues(): Promise<void> {
  for (const queue of Object.values(wbQueues)) {
    await queue.close();
  }
}
