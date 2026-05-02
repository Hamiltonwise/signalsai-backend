/**
 * Live Activity Feed API.
 *
 * GET /api/live-activity/:practiceId
 *   Returns the latest 50 visible-to-doctor entries for the practice,
 *   sorted desc by created_at. Phase 1 endpoint; Phase 4 wires the UI
 *   that consumes it.
 *
 * Auth: this route follows the existing public-by-default pattern of
 * other admin routes (auth middleware sits on /api/admin/*). For Phase 1,
 * any caller with the practiceId can read the feed; production gating
 * lands in Phase 4 alongside the UI surface.
 */

import express, { type Request, type Response } from "express";
import { listLiveActivityEntries } from "../services/answerEngine/liveActivity";

const router = express.Router();

router.get("/:practiceId", async (req: Request, res: Response) => {
  const id = Number(req.params.practiceId);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "practiceId must be a positive integer" });
    return;
  }
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
    res.json({ practiceId: id, count: entries.length, entries });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LiveActivity] GET /${id} failed: ${message}`);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
