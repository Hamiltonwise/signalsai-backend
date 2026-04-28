import express from "express";
import * as controller from "../controllers/dashboard/DashboardController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";

const dashboardRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// Dashboard metrics dictionary
// (See plan: 04282026-no-ticket-monthly-agents-v2-backend, T6)
dashboardRoutes.get(
  "/metrics",
  authenticateToken,
  rbacMiddleware,
  controller.getMetrics
);

export default dashboardRoutes;
