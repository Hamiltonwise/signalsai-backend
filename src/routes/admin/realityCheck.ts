/**
 * Customer Reality Check API
 *
 * GET /api/admin/reality-check          -- all active customers
 * GET /api/admin/reality-check/:orgId   -- single org
 *
 * Per-org, per-page pass/fail. Answers: "Would this embarrass us right now?"
 * Admin only. No auth/billing/data changes. Pure read.
 */

import { Router, type Request, type Response } from "express";
import { runRealityCheck, runAllCustomerChecks } from "../../services/customerRealityCheck";

const router = Router();

// All customers
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await runAllCustomerChecks();
    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

// Single org
router.get("/:orgId", async (req: Request, res: Response) => {
  try {
    const orgId = Number(req.params.orgId);
    if (!orgId || isNaN(orgId)) {
      return res.status(400).json({ success: false, error: "Invalid orgId" });
    }
    const result = await runRealityCheck(orgId);
    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

export default router;
