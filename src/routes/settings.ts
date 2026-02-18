import express from "express";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import { rbacMiddleware, requireRole } from "../middleware/rbac";
import * as controller from "../controllers/settings/SettingsController";

const settingsRoutes = express.Router();

// User Profile & Role
settingsRoutes.get("/me", tokenRefreshMiddleware, rbacMiddleware, controller.getUserProfile);

// Scopes Management
settingsRoutes.get("/scopes", tokenRefreshMiddleware, rbacMiddleware, controller.getScopes);

// Properties Management
settingsRoutes.get("/properties", tokenRefreshMiddleware, rbacMiddleware, controller.getProperties);
settingsRoutes.post("/properties/update", tokenRefreshMiddleware, rbacMiddleware, requireRole("admin"), controller.updateProperties);
settingsRoutes.get("/properties/available/:type", tokenRefreshMiddleware, rbacMiddleware, controller.getAvailableProperties);

// User Management
settingsRoutes.get("/users", tokenRefreshMiddleware, rbacMiddleware, controller.listUsers);
settingsRoutes.post("/users/invite", tokenRefreshMiddleware, rbacMiddleware, requireRole("admin", "manager"), controller.inviteUser);
settingsRoutes.delete("/users/:userId", tokenRefreshMiddleware, rbacMiddleware, requireRole("admin"), controller.removeUser);
settingsRoutes.put("/users/:userId/role", tokenRefreshMiddleware, rbacMiddleware, requireRole("admin"), controller.changeUserRole);

export default settingsRoutes;
