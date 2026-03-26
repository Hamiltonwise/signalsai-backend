/**
 * Intelligence API -- Practice owner view of SEO/AEO/CRO data (WO-8)
 *
 * GET /api/intelligence/seo     -- latest SEO audit for the user's org
 * GET /api/intelligence/aeo     -- FAQ content for the user's org
 * GET /api/intelligence/cro     -- CRO experiments for the user's org
 * GET /api/intelligence/summary -- combined Intelligence Score
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { db } from "../database/connection";

const intelligenceRoutes = express.Router();

function getOrgId(req: express.Request): number | null {
  const user = (req as any).user;
  return user?.organizationId || user?.organization_id || null;
}

// Combined Intelligence Score summary
intelligenceRoutes.get("/summary", authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const seoAudit = await db("patientpath_seo_audits")
      .where({ organization_id: orgId })
      .orderBy("audited_at", "desc")
      .first()
      .catch(() => null);

    const faqCount = await db("patientpath_faq_content")
      .where({ organization_id: orgId, status: "published" })
      .count("id as count")
      .first()
      .catch(() => null);

    const activeCro = await db("cro_experiments")
      .where({ organization_id: orgId, concluded: false })
      .count("id as count")
      .first()
      .catch(() => null);

    const seoScore = seoAudit?.seo_score ?? null;
    const aeoScore = Number(faqCount?.count || 0) > 0 ? 100 : 0;
    const croActive = Number(activeCro?.count || 0) > 0;

    // Intelligence Score: weighted average of what's available
    let intelligenceScore: number | null = null;
    if (seoScore !== null) {
      const components = [seoScore * 0.5, aeoScore * 0.3, (croActive ? 100 : 0) * 0.2];
      intelligenceScore = Math.round(components.reduce((a, b) => a + b, 0));
    }

    return res.json({
      intelligenceScore,
      seoScore,
      seoScoreDelta: seoAudit?.score_delta ?? null,
      aeoFaqCount: Number(faqCount?.count || 0),
      croExperimentsActive: Number(activeCro?.count || 0),
      lastAudit: seoAudit?.audited_at ?? null,
    });
  } catch (err) {
    console.error("[Intelligence] Summary error:", err);
    return res.status(500).json({ error: "Failed to load intelligence summary" });
  }
});

// SEO audit data
intelligenceRoutes.get("/seo", authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const audits = await db("patientpath_seo_audits")
      .where({ organization_id: orgId })
      .orderBy("audited_at", "desc")
      .limit(10);

    return res.json({ audits });
  } catch (err) {
    console.error("[Intelligence] SEO error:", err);
    return res.status(500).json({ error: "Failed to load SEO data" });
  }
});

// AEO FAQ content
intelligenceRoutes.get("/aeo", authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const faqs = await db("patientpath_faq_content")
      .where({ organization_id: orgId })
      .orderBy("created_at", "asc");

    return res.json({ faqs });
  } catch (err) {
    console.error("[Intelligence] AEO error:", err);
    return res.status(500).json({ error: "Failed to load AEO data" });
  }
});

// CRO experiments
intelligenceRoutes.get("/cro", authenticateToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const experiments = await db("cro_experiments")
      .where({ organization_id: orgId })
      .orderBy("started_at", "desc");

    return res.json({ experiments });
  } catch (err) {
    console.error("[Intelligence] CRO error:", err);
    return res.status(500).json({ error: "Failed to load CRO data" });
  }
});

export default intelligenceRoutes;
