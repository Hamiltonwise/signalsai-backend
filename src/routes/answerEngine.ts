/**
 * Answer Engine API (Continuous Answer Engine Loop, Phase 4).
 *
 * Reads the three doctor-facing surfaces:
 *   - GET /api/answer-engine/:practiceId/live-activity  -- last 50 entries
 *   - GET /api/answer-engine/:practiceId/ai-visibility  -- 25 queries x 6 platforms
 *   - GET /api/answer-engine/:practiceId/watching       -- active signal_events not yet processed
 *
 * Feature-flag gated by `answer_engine` (per-org enable). Disabled
 * orgs receive 403 with a doctor-readable message rather than 404.
 */

import express, { type Request, type Response } from "express";
import { db } from "../database/connection";
import { listLiveActivityEntries } from "../services/answerEngine/liveActivity";
import { isEnabled } from "../services/featureFlags";
import type { AeoPlatform } from "../services/answerEngine/types";

const router = express.Router();

const ALL_PLATFORMS: AeoPlatform[] = [
  "google_ai_overviews",
  "chatgpt",
  "perplexity",
  "claude",
  "gemini",
  "siri",
];

// ── Middleware: feature flag gate ──────────────────────────────────

async function requireAnswerEngineEnabled(
  req: Request,
  res: Response,
  next: express.NextFunction,
): Promise<void> {
  const id = Number(req.params.practiceId);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "practiceId must be a positive integer" });
    return;
  }
  const enabled = await isEnabled("answer_engine", id);
  if (!enabled) {
    res.status(403).json({
      error: "answer_engine_not_enabled",
      message: "The Answer Engine module is not yet active for this practice.",
    });
    return;
  }
  (req as Request & { practiceId: number }).practiceId = id;
  next();
}

// ── GET /:practiceId/live-activity ─────────────────────────────────

router.get(
  "/:practiceId/live-activity",
  requireAnswerEngineEnabled,
  async (req: Request, res: Response) => {
    const id = (req as Request & { practiceId: number }).practiceId;
    const limitRaw = req.query.limit;
    let limit = 50;
    if (typeof limitRaw === "string") {
      const parsed = Number(limitRaw);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 200) {
        limit = parsed;
      }
    }

    try {
      const entries = await listLiveActivityEntries({
        practice_id: id,
        limit,
        visibleOnly: true,
      });
      const grouped = groupEntriesByDay(entries);
      res.json({
        success: true,
        practiceId: id,
        count: entries.length,
        entries,
        grouped,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AnswerEngine] live-activity ${id} failed: ${message}`);
      res.status(500).json({ success: false, error: "internal error" });
    }
  },
);

// ── GET /:practiceId/ai-visibility ─────────────────────────────────

router.get(
  "/:practiceId/ai-visibility",
  requireAnswerEngineEnabled,
  async (req: Request, res: Response) => {
    const id = (req as Request & { practiceId: number }).practiceId;

    try {
      const queries = await db("aeo_test_queries")
        .select("query", "specialty", "vertical")
        .where("active", true)
        .orderBy("query");

      const latestRows = await db("aeo_citations")
        .where("practice_id", id)
        .select("query", "platform", "cited", "competitor_cited", "citation_url", "checked_at")
        .orderBy("checked_at", "desc");

      // Map: query -> platform -> latest row (deduped client-side).
      const grid: Record<string, Record<string, AiVisibilityCell>> = {};
      for (const q of queries) {
        grid[q.query] = {};
        for (const platform of ALL_PLATFORMS) {
          grid[q.query][platform] = {
            status: "not_polled",
            cited: false,
            competitor: null,
            citation_url: null,
            checked_at: null,
          };
        }
      }
      for (const row of latestRows) {
        const slot = grid[row.query]?.[row.platform];
        if (!slot || slot.status !== "not_polled") continue;
        slot.status = row.cited
          ? "cited"
          : row.competitor_cited
            ? "competitor"
            : "not_appearing";
        slot.cited = !!row.cited;
        slot.competitor = row.competitor_cited ?? null;
        slot.citation_url = row.citation_url ?? null;
        slot.checked_at = row.checked_at;
      }

      const summary = computeVisibilitySummary(grid);

      res.json({
        success: true,
        practiceId: id,
        platforms: ALL_PLATFORMS,
        queries: queries.map((q) => q.query),
        grid,
        summary,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AnswerEngine] ai-visibility ${id} failed: ${message}`);
      res.status(500).json({ success: false, error: "internal error" });
    }
  },
);

// ── GET /:practiceId/watching ──────────────────────────────────────

router.get(
  "/:practiceId/watching",
  requireAnswerEngineEnabled,
  async (req: Request, res: Response) => {
    const id = (req as Request & { practiceId: number }).practiceId;

    try {
      const rows = await db("signal_events")
        .where("practice_id", id)
        .andWhere("processed", false)
        .orderBy("created_at", "desc")
        .limit(20)
        .select("id", "signal_type", "severity", "signal_data", "created_at");

      const watching = rows.map((r) => ({
        id: r.id,
        signal_type: r.signal_type,
        severity: r.severity,
        created_at: r.created_at,
        signal_data:
          typeof r.signal_data === "string" ? JSON.parse(r.signal_data) : r.signal_data,
      }));

      res.json({
        success: true,
        practiceId: id,
        count: watching.length,
        watching,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AnswerEngine] watching ${id} failed: ${message}`);
      res.status(500).json({ success: false, error: "internal error" });
    }
  },
);

// ── Helpers ────────────────────────────────────────────────────────

interface AiVisibilityCell {
  status: "cited" | "competitor" | "not_appearing" | "not_polled";
  cited: boolean;
  competitor: string | null;
  citation_url: string | null;
  checked_at: string | null;
}

function computeVisibilitySummary(
  grid: Record<string, Record<string, AiVisibilityCell>>,
): {
  citedCount: number;
  competitorCount: number;
  notAppearingCount: number;
  notPolledCount: number;
  totalCells: number;
} {
  let citedCount = 0;
  let competitorCount = 0;
  let notAppearingCount = 0;
  let notPolledCount = 0;
  let totalCells = 0;

  for (const row of Object.values(grid)) {
    for (const cell of Object.values(row)) {
      totalCells += 1;
      if (cell.status === "cited") citedCount += 1;
      else if (cell.status === "competitor") competitorCount += 1;
      else if (cell.status === "not_appearing") notAppearingCount += 1;
      else notPolledCount += 1;
    }
  }
  return { citedCount, competitorCount, notAppearingCount, notPolledCount, totalCells };
}

/**
 * Group entries into Today / Yesterday / This Week / Earlier buckets.
 * Comparison uses the server's local date semantics; the frontend
 * displays relative timestamps within each bucket.
 */
function groupEntriesByDay(
  entries: Array<{ created_at: string }>,
): {
  today: number[];
  yesterday: number[];
  thisWeek: number[];
  earlier: number[];
} {
  const buckets = { today: [] as number[], yesterday: [] as number[], thisWeek: [] as number[], earlier: [] as number[] };
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - 7);

  entries.forEach((entry, idx) => {
    const t = new Date(entry.created_at).getTime();
    if (t >= startOfToday.getTime()) buckets.today.push(idx);
    else if (t >= startOfYesterday.getTime()) buckets.yesterday.push(idx);
    else if (t >= startOfThisWeek.getTime()) buckets.thisWeek.push(idx);
    else buckets.earlier.push(idx);
  });

  return buckets;
}

export default router;
