import express from "express";
import { NotificationsController } from "../controllers/notifications/NotificationsController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, locationScopeMiddleware } from "../middleware/rbac";

const notificationRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================
notificationRoutes.get("/", authenticateToken, rbacMiddleware, locationScopeMiddleware, NotificationsController.getNotifications);
notificationRoutes.patch("/:id/read", authenticateToken, rbacMiddleware, locationScopeMiddleware, NotificationsController.markAsRead);
notificationRoutes.patch("/mark-all-read", authenticateToken, rbacMiddleware, locationScopeMiddleware, NotificationsController.markAllAsRead);
notificationRoutes.delete("/delete-all", authenticateToken, rbacMiddleware, locationScopeMiddleware, NotificationsController.deleteAll);

// =====================================================================
// ADMIN ENDPOINTS (Unrestricted Access)
// =====================================================================
notificationRoutes.get("/admin/list", NotificationsController.getAdminNotifications);
notificationRoutes.post("/", NotificationsController.createNotification);
notificationRoutes.delete("/:id", NotificationsController.deleteNotification);

// =====================================================================
// HEALTH CHECK
// =====================================================================
notificationRoutes.get("/health", NotificationsController.healthCheck);

export default notificationRoutes;
