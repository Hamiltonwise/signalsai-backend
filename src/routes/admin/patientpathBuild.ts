/**
 * PatientPath Build Admin Endpoints — WO19
 *
 * POST /api/admin/patientpath/build     — trigger build for one org
 * GET  /api/admin/patientpath/status/:id — check build status
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import { buildPatientPathForOrg } from "../../services/patientpathBuild";

const patientpathBuildRoutes = express.Router();

patientpathBuildRoutes.post(
  "/build",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { org_id } = req.body;
      if (!org_id) {
        return res.status(400).json({ success: false, error: "org_id required" });
      }

      // Fire async — don't block response
      buildPatientPathForOrg(Number(org_id)).catch((err) =>
        console.error(`[PatientPath] Async build error:`, err.message),
      );

      return res.json({ success: true, status: "building", org_id });
    } catch (error: any) {
      console.error("[PatientPath] Build trigger error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to trigger build" });
    }
  },
);

patientpathBuildRoutes.get(
  "/status/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const org = await db("organizations")
        .where({ id })
        .select("id", "name", "patientpath_status", "patientpath_build_data", "research_brief")
        .first();

      if (!org) {
        return res.status(404).json({ success: false, error: "Org not found" });
      }

      return res.json({
        success: true,
        status: org.patientpath_status,
        buildData: org.patientpath_build_data
          ? typeof org.patientpath_build_data === "string"
            ? JSON.parse(org.patientpath_build_data) : org.patientpath_build_data
          : null,
        researchBrief: org.research_brief
          ? typeof org.research_brief === "string"
            ? JSON.parse(org.research_brief) : org.research_brief
          : null,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "Failed to fetch status" });
    }
  },
);

export default patientpathBuildRoutes;
