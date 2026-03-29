import * as dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";
import IORedis from "ioredis";
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
import { processGbpRefresh } from "./processors/gbpRefresh.processor";
import { processPatientPathBuild } from "./processors/patientpathBuild.processor";
import { processWelcomeIntelligence } from "./processors/welcomeIntelligence.processor";
import { processWeek1Win } from "./processors/week1Win.processor";
import { processMondayEmail } from "./processors/mondayEmail.processor";
import { processCompetitiveScout } from "./processors/competitiveScout.processor";
import { processClientMonitor } from "./processors/clientMonitor.processor";
import { processMorningBriefing } from "./processors/morningBriefing.processor";
import { processIntelligenceAgent } from "./processors/intelligenceAgent.processor";
import { processLearningAgent } from "./processors/learningAgent.processor";
import { processCSExpander } from "./processors/csExpander.processor";
import { processCSCoach } from "./processors/csCoach.processor";
import { processConversionOptimizer } from "./processors/conversionOptimizer.processor";
import { processContentPerformance } from "./processors/contentPerformance.processor";
import { processNothingGetsLost } from "./processors/nothingGetsLost.processor";
import { processAEOMonitor } from "./processors/aeoMonitor.processor";
import { processMarketSignalScout } from "./processors/marketSignalScout.processor";
import { processTechnologyHorizon } from "./processors/technologyHorizon.processor";
import { processProgrammaticSEO } from "./processors/programmaticSEO.processor";
import { processWeeklyDigest } from "./processors/weeklyDigest.processor";
import { getMindsQueue } from "./queues";
import { closeWbQueues } from "./wb-queues";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

console.log("[MINDS-WORKER] Starting Minds worker process...");
console.log(`[MINDS-WORKER] Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}`);

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
  ...(process.env.REDIS_TLS === "true" && { tls: {} }),
});

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

// PatientPath Build worker
const patientpathBuildWorker = new Worker(
  "minds-patientpath-build",
  async (job) => {
    await processPatientPathBuild(job);
  },
  {
    connection,
    concurrency: 2,
    prefix: '{minds}',
  }
);

