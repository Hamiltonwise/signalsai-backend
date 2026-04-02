/**
 * Admin Metrics API -- Pre-computed business metrics for all admin dashboards.
 *
 * Every admin page calls this instead of computing MRR/health/counts locally.
 * The single source of truth is src/services/businessMetrics.ts.
 */

import { Router, Request, Response } from "express";
import { db } from "../../database/connection";
import { getMRRBreakdown, MONTHLY_BURN } from "../../services/businessMetrics";

const router = Router();

/**
 * GET /api/admin/metrics
 *
 * Returns pre-computed MRR breakdown, org counts, and health summary.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const orgs = await db("organizations")
      .select("id", "name", "subscription_status", "subscription_tier", "client_health_status", "created_at");

    const activeOrgs = orgs.filter(
      (o: any) => o.subscription_status === "active" || o.subscription_tier
    );

    const mrr = getMRRBreakdown(activeOrgs);

    // Health summary
    const healthCounts = { green: 0, amber: 0, red: 0 };
    for (const org of orgs) {
      const h = (org as any).client_health_status;
      if (h === "red") healthCounts.red++;
      else if (h === "amber") healthCounts.amber++;
      else healthCounts.green++;
    }

    // Growth: orgs created this month vs last month
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisMonthOrgs = activeOrgs.filter((o: any) => {
      const d = new Date(o.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === now.getFullYear();
    });
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastMonthOrgs = activeOrgs.filter((o: any) => {
      const d = new Date(o.created_at);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    });

    res.json({
      mrr: {
        total: mrr.total,
        byOrg: mrr.byOrg,
        burn: mrr.burn,
        delta: mrr.delta,
        isProfitable: mrr.isProfitable,
        payingCount: mrr.payingCount,
      },
      health: healthCounts,
      orgCount: {
        total: orgs.length,
        active: activeOrgs.length,
        growth: thisMonthOrgs.length - lastMonthOrgs.length,
      },
    });
  } catch (err: any) {
    console.error("[AdminMetrics] Error:", err.message);
    res.status(500).json({ error: "Failed to compute metrics" });
  }
});

export default router;
