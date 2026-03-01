/**
 * User Website Routes
 *
 * DFY-tier user-facing website endpoints:
 * - GET  / — Fetch organization website data
 * - POST /pages/:pageId/edit — AI-powered page component edit
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, requireRole } from "../../middleware/rbac";
import * as controller from "../../controllers/user-website/UserWebsiteController";

const userWebsiteRoutes = express.Router();

userWebsiteRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getUserWebsite
);

userWebsiteRoutes.post(
  "/pages/:pageId/edit",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.editPageComponent
);

// Version history
userWebsiteRoutes.get(
  "/pages/:pageId/versions",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getPageVersions
);

userWebsiteRoutes.get(
  "/pages/:pageId/versions/:versionId",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getPageVersionContent
);

userWebsiteRoutes.post(
  "/pages/:pageId/versions/:versionId/restore",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.restorePageVersion
);

// Recipients
userWebsiteRoutes.get(
  "/recipients",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getRecipients
);

userWebsiteRoutes.put(
  "/recipients",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  controller.updateRecipients
);

// Form submissions
userWebsiteRoutes.get(
  "/form-submissions/export",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.exportFormSubmissions
);

userWebsiteRoutes.get(
  "/form-submissions",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.listFormSubmissions
);

userWebsiteRoutes.get(
  "/form-submissions/:id",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getFormSubmission
);

userWebsiteRoutes.patch(
  "/form-submissions/:id/read",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.toggleFormSubmissionRead
);

userWebsiteRoutes.delete(
  "/form-submissions/:id",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.deleteFormSubmission
);

// Custom domain
userWebsiteRoutes.post(
  "/domain/connect",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.connectDomain
);

userWebsiteRoutes.post(
  "/domain/verify",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.verifyDomain
);

userWebsiteRoutes.delete(
  "/domain/disconnect",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.disconnectDomain
);

export default userWebsiteRoutes;
