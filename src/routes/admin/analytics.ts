/**
 * Analytics API -- GA4 + GSC data for admin dashboard
 *
 * GET  /api/admin/analytics/:orgId       -- Fetch latest analytics for an org
 * POST /api/admin/analytics/fetch-all    -- Trigger fetch for all connected orgs
 * GET  /api/admin/analytics/:orgId/ga4   -- GA4 data only
 * GET  /api/admin/analytics/:orgId/gsc   -- GSC data only
 */

import { Router, type Request, type Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import {
  fetchGA4Data,
  fetchGSCData,
  fetchAndStoreAnalytics,
  fetchAnalyticsForAllOrgs,
} from "../../services/analyticsService";

const router = Router();

// Get latest analytics for a specific org
router.get("/:orgId", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId);
    const [ga4, gsc] = await Promise.all([
      fetchGA4Data(orgId),
      fetchGSCData(orgId),
    ]);

    res.json({
      success: true,
      orgId,
      ga4: ga4 || null,
      gsc: gsc || null,
      hasGA4: !!ga4,
      hasGSC: !!gsc,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// GA4 only
router.get("/:orgId/ga4", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId);
    const daysBack = parseInt(req.query.days as string) || 30;
    const data = await fetchGA4Data(orgId, daysBack);
    res.json({ success: true, orgId, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// GSC only
router.get("/:orgId/gsc", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId);
    const daysBack = parseInt(req.query.days as string) || 30;
    const data = await fetchGSCData(orgId, daysBack);
    res.json({ success: true, orgId, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// Fetch and store for all connected orgs
router.post("/fetch-all", authenticateToken, superAdminMiddleware, async (_req: Request, res: Response) => {
  try {
    const result = await fetchAnalyticsForAllOrgs();
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
