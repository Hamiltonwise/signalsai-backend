import express from "express";
import { NotificationsController } from "../controllers/notifications/NotificationsController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";

const notificationRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================
notificationRoutes.get("/", authenticateToken, rbacMiddleware, NotificationsController.getNotifications);
notificationRoutes.patch("/:id/read", authenticateToken, rbacMiddleware, NotificationsController.markAsRead);
notificationRoutes.patch("/mark-all-read", authenticateToken, rbacMiddleware, NotificationsController.markAllAsRead);
notificationRoutes.delete("/delete-all", authenticateToken, rbacMiddleware, NotificationsController.deleteAll);

// =====================================================================
// ADMIN ENDPOINTS (Unrestricted Access)
// =====================================================================
notificationRoutes.post("/", NotificationsController.createNotification);
notificationRoutes.delete("/:id", NotificationsController.deleteNotification);

// =====================================================================
// HEALTH CHECK
// =====================================================================
notificationRoutes.get("/health", NotificationsController.healthCheck);

export default notificationRoutes;
