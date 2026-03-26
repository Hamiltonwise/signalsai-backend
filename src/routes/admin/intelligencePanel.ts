/**
 * Intelligence Panel API — SEO/AEO/CRO data for admin panel (WO-8)
 *
 * GET /api/admin/intelligence/seo/:orgId   — latest SEO audit + factors
 * GET /api/admin/intelligence/aeo/:orgId   — FAQ content (staged + published)
 * GET /api/admin/intelligence/cro/:orgId   — CRO experiments
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const intelligencePanelRoutes = express.Router();

// SEO audit data for Intelligence Panel
intelligencePanelRoutes.get(
  "/seo/:orgId",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);

      const audit = await db("patientpath_seo_audits")
        .where({ organization_id: orgId })
        .orderBy("audited_at", "desc")
        .first();

      return res.json({ success: true, audit: audit || null });
    } catch (error: any) {
      console.error("[IntelPanel] SEO error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch SEO data" });
    }
  }
);

// AEO FAQ content for Intelligence Panel
intelligencePanelRoutes.get(
  "/aeo/:orgId",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);

      const faqs = await db("patientpath_faq_content")
        .where({ organization_id: orgId })
        .orderBy("created_at", "asc");

      return res.json({ success: true, faqs });
    } catch (error: any) {
      console.error("[IntelPanel] AEO error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch AEO data" });
    }
  }
);

// CRO experiments for Intelligence Panel
intelligencePanelRoutes.get(
  "/cro/:orgId",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);

      const experiments = await db("cro_experiments")
        .where({ organization_id: orgId })
        .orderBy("started_at", "desc");

      return res.json({ success: true, experiments });
    } catch (error: any) {
      console.error("[IntelPanel] CRO error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch CRO data" });
    }
  }
);

// Combined Intelligence Score (used by dashboard and practice cards)
intelligencePanelRoutes.get(
  "/score/:orgId",
  authenticateToken,
  async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);

      // SEO score (latest audit)
      const seoAudit = await db("patientpath_seo_audits")
        .where({ organization_id: orgId })
        .orderBy("audited_at", "desc")
        .first();
      const seoScore = seoAudit?.seo_score ?? 0;

      // AEO score (published FAQ count, max 5 = 100)
      const faqResult = await db("patientpath_faq_content")
        .where({ organization_id: orgId, status: "published" })
        .count("id as count")
        .first();
      const aeoScore = Math.min((Number(faqResult?.count) || 0) * 20, 100);

      // CRO score (concluded experiments with improvement)
      const croResult = await db("cro_experiments")
        .where({ organization_id: orgId, concluded: true })
        .count("id as count")
        .first();
      const croScore = Math.min((Number(croResult?.count) || 0) * 33, 100);

      // Weighted average: SEO 40%, AEO 30%, CRO 30%
      const combinedScore = Math.round(seoScore * 0.4 + aeoScore * 0.3 + croScore * 0.3);

      return res.json({ combinedScore, seoScore, aeoScore, croScore });
    } catch (error: any) {
      console.error("[IntelPanel] Score error:", error.message);
      return res.status(500).json({ error: "Failed to calculate score" });
    }
  }
);

// Keywords data for Intelligence Panel
intelligencePanelRoutes.get(
  "/keywords/:orgId",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);

      const keywords = await db("patientpath_keywords")
        .where({ organization_id: orgId })
        .orderBy("checked_at", "desc");

      // Deduplicate to latest check per keyword
      const seen = new Set<string>();
      const latest = keywords.filter((k: any) => {
        if (seen.has(k.keyword)) return false;
        seen.add(k.keyword);
        return true;
      });

      return res.json({ success: true, keywords: latest });
    } catch (error: any) {
      console.error("[IntelPanel] Keywords error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch keyword data" });
    }
  }
);

export default intelligencePanelRoutes;