// Welcome Intelligence worker (fires 4h after checkup account creation)
const welcomeIntelligenceWorker = new Worker(
  "minds-welcome-intelligence",
  async (job) => {
    await processWelcomeIntelligence(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

const week1WinWorker = new Worker(
  "minds-week1-win",
  async (job) => {
    await processWeek1Win(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Monday Email worker (weekly Monday 7 AM ET)
const mondayEmailWorker = new Worker(
  "minds-monday-email",
  async (job) => {
    await processMondayEmail(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Competitive Scout worker (weekly Wednesday 8 AM ET)
const competitiveScoutWorker = new Worker(
  "minds-competitive-scout",
  async (job) => {
    await processCompetitiveScout(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Client Monitor worker (daily 6 AM ET)
const clientMonitorWorker = new Worker(
  "minds-client-monitor",
  async (job) => {
    await processClientMonitor(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Morning Briefing worker (daily 6:30 AM ET)
const morningBriefingWorker = new Worker(
  "minds-morning-briefing",
  async (job) => {
    await processMorningBriefing(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Intelligence Agent worker (daily 5 AM PT)
const intelligenceAgentWorker = new Worker(
  "minds-intelligence-agent",
  async (job) => {
    await processIntelligenceAgent(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Learning Agent worker (weekly Sunday 9 PM PT)
const learningAgentWorker = new Worker(
  "minds-learning-agent",
  async (job) => {
    await processLearningAgent(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// CS Expander worker (monthly 1st Monday 9 AM ET + on first_win events)
const csExpanderWorker = new Worker(
  "minds-cs-expander",
  async (job) => {
    await processCSExpander(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// CS Coach worker (weekly Sunday 8 PM PT)
const csCoachWorker = new Worker(
  "minds-cs-coach",
  async (job) => {
    await processCSCoach(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Conversion Optimizer worker (weekly Monday 6 AM PT)
const conversionOptimizerWorker = new Worker(
  "minds-conversion-optimizer",
  async (job) => {
    await processConversionOptimizer(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Content Performance worker (weekly Sunday 6 PM PT)
const contentPerformanceWorker = new Worker(
  "minds-content-performance",
  async (job) => {
    await processContentPerformance(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Nothing Gets Lost worker (daily 7 AM PT + weekly Sundays)
const nothingGetsLostWorker = new Worker(
  "minds-nothing-gets-lost",
  async (job) => {
    await processNothingGetsLost(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// AEO Monitor worker (weekly Monday 5 AM PT)
const aeoMonitorWorker = new Worker(
  "minds-aeo-monitor",
  async (job) => {
    await processAEOMonitor(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Market Signal Scout worker (daily 6 AM PT)
const marketSignalScoutWorker = new Worker(
  "minds-market-signal-scout",
  async (job) => {
    await processMarketSignalScout(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Technology Horizon worker (daily 6 AM PT)
const technologyHorizonWorker = new Worker(
  "minds-technology-horizon",
  async (job) => {
    await processTechnologyHorizon(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Programmatic SEO worker (weekly Monday 4 AM PT)
const programmaticSEOWorker = new Worker(
  "minds-programmatic-seo",
  async (job) => {
    await processProgrammaticSEO(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Weekly Digest worker (Sunday 8 PM PT)
const weeklyDigestWorker = new Worker(
  "minds-weekly-digest",
  async (job) => {
    await processWeeklyDigest(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Event handlers
for (const worker of [scrapeCompareWorker, compilePublishWorker, discoveryWorker, skillTriggerWorker, worksDigestWorker, seoBulkGenerateWorker, reviewSyncWorker, schedulerWorker, wbBackupWorker, wbRestoreWorker, patientpathBuildWorker, welcomeIntelligenceWorker, week1WinWorker, mondayEmailWorker, competitiveScoutWorker, clientMonitorWorker, morningBriefingWorker, intelligenceAgentWorker, learningAgentWorker, csExpanderWorker, csCoachWorker, conversionOptimizerWorker, contentPerformanceWorker, nothingGetsLostWorker, aeoMonitorWorker, marketSignalScoutWorker, technologyHorizonWorker, programmaticSEOWorker, weeklyDigestWorker]) {
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
  await patientpathBuildWorker.close();
  await welcomeIntelligenceWorker.close();
  await week1WinWorker.close();
  await mondayEmailWorker.close();
  await competitiveScoutWorker.close();
  await clientMonitorWorker.close();
  await morningBriefingWorker.close();
  await intelligenceAgentWorker.close();
  await learningAgentWorker.close();
  await csExpanderWorker.close();
  await csCoachWorker.close();
  await conversionOptimizerWorker.close();
  await contentPerformanceWorker.close();
  await nothingGetsLostWorker.close();
  await aeoMonitorWorker.close();
  await marketSignalScoutWorker.close();
  await technologyHorizonWorker.close();
  await programmaticSEOWorker.close();
  await weeklyDigestWorker.close();
  await closeWbQueues();
  await connection.quit();
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

// GBP Token Refresh worker
const gbpRefreshWorker = new Worker(
  "minds-gbp-refresh",
  async (job) => {
    await processGbpRefresh(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Set up GBP token refresh schedule (daily 3 AM PT = 10 AM UTC)
async function setupGbpRefreshSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("gbp-refresh");
    await queue.add(
      "daily-gbp-refresh",
      {},
      {
        repeat: {
          pattern: "0 10 * * *", // 10 AM UTC = 3 AM PT
          tz: "UTC",
        },
        jobId: "daily-gbp-refresh",
      }
    );
    console.log("[MINDS-WORKER] Daily GBP token refresh scheduled (3 AM PT / 10 AM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up GBP refresh schedule:", err);
  }
}

// Set up Monday email schedule (Monday 7 AM ET = 12 PM UTC / 11 AM UTC during DST)
async function setupMondayEmailSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("monday-email");
    await queue.add(
      "weekly-monday-email",
      {},
      {
        repeat: {
          pattern: "0 7 * * 1", // 7 AM America/New_York every Monday
          tz: "America/New_York",
        },
        jobId: "weekly-monday-email",
      }
    );
    console.log("[MINDS-WORKER] Weekly Monday email scheduled (Monday 7 AM ET)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Monday email schedule:", err);
  }
}

// Set up Competitive Scout schedule (Wednesday 8 AM ET, after Sunday snapshots)
async function setupCompetitiveScoutSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("competitive-scout");
    await queue.add(
      "weekly-competitive-scout",
      {},
      {
        repeat: {
          pattern: "0 8 * * 3", // 8 AM America/New_York every Wednesday
          tz: "America/New_York",
        },
        jobId: "weekly-competitive-scout",
      }
    );
    console.log("[MINDS-WORKER] Weekly Competitive Scout scheduled (Wednesday 8 AM ET)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Competitive Scout schedule:", err);
  }
}

// Set up Client Monitor schedule (daily 6 AM ET)
async function setupClientMonitorSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("client-monitor");
    await queue.add(
      "daily-client-monitor",
      {},
      {
        repeat: {
          pattern: "0 6 * * *", // 6 AM America/New_York every day
          tz: "America/New_York",
        },
        jobId: "daily-client-monitor",
      }
    );
    console.log("[MINDS-WORKER] Daily Client Monitor scheduled (6 AM ET)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Client Monitor schedule:", err);
  }
}

// Set up Morning Briefing schedule (daily 6:30 AM ET, after Client Monitor)
async function setupMorningBriefingSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("morning-briefing");
    await queue.add(
      "daily-morning-briefing",
      {},
      {
        repeat: {
          pattern: "30 6 * * *", // 6:30 AM America/New_York every day
          tz: "America/New_York",
        },
        jobId: "daily-morning-briefing",
      }
    );
    console.log("[MINDS-WORKER] Daily Morning Briefing scheduled (6:30 AM ET)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Morning Briefing schedule:", err);
  }
}

// Set up Intelligence Agent schedule (daily 5 AM PT = 12 PM UTC / 1 PM UTC non-DST)
async function setupIntelligenceAgentSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("intelligence-agent");
    await queue.add(
      "daily-intelligence-agent",
      {},
      {
        repeat: {
          pattern: "0 5 * * *", // 5 AM America/Los_Angeles every day
          tz: "America/Los_Angeles",
        },
        jobId: "daily-intelligence-agent",
      }
    );
    console.log("[MINDS-WORKER] Daily Intelligence Agent scheduled (5 AM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Intelligence Agent schedule:", err);
  }
}

// Set up Learning Agent schedule (weekly Sunday 9 PM PT)
async function setupLearningAgentSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("learning-agent");
    await queue.add(
      "weekly-learning-agent",
      {},
      {
        repeat: {
          pattern: "0 21 * * 0", // 9 PM America/Los_Angeles every Sunday
          tz: "America/Los_Angeles",
        },
        jobId: "weekly-learning-agent",
      }
    );
    console.log("[MINDS-WORKER] Weekly Learning Agent scheduled (Sunday 9 PM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Learning Agent schedule:", err);
  }
}

// Set up CS Expander schedule (monthly 1st Monday 9 AM ET)
async function setupCSExpanderSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("cs-expander");
    await queue.add(
      "monthly-cs-expander",
      {},
      {
        repeat: {
          pattern: "0 9 1-7 * 1", // 9 AM ET, 1st-7th of month, only Monday
          tz: "America/New_York",
        },
        jobId: "monthly-cs-expander",
      }
    );
    console.log("[MINDS-WORKER] Monthly CS Expander scheduled (1st Monday 9 AM ET)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up CS Expander schedule:", err);
  }
}

// Set up CS Coach schedule (weekly Sunday 8 PM PT)
async function setupCSCoachSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("cs-coach");
    await queue.add(
      "weekly-cs-coach",
      {},
      {
        repeat: {
          pattern: "0 20 * * 0", // 8 PM America/Los_Angeles every Sunday
          tz: "America/Los_Angeles",
        },
        jobId: "weekly-cs-coach",
      }
    );
    console.log("[MINDS-WORKER] Weekly CS Coach scheduled (Sunday 8 PM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up CS Coach schedule:", err);
  }
}

// Set up Conversion Optimizer schedule (weekly Monday 6 AM PT)
async function setupConversionOptimizerSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("conversion-optimizer");
    await queue.add(
      "weekly-conversion-optimizer",
      {},
      {
        repeat: {
          pattern: "0 6 * * 1", // 6 AM America/Los_Angeles every Monday
          tz: "America/Los_Angeles",
        },
        jobId: "weekly-conversion-optimizer",
      }
    );
    console.log("[MINDS-WORKER] Weekly Conversion Optimizer scheduled (Monday 6 AM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Conversion Optimizer schedule:", err);
  }
}

// Set up Content Performance schedule (weekly Sunday 6 PM PT)
async function setupContentPerformanceSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("content-performance");
    await queue.add(
      "weekly-content-performance",
      {},
      {
        repeat: {
          pattern: "0 18 * * 0", // 6 PM America/Los_Angeles every Sunday
          tz: "America/Los_Angeles",
        },
        jobId: "weekly-content-performance",
      }
    );
    console.log("[MINDS-WORKER] Weekly Content Performance scheduled (Sunday 6 PM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Content Performance schedule:", err);
  }
}

// Set up Nothing Gets Lost schedule (daily 7 AM PT + weekly Sundays)
async function setupNothingGetsLostSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("nothing-gets-lost");
    await queue.add(
      "daily-nothing-gets-lost",
      {},
      {
        repeat: {
          pattern: "0 7 * * *", // 7 AM America/Los_Angeles every day
          tz: "America/Los_Angeles",
        },
        jobId: "daily-nothing-gets-lost",
      }
    );
    await queue.add(
      "weekly-nothing-gets-lost",
      {},
      {
        repeat: {
          pattern: "0 19 * * 0", // 7 PM America/Los_Angeles every Sunday (weekly fuller scan)
          tz: "America/Los_Angeles",
        },
        jobId: "weekly-nothing-gets-lost",
      }
    );
    console.log("[MINDS-WORKER] Nothing Gets Lost scheduled (daily 7 AM PT + weekly Sunday 7 PM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Nothing Gets Lost schedule:", err);
  }
}

// Set up AEO Monitor schedule (weekly Monday 5 AM PT)
async function setupAEOMonitorSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("aeo-monitor");
    await queue.add(
      "weekly-aeo-monitor",
      {},
      {
        repeat: {
          pattern: "0 5 * * 1", // 5 AM America/Los_Angeles every Monday
          tz: "America/Los_Angeles",
        },
        jobId: "weekly-aeo-monitor",
      }
    );
    console.log("[MINDS-WORKER] Weekly AEO Monitor scheduled (Monday 5 AM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up AEO Monitor schedule:", err);
  }
}

// Set up Market Signal Scout schedule (daily 6 AM PT)
async function setupMarketSignalScoutSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("market-signal-scout");
    await queue.add(
      "daily-market-signal-scout",
      {},
      {
        repeat: {
          pattern: "0 6 * * *", // 6 AM America/Los_Angeles every day
          tz: "America/Los_Angeles",
        },
        jobId: "daily-market-signal-scout",
      }
    );
    console.log("[MINDS-WORKER] Daily Market Signal Scout scheduled (6 AM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Market Signal Scout schedule:", err);
  }
}

// Set up Technology Horizon schedule (daily 6 AM PT)
async function setupTechnologyHorizonSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("technology-horizon");
    await queue.add(
      "daily-technology-horizon",
      {},
      {
        repeat: {
          pattern: "5 6 * * *", // 6:05 AM America/Los_Angeles every day (offset from Market Signal Scout)
          tz: "America/Los_Angeles",
        },
        jobId: "daily-technology-horizon",
      }
    );
    console.log("[MINDS-WORKER] Daily Technology Horizon scheduled (6:05 AM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Technology Horizon schedule:", err);
  }
}

// Set up Programmatic SEO schedule (weekly Monday 4 AM PT)
async function setupProgrammaticSEOSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("programmatic-seo");
    await queue.add(
      "weekly-programmatic-seo",
      {},
      {
        repeat: {
          pattern: "0 4 * * 1", // 4 AM America/Los_Angeles every Monday
          tz: "America/Los_Angeles",
        },
        jobId: "weekly-programmatic-seo",
      }
    );
    console.log("[MINDS-WORKER] Weekly Programmatic SEO scheduled (Monday 4 AM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Programmatic SEO schedule:", err);
  }
}

// Set up Weekly Digest schedule (Sunday 8 PM PT)
async function setupWeeklyDigestSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("weekly-digest");
    await queue.add(
      "weekly-digest",
      {},
      {
        repeat: {
          pattern: "0 20 * * 0", // 8 PM America/Los_Angeles every Sunday
          tz: "America/Los_Angeles",
        },
        jobId: "weekly-digest",
      }
    );
    console.log("[MINDS-WORKER] Weekly Digest scheduled (Sunday 8 PM PT)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up Weekly Digest schedule:", err);
  }
}

setupDiscoverySchedule();
setupSkillTriggerSchedule();
setupWorksDigestSchedule();
setupReviewSyncSchedule();
setupSchedulerTick();
setupGbpRefreshSchedule();
setupMondayEmailSchedule();
setupCompetitiveScoutSchedule();
setupClientMonitorSchedule();
setupMorningBriefingSchedule();
setupIntelligenceAgentSchedule();
setupLearningAgentSchedule();
setupCSExpanderSchedule();
setupCSCoachSchedule();
setupConversionOptimizerSchedule();
setupContentPerformanceSchedule();
setupNothingGetsLostSchedule();
setupAEOMonitorSchedule();
setupMarketSignalScoutSchedule();
setupTechnologyHorizonSchedule();
setupProgrammaticSEOSchedule();
setupWeeklyDigestSchedule();

console.log("[MINDS-WORKER] All workers running. Waiting for jobs...");
