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

export default intelligencePanelRoutes;
