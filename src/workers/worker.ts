import * as dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";
import { processScrapeCompare } from "./processors/scrapeCompare.processor";
import { processCompilePublish } from "./processors/compilePublish.processor";
import { processDiscovery } from "./processors/discovery.processor";
import {
  processSkillTrigger,
  processDeadLetterCheck,
} from "./processors/skillTrigger.processor";
import { processWorksDigest } from "./processors/worksDigest.processor";
import { processSeoBulkGenerate } from "./processors/seoBulkGenerate.processor";
import { processReviewSync } from "./processors/reviewSync.processor";
import { processSchedulerTick } from "./processors/scheduler.processor";
import { processWebsiteBackup } from "./processors/websiteBackup.processor";
import { processWebsiteRestore } from "./processors/websiteRestore.processor";
import { processPmDailyBrief } from "./processors/pmDailyBrief.processor";
import { runDreamweaver } from "../services/dreamweaverAgent";
import { runCollectiveIntelligence } from "../services/collectiveIntelligence";
import { runProductEvolution } from "../jobs/productEvolution";
import { getMindsQueue, getPmQueue } from "./queues";
import { closeWbQueues } from "./wb-queues";
import { getSharedRedis, closeSharedRedis } from "../services/redis";

console.log("[MINDS-WORKER] Starting Minds worker process...");

// Shared self-healing Redis connection with exponential backoff.
// Workers survive Redis restarts and reconnect automatically.
const connection = getSharedRedis();

