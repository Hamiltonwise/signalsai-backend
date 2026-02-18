import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-organizations/AdminOrganizationsController";

const organizationsRoutes = express.Router();

// GET /api/admin/organizations — List all with enriched data
organizationsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  controller.listAll
);

// GET /api/admin/organizations/:id — Organization details
organizationsRoutes.get(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.getById
);

// PATCH /api/admin/organizations/:id — Update name
organizationsRoutes.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.updateName
);

// PATCH /api/admin/organizations/:id/tier — Update subscription tier
organizationsRoutes.patch(
  "/:id/tier",
  authenticateToken,
  superAdminMiddleware,
  controller.updateTier
);

export default organizationsRoutes;
