/**
 * User Website Routes
 *
 * DFY-tier user-facing website endpoints:
 * - GET  / — Fetch organization website data
 * - POST /pages/:pageId/edit — AI-powered page component edit
 */

import express from "express";
import { tokenRefreshMiddleware } from "../../middleware/tokenRefresh";
import { requireRole } from "../../middleware/rbac";
import * as controller from "../../controllers/user-website/UserWebsiteController";

const userWebsiteRoutes = express.Router();

userWebsiteRoutes.get(
  "/",
  tokenRefreshMiddleware,
  requireRole("admin", "manager"),
  controller.getUserWebsite
);

userWebsiteRoutes.post(
  "/pages/:pageId/edit",
  tokenRefreshMiddleware,
  requireRole("admin", "manager"),
  controller.editPageComponent
);

export default userWebsiteRoutes;
