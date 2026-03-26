import express, { Request, Response } from "express";
import { db } from "../../database/connection";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

// ── GET /api/admin/case-studies ──────────────────────────────────
router.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req: Request, res: Response) => {
    try {
      const studies = await db("case_studies").orderBy("created_at", "desc");
      return res.json({ success: true, case_studies: studies });
    } catch (err: any) {
      console.error("[CASE-STUDIES] List error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

// ── POST /api/admin/case-studies ─────────────────────────────────
router.post(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const {
        practice_name,
        specialty,
        city,
        state,
        starting_position,
        ending_position,
        starting_review_count,
        ending_review_count,
        timeframe_weeks,
        revenue_impact,
        doctor_quote,
        is_anonymous,
        org_id,
      } = req.body;

      if (!practice_name) {
        return res.status(400).json({ success: false, error: "practice_name is required" });
      }

      const [study] = await db("case_studies")
        .insert({
          practice_name,
          specialty: specialty || null,
          city: city || null,
          state: state || null,
          starting_position: starting_position ?? null,
          ending_position: ending_position ?? null,
          starting_review_count: starting_review_count ?? null,
          ending_review_count: ending_review_count ?? null,
          timeframe_weeks: timeframe_weeks ?? null,
          revenue_impact: revenue_impact || null,
          doctor_quote: doctor_quote || null,
          is_anonymous: is_anonymous ?? false,
          org_id: org_id ?? null,
        })
        .returning("*");

      return res.status(201).json({ success: true, case_study: study });
    } catch (err: any) {
      console.error("[CASE-STUDIES] Create error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

// ── PATCH /api/admin/case-studies/:id ────────────────────────────
router.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const count = await db("case_studies").where({ id }).update(updates);
      if (count === 0) {
        return res.status(404).json({ success: false, error: "Case study not found" });
      }

      const study = await db("case_studies").where({ id }).first();
      return res.json({ success: true, case_study: study });
    } catch (err: any) {
      console.error("[CASE-STUDIES] Update error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

// ── PATCH /api/admin/case-studies/:id/publish ────────────────────
router.patch(
  "/:id/publish",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const count = await db("case_studies")
        .where({ id })
        .update({ is_published: true });

      if (count === 0) {
        return res.status(404).json({ success: false, error: "Case study not found" });
      }

      const study = await db("case_studies").where({ id }).first();
      return res.json({ success: true, case_study: study });
    } catch (err: any) {
      console.error("[CASE-STUDIES] Publish error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

// T2 registers routes in src/index.ts
export default router;
