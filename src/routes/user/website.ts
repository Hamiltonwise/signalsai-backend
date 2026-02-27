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
