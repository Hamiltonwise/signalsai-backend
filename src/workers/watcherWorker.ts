/**
 * Manifest v2 Card 5 — Watcher Agent worker.
 *
 * Two job types:
 *   1. "hourly-practice-scan" — runs per-org every hour
 *   2. "daily-cross-practice-scan" — runs once daily across all orgs
 *
 * The hourly scan iterates all active orgs and runs runHourlyScan for each.
 * The daily scan calls runDailyScan which handles cross-practice analysis.
 */

import type { Job } from "bullmq";
import { db } from "../database/connection";
import { BehavioralEventModel } from "../models/BehavioralEventModel";
import {
  runHourlyScan,
  runDailyScan,
} from "../services/watcher/watcherAgent";
import type {
  HourlyScanResult,
  DailyScanResult,
} from "../services/watcher/watcherAgent";
import {
  WATCHER_HOURLY_SCAN_STARTED,
  WATCHER_HOURLY_SCAN_COMPLETED,
  WATCHER_DAILY_SCAN_STARTED,
  WATCHER_DAILY_SCAN_COMPLETED,
} from "../constants/eventTypes";

export const WATCHER_QUEUE_NAME = "minds-watcher";

export interface WatcherHourlyJobData {
  type: "hourly-practice-scan";
}

export interface WatcherDailyJobData {
  type: "daily-cross-practice-scan";
}

export type WatcherJobData = WatcherHourlyJobData | WatcherDailyJobData;

export interface WatcherJobResult {
  type: string;
  orgCount: number;
  totalSignals: number;
  durationMs: number;
  error?: string;
}

export async function processWatcherJob(
  job: Job<WatcherJobData>
): Promise<WatcherJobResult> {
  const { type } = job.data;

  if (type === "hourly-practice-scan") {
    return processHourlyScan();
  }

  if (type === "daily-cross-practice-scan") {
    return processDailyScan();
  }

  throw new Error(`[WATCHER] Unknown job type: ${type}`);
}

async function processHourlyScan(): Promise<WatcherJobResult> {
  const start = Date.now();
  console.log("[WATCHER] Hourly per-practice scan starting...");

  await BehavioralEventModel.create({
    event_type: WATCHER_HOURLY_SCAN_STARTED,
    properties: { started_at: new Date().toISOString() },
  }).catch(() => {});

  try {
    const orgs = await db("organizations")
      .whereNull("deleted_at")
      .select("id");

    let totalSignals = 0;
    const results: HourlyScanResult[] = [];

    for (const org of orgs) {
      try {
        const result = await runHourlyScan(org.id);
        results.push(result);
        totalSignals += result.signals.length;
      } catch (err) {
        console.warn(
          `[WATCHER] Hourly scan failed for org ${org.id}:`,
          err
        );
      }
    }

    const durationMs = Date.now() - start;

    await BehavioralEventModel.create({
      event_type: WATCHER_HOURLY_SCAN_COMPLETED,
      properties: {
        org_count: orgs.length,
        total_signals: totalSignals,
        duration_ms: durationMs,
      },
    }).catch(() => {});

    console.log(
      `[WATCHER] Hourly scan complete: ${orgs.length} orgs, ${totalSignals} signals, ${durationMs}ms`
    );

    return {
      type: "hourly-practice-scan",
      orgCount: orgs.length,
      totalSignals,
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[WATCHER] Hourly scan failed:", message);
    return {
      type: "hourly-practice-scan",
      orgCount: 0,
      totalSignals: 0,
      durationMs: Date.now() - start,
      error: message,
    };
  }
}

async function processDailyScan(): Promise<WatcherJobResult> {
  const start = Date.now();
  console.log("[WATCHER] Daily cross-practice scan starting...");

  await BehavioralEventModel.create({
    event_type: WATCHER_DAILY_SCAN_STARTED,
    properties: { started_at: new Date().toISOString() },
  }).catch(() => {});

  try {
    const result: DailyScanResult = await runDailyScan();
    const durationMs = Date.now() - start;

    await BehavioralEventModel.create({
      event_type: WATCHER_DAILY_SCAN_COMPLETED,
      properties: {
        org_count: result.orgIds.length,
        total_signals: result.signals.length,
        duration_ms: durationMs,
      },
    }).catch(() => {});

    console.log(
      `[WATCHER] Daily scan complete: ${result.orgIds.length} orgs, ${result.signals.length} signals, ${durationMs}ms`
    );

    return {
      type: "daily-cross-practice-scan",
      orgCount: result.orgIds.length,
      totalSignals: result.signals.length,
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[WATCHER] Daily scan failed:", message);
    return {
      type: "daily-cross-practice-scan",
      orgCount: 0,
      totalSignals: 0,
      durationMs: Date.now() - start,
      error: message,
    };
  }
}
