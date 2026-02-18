import express from "express";
import { NotificationsController } from "../controllers/notifications/NotificationsController";

const notificationRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Domain-Filtered)
// =====================================================================
notificationRoutes.get("/", NotificationsController.getNotifications);
notificationRoutes.patch("/:id/read", NotificationsController.markAsRead);
notificationRoutes.patch("/mark-all-read", NotificationsController.markAllAsRead);
notificationRoutes.delete("/delete-all", NotificationsController.deleteAll);

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
