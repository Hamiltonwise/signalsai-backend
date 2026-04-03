import express from "express";
import { NotificationsController } from "../controllers/notifications/NotificationsController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, locationScopeMiddleware } from "../middleware/rbac";
import { superAdminMiddleware } from "../middleware/superAdmin";

const notificationRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================
notificationRoutes.get("/", authenticateToken, rbacMiddleware, locationScopeMiddleware, NotificationsController.getNotifications);
notificationRoutes.patch("/:id/read", authenticateToken, rbacMiddleware, locationScopeMiddleware, NotificationsController.markAsRead);
notificationRoutes.patch("/mark-all-read", authenticateToken, rbacMiddleware, locationScopeMiddleware, NotificationsController.markAllAsRead);
notificationRoutes.delete("/delete-all", authenticateToken, rbacMiddleware, locationScopeMiddleware, NotificationsController.deleteAll);

// =====================================================================
// ADMIN ENDPOINTS (Require superAdmin auth)
// =====================================================================
notificationRoutes.get("/admin/list", authenticateToken, superAdminMiddleware, NotificationsController.getAdminNotifications);
notificationRoutes.post("/", authenticateToken, superAdminMiddleware, NotificationsController.createNotification);
notificationRoutes.delete("/:id", authenticateToken, superAdminMiddleware, NotificationsController.deleteNotification);

// =====================================================================
// HEALTH CHECK
// =====================================================================
notificationRoutes.get("/health", NotificationsController.healthCheck);

export default notificationRoutes;
