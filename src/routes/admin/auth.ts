import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { AdminAuthController } from "../../controllers/admin/auth/AdminAuthController";

const router = express.Router();

router.post(
  "/pilot/:userId",
  authenticateToken,
  superAdminMiddleware,
  AdminAuthController.createPilotSession
);

router.get(
  "/validate",
  authenticateToken,
  superAdminMiddleware,
  AdminAuthController.validateSuperAdmin
);

export default router;
