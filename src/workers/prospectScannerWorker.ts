/**
 * Manifest v2 Card 6 (Sales Agent Brick 1) — Prospect Scanner worker.
 *
 * Job type: "daily-prospect-scan". Runs once daily.
 *
 * Iterates every vertical in the ICP, discovers candidates via Google
 * Places, runs Recognition Tri-Score, applies disqualifiers, and inserts
 * passing candidates into `prospects`. Then rescans existing
 * candidate/flagged prospects on a 7-day cadence.
 *
 * Shadow mode (prospect_scanner_enabled=false): scoring + discovery still
 * run, telemetry is logged via SCANNER_STARTED/COMPLETED, but no rows are
 * written and no PROSPECT_IDENTIFIED events are emitted.
 */

import type { Job } from "bullmq";
import { runProspectScan } from "../services/sales/prospectScanner";
import type { ProspectScanResult } from "../services/sales/prospectScanner";

export const PROSPECT_SCANNER_QUEUE_NAME = "minds-prospect-scanner";

export interface ProspectScannerJobData {
  type: "daily-prospect-scan";
}

export interface ProspectScannerJobResult {
  type: string;
  mode: string;
  candidatesDiscovered: number;
  newProspects: number;
  rescannedProspects: number;
  scoreChangeEvents: number;
  durationMs: number;
  error?: string;
}

export async function processProspectScannerJob(
  job: Job<ProspectScannerJobData>
): Promise<ProspectScannerJobResult> {
  const { type } = job.data;
  if (type !== "daily-prospect-scan") {
    throw new Error(`[PROSPECT-SCANNER] Unknown job type: ${type}`);
  }

  const start = Date.now();
  console.log("[PROSPECT-SCANNER] Daily prospect scan starting...");

  try {
    const result: ProspectScanResult = await runProspectScan();
    console.log(
      `[PROSPECT-SCANNER] Daily scan complete (${result.mode}): ` +
        `${result.verticalsScanned.length} verticals, ` +
        `${result.candidatesDiscovered} discovered, ` +
        `${result.newProspects} new, ` +
        `${result.rescannedProspects} rescanned, ` +
        `${result.scoreChangeEvents} score-shift events, ` +
        `${result.disqualifiedCount} disqualified, ` +
        `${result.durationMs}ms`
    );

    return {
      type: "daily-prospect-scan",
      mode: result.mode,
      candidatesDiscovered: result.candidatesDiscovered,
      newProspects: result.newProspects,
      rescannedProspects: result.rescannedProspects,
      scoreChangeEvents: result.scoreChangeEvents,
      durationMs: result.durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PROSPECT-SCANNER] Daily scan failed:", message);
    return {
      type: "daily-prospect-scan",
      mode: "error",
      candidatesDiscovered: 0,
      newProspects: 0,
      rescannedProspects: 0,
      scoreChangeEvents: 0,
      durationMs: Date.now() - start,
      error: message,
    };
  }
}
