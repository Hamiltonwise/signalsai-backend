/**
 * Minds Worker -- The Essential 9
 *
 * Only workers that serve the 5 paying customers run here.
 * Everything else is disabled until verified and needed.
 *
 * The 3 core promises: GBP/SEO, Business Data, Website CRO.
 * Every worker here serves at least one of those promises.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";
import { processReviewSync } from "./processors/reviewSync.processor";
import { processWeeklyScoreRecalc } from "./processors/weeklyScoreRecalc.processor";
import { processMondayEmail } from "./processors/mondayEmail.processor";
import { generateAllSnapshots, generateSnapshotForOrg } from "../services/rankingsIntelligence";
import { fetchAnalyticsForAllOrgs } from "../services/analyticsService";
import { processWelcomeIntelligence } from "./processors/welcomeIntelligence.processor";
import { processSiteQa } from "./processors/siteQa.processor";
import { processNarratorJob } from "./processors/narrator.processor";
import { processPatientPathOrchestratorJob } from "./patientpathBuildWorker";
import { BUILD_QUEUE_NAME as PATIENTPATH_BUILD_QUEUE } from "../services/patientpath/orchestrator";
import { processRevealChoreography } from "./processors/revealChoreography.processor";
import { processWatcherJob, WATCHER_QUEUE_NAME } from "./watcherWorker";
import { processWeeklyDigest } from "./processors/weeklyDigest.processor";
import { runCROForAllOrgs } from "../services/croEngine";
import { runDFYForAllOrgs } from "../services/dfyEngine";
import { runSignalWatcher } from "../services/answerEngine/signalWatcher";
import { runTriggerRouter } from "../services/answerEngine/triggerRouter";
import { runAeoMonitor } from "../services/answerEngine/aeoMonitor";
import { getMindsQueue } from "./queues";
import { getSharedRedis, closeSharedRedis } from "../services/redis";

console.log("[MINDS-WORKER] Starting worker process (Essential 7)...");

const connection = getSharedRedis();

// ─── ESSENTIAL WORKERS (serve paying customers) ───────────────────

// 1. Weekly Ranking Snapshots (Sunday 11 PM UTC = 6 PM ET)
// The data foundation. Without fresh snapshots, scores and emails use stale data.
const weeklyRankingSnapshotWorker = new Worker(
  "minds-weekly-ranking-snapshot",
  async () => { await generateAllSnapshots(); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 2. Weekly Score Recalculation (Monday 3 AM UTC = Sunday 10 PM ET)
// Recalculates scores using fresh snapshot data. Runs before Monday email.
const weeklyScoreRecalcWorker = new Worker(
  "minds-weekly-score-recalc",
  async (job) => { await processWeeklyScoreRecalc(job); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 3. Monday Email (every hour on Mondays, timezone-aware)
// THE product. Sends to orgs whose local time = 7 AM.
const mondayEmailWorker = new Worker(
  "minds-monday-email",
  async (job) => { await processMondayEmail(job); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 4. Daily Review Sync (4 AM UTC daily)
// Fetches GBP reviews for all connected locations.
const reviewSyncWorker = new Worker(
  "minds-review-sync",
  async (job) => { await processReviewSync(job); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 5. Daily Analytics Fetch (5 AM UTC daily)
// Pulls GA4 + GSC data for connected orgs.
const dailyAnalyticsWorker = new Worker(
  "minds-daily-analytics",
  async () => { await fetchAnalyticsForAllOrgs(); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 6. Welcome Intelligence (event-triggered, 4h after signup)
// The second "how did they know?" moment.
const welcomeIntelligenceWorker = new Worker(
  "minds-welcome-intelligence",
  async (job) => { await processWelcomeIntelligence(job); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 7. Instant Snapshot (event-triggered, immediately after signup)
// Fresh data so new customers see readings on first login.
const instantSnapshotWorker = new Worker(
  "minds-instant-snapshot",
  async (job) => {
    const { orgId } = job.data;
    if (orgId) await generateSnapshotForOrg(Number(orgId), true);
  },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 8. Weekly CRO Engine (Sunday 9 PM UTC = 4 PM ET)
// Reads GSC/GA4 data + PatientPath pages, identifies optimization opportunities.
// Runs BEFORE ranking snapshots so recommendations are fresh for Monday email.
const weeklyCROWorker = new Worker(
  "minds-weekly-cro",
  async () => { await runCROForAllOrgs(); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 9. DFY Execution (Mon/Wed/Fri 10 PM UTC = 5 PM ET)
// The autopilot. Drafts GBP posts and CRO changes for owner approval.
// Runs 3x/week so the dashboard always has something ready.
// Dedup built into the engine: won't create new drafts if unexpired ones exist.
const weeklyDFYWorker = new Worker(
  "minds-weekly-dfy",
  async () => { await runDFYForAllOrgs(); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 10. Site QA (event-triggered on publish)
// Runtime gate before any write to website_builder.pages.sections[].
// Shadow mode per org.patientpath_qa_enabled. Blocks publish on defects.
const siteQaWorker = new Worker(
  "minds-site-qa",
  async (job) => { return await processSiteQa(job); },
  { connection, concurrency: 2, prefix: '{minds}' }
);

// 11. Narrator (Manifest v2 Card 3)
// Subscribes to behavioral_events stream, routes to templates, applies
// Theranos guardrail. Shadow mode per org.narrator_enabled; archives every
// output to narrator_outputs regardless. Also handles the weekly Silent
// Quitter sweep (emits its own success/churn events).
const narratorWorker = new Worker(
  "minds-narrator",
  async (job) => { return await processNarratorJob(job); },
  { connection, concurrency: 2, prefix: '{minds}' }
);

// 12. PatientPath Build Orchestrator (Manifest v2 Card 2)
// Consumes clearpath.build_triggered events. Runs Research -> Copy -> QA
// -> direct Adapter write to website_builder.pages.sections[]. N8N is
// retired; this worker does the write. Shadow mode per
// org.patientpath_build_enabled.
const patientpathBuildWorker = new Worker(
  PATIENTPATH_BUILD_QUEUE,
  async (job) => { return await processPatientPathOrchestratorJob(job); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 13. Reveal Choreography (Manifest v2 Card 4)
// Consumes site.published events. Fans out reveal email + Lob postcard +
// dashboard tiles in parallel. Shadow mode per org.reveal_choreography_enabled
// (default false): composes everything, logs to reveal_log, but does NOT call
// Mailgun or Lob. Idempotent per (org_id + site_published_event_id).
const revealChoreographyWorker = new Worker(
  "minds-reveal-choreography",
  async (job) => { return await processRevealChoreography(job); },
  { connection, concurrency: 2, prefix: '{minds}' }
);

// 14. Watcher Agent (Manifest v2 Card 5)
// Hourly per-practice scan: review velocity, GBP completeness, ranking moves,
// competitor activity, Recognition Score regressions.
// Daily cross-practice scan: collisions, milestones, patterns.
// Shadow mode per watcher_agent_enabled flag (default false): scans and archives
// signals but does NOT emit behavioral_events to downstream consumers.
const watcherWorker = new Worker(
  WATCHER_QUEUE_NAME,
  async (job) => { return await processWatcherJob(job); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 15. Weekly Digest (Manifest v2 Card 5 Run 3)
// Monday 2 PM UTC (7 AM Pacific). Per-practice Recognition Tri-Score digest
// composed via Narrator, gated by Freeform Concern Gate. Uses Card 4 email
// stack. Shadow mode per weekly_digest_enabled flag (default false).
const weeklyDigestWorker = new Worker(
  "minds-weekly-digest",
  async (job) => { return await processWeeklyDigest(job); },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 16. Answer Engine: Signal Watcher (GSC) — daily.
// AR-009 Phase 1. Polls GSC per active practice and emits signal_events
// rows on rank/impression/new-query deltas. Trigger Router consumes them.
const answerEngineSignalWatcherWorker = new Worker(
  "minds-answer-engine-signal-watcher-gsc",
  async () => {
    const result = await runSignalWatcher();
    console.log(
      `[AnswerEngine.SignalWatcher.GSC] practices=${result.practicesChecked}, skipped=${result.practicesSkipped}, signals=${result.signalsEmitted}`,
    );
  },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 17. Answer Engine: Trigger Router — every 5 minutes.
// Consumes signal_events processed=false, routes per signal_type, writes
// to State Transition Log + live_activity_entries, marks processed=true.
const answerEngineTriggerRouterWorker = new Worker(
  "minds-answer-engine-trigger-router",
  async () => {
    const result = await runTriggerRouter();
    console.log(
      `[AnswerEngine.TriggerRouter] considered=${result.eventsConsidered}, routed=${result.eventsRouted}, idempotent_skip=${result.eventsSkippedIdempotent}, failed=${result.eventsFailed}`,
    );
  },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// 18. Answer Engine: AEO Monitor (Google AI Overviews) — daily.
// Runs the 25 test queries per active practice via Google AI Overviews,
// records aeo_citations rows, emits signal_events on citation deltas.
const answerEngineAeoMonitorWorker = new Worker(
  "minds-answer-engine-aeo-monitor-google",
  async () => {
    const result = await runAeoMonitor();
    console.log(
      `[AnswerEngine.AeoMonitor.Google] practices=${result.practicesChecked}, queries=${result.queriesChecked}, citations=${result.citationsRecorded}, signals=${result.signalsEmitted}`,
    );
  },
  { connection, concurrency: 1, prefix: '{minds}' }
);

// ─── EVENT HANDLERS ───────────────────────────────────────────────

const activeWorkers = [
  weeklyRankingSnapshotWorker,
  weeklyScoreRecalcWorker,
  mondayEmailWorker,
  reviewSyncWorker,
  dailyAnalyticsWorker,
  welcomeIntelligenceWorker,
  instantSnapshotWorker,
  weeklyCROWorker,
  weeklyDFYWorker,
  siteQaWorker,
  narratorWorker,
  patientpathBuildWorker,
  revealChoreographyWorker,
  watcherWorker,
  weeklyDigestWorker,
  answerEngineSignalWatcherWorker,
  answerEngineTriggerRouterWorker,
  answerEngineAeoMonitorWorker,
];

for (const worker of activeWorkers) {
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

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log("[MINDS-WORKER] Shutting down workers...");
  for (const worker of activeWorkers) {
    await worker.close();
  }
  await closeSharedRedis();
  console.log("[MINDS-WORKER] Workers shut down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─── SCHEDULES ────────────────────────────────────────────────────

async function setupReviewSyncSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("review-sync");
    await queue.add("daily-review-sync", {}, {
      repeat: { pattern: "0 4 * * *", tz: "UTC" },
      jobId: "daily-review-sync",
    });
    console.log("[MINDS-WORKER] Review sync scheduled (4 AM UTC daily)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule review sync:", err);
  }
}

async function setupDailyAnalyticsSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("daily-analytics");
    await queue.add("daily-analytics-fetch", {}, {
      repeat: { pattern: "0 5 * * *", tz: "UTC" },
      jobId: "daily-analytics-fetch",
    });
    console.log("[MINDS-WORKER] Analytics fetch scheduled (5 AM UTC daily)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule analytics fetch:", err);
  }
}

async function setupWeeklyRankingSnapshotSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("weekly-ranking-snapshot");
    await queue.add("weekly-ranking-snapshot", {}, {
      repeat: { pattern: "0 23 * * 0", tz: "UTC" }, // Sunday 11 PM UTC = 6 PM ET
      jobId: "weekly-ranking-snapshot",
    });
    console.log("[MINDS-WORKER] Ranking snapshots scheduled (Sunday 11 PM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule ranking snapshots:", err);
  }
}

async function setupWeeklyScoreRecalcSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("weekly-score-recalc");
    await queue.add("weekly-score-recalc", {}, {
      repeat: { pattern: "0 3 * * 1", tz: "UTC" }, // Monday 3 AM UTC = Sunday 10 PM ET
      jobId: "weekly-score-recalc",
    });
    console.log("[MINDS-WORKER] Score recalc scheduled (Monday 3 AM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule score recalc:", err);
  }
}

async function setupMondayEmailSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("monday-email");
    await queue.add("weekly-monday-email", {}, {
      repeat: { pattern: "0 * * * 1", tz: "UTC" }, // Every hour on Mondays
      jobId: "weekly-monday-email",
    });
    console.log("[MINDS-WORKER] Monday email scheduled (hourly on Mondays)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule Monday email:", err);
  }
}

async function setupWeeklyCROSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("weekly-cro");
    await queue.add("weekly-cro", {}, {
      repeat: { pattern: "0 21 * * 0", tz: "UTC" }, // Sunday 9 PM UTC = 4 PM ET, before snapshots
      jobId: "weekly-cro",
    });
    console.log("[MINDS-WORKER] CRO engine scheduled (Sunday 9 PM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule CRO engine:", err);
  }
}

async function setupWeeklyDFYSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("weekly-dfy");
    await queue.add("weekly-dfy", {}, {
      repeat: { pattern: "0 22 * * 1,3,5", tz: "UTC" }, // Mon/Wed/Fri 10 PM UTC = 5 PM ET
      jobId: "weekly-dfy",
    });
    console.log("[MINDS-WORKER] DFY engine scheduled (Mon/Wed/Fri 10 PM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule DFY engine:", err);
  }
}

async function setupWatcherHourlySchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("watcher");
    await queue.add("hourly-practice-scan", { type: "hourly-practice-scan" }, {
      repeat: { pattern: "0 * * * *", tz: "UTC" }, // Every hour on the hour
      jobId: "watcher-hourly-scan",
    });
    console.log("[MINDS-WORKER] Watcher hourly scan scheduled (every hour)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule watcher hourly scan:", err);
  }
}

async function setupWatcherDailySchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("watcher");
    await queue.add("daily-cross-practice-scan", { type: "daily-cross-practice-scan" }, {
      repeat: { pattern: "0 6 * * *", tz: "UTC" }, // Daily 6 AM UTC = 1 AM ET
      jobId: "watcher-daily-scan",
    });
    console.log("[MINDS-WORKER] Watcher daily scan scheduled (6 AM UTC daily)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule watcher daily scan:", err);
  }
}

async function setupAnswerEngineSignalWatcherSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("answer-engine-signal-watcher-gsc");
    await queue.add(
      "answerEngine:signalWatcher:gsc",
      {},
      {
        repeat: { pattern: "0 8 * * *", tz: "UTC" }, // Daily 8 AM UTC = 1 AM Pacific
        jobId: "answerEngine-signalWatcher-gsc",
      },
    );
    console.log("[MINDS-WORKER] Answer Engine Signal Watcher (GSC) scheduled (8 AM UTC daily)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule answer engine signal watcher:", err);
  }
}

async function setupAnswerEngineTriggerRouterSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("answer-engine-trigger-router");
    await queue.add(
      "answerEngine:triggerRouter",
      {},
      {
        repeat: { pattern: "*/5 * * * *", tz: "UTC" }, // Every 5 minutes
        jobId: "answerEngine-triggerRouter",
      },
    );
    console.log("[MINDS-WORKER] Answer Engine Trigger Router scheduled (every 5 min)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule answer engine trigger router:", err);
  }
}

async function setupAnswerEngineAeoMonitorSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("answer-engine-aeo-monitor-google");
    await queue.add(
      "answerEngine:aeoMonitor:google",
      {},
      {
        repeat: { pattern: "0 9 * * *", tz: "UTC" }, // Daily 9 AM UTC = 2 AM Pacific
        jobId: "answerEngine-aeoMonitor-google",
      },
    );
    console.log("[MINDS-WORKER] Answer Engine AEO Monitor (Google) scheduled (9 AM UTC daily)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule answer engine AEO monitor:", err);
  }
}

async function setupWeeklyDigestSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("weekly-digest");
    await queue.add("weekly-digest", {}, {
      repeat: { pattern: "0 14 * * 1", tz: "UTC" }, // Monday 2 PM UTC = 7 AM Pacific
      jobId: "weekly-digest",
    });
    console.log("[MINDS-WORKER] Weekly digest scheduled (Monday 2 PM UTC / 7 AM Pacific)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to schedule weekly digest:", err);
  }
}

// Start schedules
setupReviewSyncSchedule();
setupDailyAnalyticsSchedule();
setupWeeklyCROSchedule();
setupWeeklyDFYSchedule();
setupWeeklyRankingSnapshotSchedule();
setupWeeklyScoreRecalcSchedule();
setupMondayEmailSchedule();
setupWatcherHourlySchedule();
setupWatcherDailySchedule();
setupWeeklyDigestSchedule();
setupAnswerEngineSignalWatcherSchedule();
setupAnswerEngineTriggerRouterSchedule();
setupAnswerEngineAeoMonitorSchedule();

