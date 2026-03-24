/**
 * Partner Portal API
 *
 * GET /api/partner/portfolio — practices referred by this partner
 * GET /api/partner/performance — referral code performance stats
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../middleware/rbac";
import { db } from "../database/connection";

const partnerRoutes = express.Router();

/**
 * Middleware: verify the user's org has partner_type set
 */
async function requirePartner(req: RBACRequest, res: express.Response, next: express.NextFunction) {
  if (!req.organizationId) {
    return res.status(403).json({ success: false, error: "No organization" });
  }
  const org = await db("organizations").where({ id: req.organizationId }).first();
  if (!org?.partner_type) {
    return res.status(403).json({ success: false, error: "Not a partner account" });
  }
  (req as any).partnerOrg = org;
  next();
}

/**
 * GET /api/partner/portfolio
 *
 * Returns all practices referred by this partner via referral_code.
 */
partnerRoutes.get(
  "/portfolio",
  authenticateToken,
  rbacMiddleware,
  requirePartner,
  async (req: RBACRequest, res) => {
    try {
      const partnerOrg = (req as any).partnerOrg;

      // Find all orgs referred by this partner
      const referredOrgs = await db("organizations")
        .where({ referred_by_org_id: partnerOrg.id })
        .select(
          "id", "name", "domain", "organization_type", "subscription_status",
          "subscription_tier", "created_at",
        );

      // Enrich each with latest ranking data
      const portfolio = await Promise.all(
        referredOrgs.map(async (org: any) => {
          const latestRanking = await db("practice_rankings")
            .where({ organization_id: org.id, status: "completed" })
            .orderBy("created_at", "desc")
            .first();

          const previousRanking = await db("practice_rankings")
            .where({ organization_id: org.id, status: "completed" })
            .orderBy("created_at", "desc")
            .offset(1)
            .first();

          // Get primary location for city/specialty
          const primaryLoc = await db("locations")
            .where({ organization_id: org.id, is_primary: true })
            .first();

          return {
            id: org.id,
            name: org.name,
            city: primaryLoc?.city || primaryLoc?.name || null,
            specialty: primaryLoc?.specialty || org.organization_type || null,
            score: latestRanking?.rank_score ? Number(latestRanking.rank_score) : null,
            previousScore: previousRanking?.rank_score ? Number(previousRanking.rank_score) : null,
            rankPosition: latestRanking?.rank_position || null,
            subscriptionStatus: org.subscription_status,
            subscriptionTier: org.subscription_tier,
            createdAt: org.created_at,
            hasWebsite: false, // TODO: check website_projects
          };
        }),
      );

      // Aggregate stats
      const totalMRR = referredOrgs.filter(
        (o: any) => o.subscription_status === "active",
      ).length * 150; // estimate

      const avgScore = portfolio.filter((p) => p.score).length > 0
        ? Math.round(
            portfolio.filter((p) => p.score).reduce((s, p) => s + (p.score || 0), 0) /
            portfolio.filter((p) => p.score).length,
          )
        : null;

      return res.json({
        success: true,
        portfolio,
        stats: {
          totalReferred: portfolio.length,
          totalMRR,
          avgScore,
          referralCode: partnerOrg.referral_code,
        },
      });
    } catch (error: any) {
      console.error("[Partner] Portfolio error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load portfolio" });
    }
  },
);

/**
 * GET /api/partner/performance
 *
 * Referral code performance: scans, conversions, MRR.
 */
partnerRoutes.get(
  "/performance",
  authenticateToken,
  rbacMiddleware,
  requirePartner,
  async (req: RBACRequest, res) => {
    try {
      const partnerOrg = (req as any).partnerOrg;
      const code = partnerOrg.referral_code;

      // Count checkup scans with this ref code
      const scanCount = await db("behavioral_events")
        .where("event_type", "checkup.started")
        .whereRaw("properties->>'ref_code' = ?", [code])
        .count("* as count")
        .first();

      // Count email captures with this ref code
      const captureCount = await db("behavioral_events")
        .where("event_type", "checkup.email_captured")
        .whereRaw("properties->>'ref_code' = ?", [code])
        .count("* as count")
        .first();

      // Count orgs that were referred
      const conversionCount = await db("organizations")
        .where({ referred_by_org_id: partnerOrg.id })
        .count("* as count")
        .first();

      // Active subscriptions from referred orgs
      const activeCount = await db("organizations")
        .where({ referred_by_org_id: partnerOrg.id, subscription_status: "active" })
        .count("* as count")
        .first();

      return res.json({
        success: true,
        performance: {
          referralCode: code,
          totalScans: parseInt((scanCount as any)?.count || "0", 10),
          emailsCaptured: parseInt((captureCount as any)?.count || "0", 10),
          accountsCreated: parseInt((conversionCount as any)?.count || "0", 10),
          activeSubscriptions: parseInt((activeCount as any)?.count || "0", 10),
          estimatedMRR: parseInt((activeCount as any)?.count || "0", 10) * 150,
        },
      });
    } catch (error: any) {
      console.error("[Partner] Performance error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load performance" });
    }
  },
);

export default partnerRoutes;
