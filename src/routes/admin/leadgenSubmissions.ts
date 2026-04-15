/**
 * Admin Leadgen Submissions Routes
 *
 * All endpoints require super-admin auth (JWT + allowlisted email). Mounted
 * at `/api/admin/leadgen-submissions` from `src/index.ts`.
 *
 *   GET /                 — paginated list (filters + audit join)
 *   GET /funnel           — stage counts + drop-off %
 *   GET /export           — streaming CSV download
 *   GET /:id              — full detail (session + events + audit)
 *
 * NOTE: /funnel and /export are registered BEFORE /:id so they don't match
 * the :id param.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-leadgen/AdminLeadgenController";

const router = express.Router();

router.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  controller.listSubmissions
);

// Literal paths before /:id.
router.get(
  "/funnel",
  authenticateToken,
  superAdminMiddleware,
  controller.getFunnel
);

router.get(
  "/export",
  authenticateToken,
  superAdminMiddleware,
  controller.exportSubmissionsCsv
);

router.get(
  "/stats",
  authenticateToken,
  superAdminMiddleware,
  controller.getStats
);

router.get(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.getSubmissionDetail
);

// POST (not DELETE) so we can carry a JSON body of ids. apiDelete on the
// client side doesn't support bodies; POST is the portable choice.
router.post(
  "/bulk-delete",
  authenticateToken,
  superAdminMiddleware,
  controller.bulkDeleteSubmissions
);

router.delete(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.deleteSubmission
);

export default router;
