/**
 * User PatientPath Status — GET /api/user/patientpath
 *
 * Returns patientpath_status and patientpath_preview_url for the
 * authenticated user's org. Used by the PatientPathBreadcrumb component.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";

const userPatientpathRoutes = express.Router();

userPatientpathRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const orgId = req.effectiveOrgId || req.organizationId;
      if (!orgId) {
        return res.json({ success: true, status: null, previewUrl: null });
      }

      const org = await db("organizations")
        .where({ id: orgId })
        .select("patientpath_status", "patientpath_preview_url")
        .first();

      return res.json({
        success: true,
        status: org?.patientpath_status || null,
        previewUrl: org?.patientpath_preview_url || null,
      });
    } catch {
      return res.json({ success: true, status: null, previewUrl: null });
    }
  }
);

export default userPatientpathRoutes;
