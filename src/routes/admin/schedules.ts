import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-schedules/AdminSchedulesController";

const schedulesRoutes = express.Router();

// GET /api/admin/schedules — list all schedules with latest run
schedulesRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  controller.listSchedules,
);

// GET /api/admin/schedules/registry — available agent keys
schedulesRoutes.get(
  "/registry",
  authenticateToken,
  superAdminMiddleware,
  controller.listRegistry,
);

// GET /api/admin/schedules/server-time — current server timestamp
schedulesRoutes.get(
  "/server-time",
  authenticateToken,
  superAdminMiddleware,
  controller.getServerTime,
);

// GET /api/admin/schedules/:id/runs — paginated run history
schedulesRoutes.get(
  "/:id/runs",
  authenticateToken,
  superAdminMiddleware,
  controller.listRuns,
);

// POST /api/admin/schedules — create schedule
schedulesRoutes.post(
  "/",
  authenticateToken,
  superAdminMiddleware,
  controller.createSchedule,
);

// PATCH /api/admin/schedules/:id — update schedule
schedulesRoutes.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.updateSchedule,
);

// DELETE /api/admin/schedules/:id — delete schedule
schedulesRoutes.delete(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.deleteSchedule,
);

// POST /api/admin/schedules/:id/run — manual trigger
schedulesRoutes.post(
  "/:id/run",
  authenticateToken,
  superAdminMiddleware,
  controller.triggerRun,
);

export default schedulesRoutes;
