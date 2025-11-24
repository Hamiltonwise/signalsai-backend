import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

/**
 * GET /api/admin/validate
 * Checks if the current user is a Super Admin.
 * Used by AdminGuard on the frontend.
 */
router.get(
  "/validate",
  authenticateToken,
  superAdminMiddleware,
  (req, res) => {
    res.json({ success: true, message: "Authorized" });
  }
);

export default router;