// Scrape & Compare worker
const scrapeCompareWorker = new Worker(
  "minds-scrape-compare",
  async (job) => {
    await processScrapeCompare(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Compile & Publish worker
const compilePublishWorker = new Worker(
  "minds-compile-publish",
  async (job) => {
    await processCompilePublish(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Discovery worker
const discoveryWorker = new Worker(
  "minds-discovery",
  async (job) => {
    await processDiscovery(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Skill Trigger worker
const skillTriggerWorker = new Worker(
  "minds-skill-triggers",
  async (job) => {
    if (job.name === "dead-letter-check") {
      await processDeadLetterCheck(job);
    } else {
      await processSkillTrigger(job);
    }
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Works Digest worker
const worksDigestWorker = new Worker(
  "minds-works-digest",
  async (job) => {
    await processWorksDigest(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// SEO Bulk Generate worker
const seoBulkGenerateWorker = new Worker(
  "minds-seo-bulk-generate",
  async (job) => {
    await processSeoBulkGenerate(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Set up repeatable discovery job (every 24 hours)
async function setupDiscoverySchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("discovery");
    await queue.add(
      "daily-discovery",
      {},
      {
        repeat: {
          pattern: "0 6 * * *", // 6 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-discovery",
      }
    );
    console.log("[MINDS-WORKER] Daily discovery job scheduled (6 AM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up discovery schedule:", err);
  }
}

// Set up skill trigger schedule (every 5 minutes) + dead letter check (every 10 minutes)
async function setupSkillTriggerSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("skill-triggers");
    await queue.add(
      "skill-trigger-check",
      {},
      {
        repeat: {
          pattern: "*/5 * * * *", // Every 5 minutes
          tz: "UTC",
        },
        jobId: "skill-trigger-check",
      }
    );
    await queue.add(
      "dead-letter-check",
      {},
      {
        repeat: {
          pattern: "*/10 * * * *", // Every 10 minutes
          tz: "UTC",
        },
        jobId: "dead-letter-check",
      }
    );
    console.log("[MINDS-WORKER] Skill trigger + dead letter check scheduled");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up skill trigger schedule:", err);
  }
}

// Review Sync worker
const reviewSyncWorker = new Worker(
  "minds-review-sync",
  async (job) => {
    await processReviewSync(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Scheduler worker (ticks every 60s, checks DB for due schedules)
const schedulerWorker = new Worker(
  "minds-scheduler",
  async (job) => {
    await processSchedulerTick(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Website Builder — Backup worker
const wbBackupWorker = new Worker(
  "wb-backup",
  async (job) => {
    await processWebsiteBackup(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{wb}',
  }
);

// Website Builder — Restore worker
const wbRestoreWorker = new Worker(
  "wb-restore",
  async (job) => {
    await processWebsiteRestore(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{wb}',
  }
);

// PM Daily Brief worker
const pmDailyBriefWorker = new Worker(
  "pm-daily-brief",
  async (job) => {
    await processPmDailyBrief(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{pm}',
  }
);

// Dreamweaver Agent: scans for hospitality legends (daily 6 AM, before morning briefing)
const dreamweaverWorker = new Worker(
  "minds-dreamweaver",
  async () => { await runDreamweaver(); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// Collective Intelligence Engine (weekly Sunday 8 PM PT)
// Layer 5: analyzes patterns across ALL accounts. Discovers heuristics
// no individual business could find alone. Feeds into Oz moments.
const collectiveIntelligenceWorker = new Worker(
  "minds-collective-intelligence",
  async () => { await runCollectiveIntelligence(); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// Product Evolution Engine (weekly Sunday 11 PM PT)
// Layer 4: reads its own usage data, identifies friction,
// reads source code, drafts improvement proposals for Dave.
const productEvolutionWorker = new Worker(
  "minds-product-evolution",
  async () => { await runProductEvolution(); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// Event handlers
for (const worker of [scrapeCompareWorker, compilePublishWorker, discoveryWorker, skillTriggerWorker, worksDigestWorker, seoBulkGenerateWorker, reviewSyncWorker, schedulerWorker, wbBackupWorker, wbRestoreWorker, pmDailyBriefWorker, dreamweaverWorker, collectiveIntelligenceWorker, productEvolutionWorker]) {
  worker.on("completed", (job) => {
    console.log(`[MINDS-WORKER] Job ${job?.id} completed on queue ${worker.name}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[MINDS-WORKER] Job ${job?.id} failed on queue ${worker.name}:`, err);
  });

  worker.on("error", (err) => {
    console.error(`[MINDS-WORKER] Worker error on ${worker.name}:`, err);
  });
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log("[MINDS-WORKER] Shutting down workers...");
  await scrapeCompareWorker.close();
  await compilePublishWorker.close();
  await discoveryWorker.close();
  await skillTriggerWorker.close();
  await worksDigestWorker.close();
  await seoBulkGenerateWorker.close();
  await reviewSyncWorker.close();
  await schedulerWorker.close();
  await wbBackupWorker.close();
  await wbRestoreWorker.close();
  await pmDailyBriefWorker.close();
  await dreamweaverWorker.close();
  await collectiveIntelligenceWorker.close();
  await productEvolutionWorker.close();
  await closeWbQueues();
  await closeSharedRedis();
  console.log("[MINDS-WORKER] Workers shut down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Set up works digest schedule (weekly — 3 AM UTC Sundays)
async function setupWorksDigestSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("works-digest");
    await queue.add(
      "weekly-works-digest",
      {},
      {
        repeat: {
          pattern: "0 3 * * 0", // 3 AM UTC every Sunday
          tz: "UTC",
        },
        jobId: "weekly-works-digest",
      }
    );
    console.log("[MINDS-WORKER] Weekly works digest job scheduled (3 AM UTC Sundays)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up works digest schedule:", err);
  }
}

// Set up review sync schedule (daily — 4 AM UTC)
async function setupReviewSyncSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("review-sync");
    await queue.add(
      "daily-review-sync",
      {},
      {
        repeat: {
          pattern: "0 4 * * *", // 4 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-review-sync",
      }
    );
    console.log("[MINDS-WORKER] Daily review sync job scheduled (4 AM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up review sync schedule:", err);
  }
}

// Set up scheduler tick (every 60 seconds)
async function setupSchedulerTick(): Promise<void> {
  try {
    const queue = getMindsQueue("scheduler");
    await queue.add(
      "scheduler-tick",
      {},
      {
        repeat: {
          pattern: "* * * * *", // Every minute
          tz: "UTC",
        },
        jobId: "scheduler-tick",
      }
    );
    console.log("[MINDS-WORKER] Scheduler tick scheduled (every 60s)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up scheduler tick:", err);
  }
}

// Set up PM daily brief schedule (22:00 UTC = 6:00 AM PHT)
async function setupPmDailyBriefSchedule(): Promise<void> {
  try {
    const queue = getPmQueue("daily-brief");
    await queue.add(
      "pm-daily-brief",
      {},
      {
        repeat: {
          pattern: "0 22 * * *", // 22:00 UTC = 6 AM PHT
          tz: "UTC",
        },
        jobId: "pm-daily-brief",
      }
    );
    console.log("[MINDS-WORKER] PM daily brief job scheduled (22:00 UTC / 6 AM PHT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up PM daily brief schedule:", err);
  }
}

// Set up Collective Intelligence schedule (Sunday 8 PM PT = Monday 4 AM UTC)
async function setupCollectiveIntelligenceSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("collective-intelligence");
    await queue.add(
      "collective-intelligence",
      {},
      {
        repeat: {
          pattern: "0 4 * * 1", // Monday 4 AM UTC = Sunday 8 PM PT
          tz: "UTC",
        },
        jobId: "collective-intelligence-weekly",
      }
    );
    console.log("[MINDS-WORKER] Collective Intelligence scheduled (Sunday 8 PM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Collective Intelligence:", err);
  }
}

// Set up Product Evolution schedule (Sunday 11 PM PT = Monday 7 AM UTC)
async function setupProductEvolutionSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("product-evolution");
    await queue.add(
      "product-evolution",
      {},
      {
        repeat: {
          pattern: "0 7 * * 1", // Monday 7 AM UTC = Sunday 11 PM PT
          tz: "UTC",
        },
        jobId: "product-evolution-weekly",
      }
    );
    console.log("[MINDS-WORKER] Product Evolution scheduled (Sunday 11 PM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Product Evolution:", err);
  }
}

setupDiscoverySchedule();
setupSkillTriggerSchedule();
setupWorksDigestSchedule();
setupReviewSyncSchedule();
setupSchedulerTick();
setupPmDailyBriefSchedule();
setupCollectiveIntelligenceSchedule();
setupProductEvolutionSchedule();

console.log("[MINDS-WORKER] All workers running. Waiting for jobs...");
