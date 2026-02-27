import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-organizations/AdminOrganizationsController";

const organizationsRoutes = express.Router();

// POST /api/admin/organizations — Create organization with initial admin user
organizationsRoutes.post(
  "/",
  authenticateToken,
  superAdminMiddleware,
  controller.createOrganization
);

// GET /api/admin/organizations — List all with enriched data
organizationsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  controller.listAll
);

// GET /api/admin/organizations/:id/locations — Organization locations with properties
// MUST be before /:id to avoid matching "locations" as the :id param
organizationsRoutes.get(
  "/:id/locations",
  authenticateToken,
  superAdminMiddleware,
  controller.getOrgLocations
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

// POST /api/admin/organizations/:id/create-project — Create website project for org
organizationsRoutes.post(
  "/:id/create-project",
  authenticateToken,
  superAdminMiddleware,
  controller.createProject
);

// POST /api/admin/organizations/:id/remove-payment-method — Cancel Stripe sub, clear billing
organizationsRoutes.post(
  "/:id/remove-payment-method",
  authenticateToken,
  superAdminMiddleware,
  controller.removePaymentMethod
);

// PATCH /api/admin/organizations/:id/lockout — Lock out organization (no Stripe only)
organizationsRoutes.patch(
  "/:id/lockout",
  authenticateToken,
  superAdminMiddleware,
  controller.lockoutOrganization
);

// PATCH /api/admin/organizations/:id/unlock — Unlock organization
organizationsRoutes.patch(
  "/:id/unlock",
  authenticateToken,
  superAdminMiddleware,
  controller.unlockOrganization
);

// DELETE /api/admin/organizations/:id — Permanently delete organization
organizationsRoutes.delete(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.deleteOrg
);

// POST /api/admin/organizations/users/:userId/set-password — Admin sets temp password for a user
organizationsRoutes.post(
  "/users/:userId/set-password",
  authenticateToken,
  superAdminMiddleware,
  controller.setUserPassword
);

export default organizationsRoutes;
