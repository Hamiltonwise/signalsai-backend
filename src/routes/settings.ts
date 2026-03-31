import express from "express";
import { authenticateToken } from "../middleware/auth";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import { rbacMiddleware, requireRole } from "../middleware/rbac";
import * as controller from "../controllers/settings/SettingsController";

const settingsRoutes = express.Router();

// User Profile & Role
settingsRoutes.get("/me", authenticateToken, rbacMiddleware, controller.getUserProfile);

// Scopes Management
settingsRoutes.get("/scopes", authenticateToken, rbacMiddleware, controller.getScopes);

// Properties Management
settingsRoutes.get("/properties", authenticateToken, rbacMiddleware, controller.getProperties);
settingsRoutes.post("/properties/update", authenticateToken, rbacMiddleware, requireRole("admin"), controller.updateProperties);
settingsRoutes.get("/properties/available/:type", authenticateToken, rbacMiddleware, tokenRefreshMiddleware, controller.getAvailableProperties);

// User Management
settingsRoutes.get("/users", authenticateToken, rbacMiddleware, controller.listUsers);
settingsRoutes.post("/users/invite", authenticateToken, rbacMiddleware, requireRole("admin", "manager"), controller.inviteUser);
settingsRoutes.post("/users/invite/:invitationId/resend", authenticateToken, rbacMiddleware, requireRole("admin", "manager"), controller.resendInvite);
settingsRoutes.delete("/users/:userId", authenticateToken, rbacMiddleware, requireRole("admin"), controller.removeUser);
settingsRoutes.put("/users/:userId/role", authenticateToken, rbacMiddleware, requireRole("admin"), controller.changeUserRole);

// Profile Update (user self-service)
settingsRoutes.put("/profile", authenticateToken, rbacMiddleware, controller.updateUserProfile);

// Password Management (user self-service)
settingsRoutes.get("/password-status", authenticateToken, rbacMiddleware, controller.getPasswordStatus);
settingsRoutes.put("/password", authenticateToken, rbacMiddleware, controller.changePassword);

export default settingsRoutes;