console.log("[MINDS-WORKER] Essential 9 + Watcher + Digest workers running. Waiting for jobs...");

// ─── DISABLED WORKERS ─────────────────────────────────────────────
// These workers are not serving paying customers today.
// Re-enable when the feature is verified and needed.
//
// Scrape & Compare:        processScrapeCompare        (minds-scrape-compare)
// Compile & Publish:       processCompilePublish       (minds-compile-publish)
// Discovery:               processDiscovery            (minds-discovery, daily 6 AM UTC)
// Skill Trigger:           processSkillTrigger         (minds-skill-triggers, every 5 min)
// Dead Letter Check:       processDeadLetterCheck      (minds-skill-triggers, every 10 min)
// Works Digest:            processWorksDigest          (minds-works-digest, weekly Sun 3 AM)
// SEO Bulk Generate:       processSeoBulkGenerate      (minds-seo-bulk-generate)
// Scheduler Tick:          processSchedulerTick        (minds-scheduler, every 60s)
// Website Backup:          processWebsiteBackup        (wb-backup)
// Website Restore:         processWebsiteRestore       (wb-restore)
// PM Daily Brief:          processPmDailyBrief         (pm-daily-brief, daily 10 PM UTC)
// Dreamweaver:             runDreamweaver              (minds-dreamweaver, daily 6 AM UTC)
// Collective Intelligence: runCollectiveIntelligence   (minds-collective-intelligence, weekly)
// Product Evolution:       runProductEvolution         (minds-product-evolution, weekly)
// Feedback Loop:           processFeedbackLoop         (minds-feedback-loop, Tue 3 PM UTC)
