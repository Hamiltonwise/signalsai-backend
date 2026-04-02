import express from "express";
import * as appLogsController from "../controllers/appLogs/appLogsController";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

const router = express.Router();

router.use(authenticateToken, superAdminMiddleware);

/**
 * GET /api/admin/app-logs
 * Returns latest lines from specified log file
 */
router.get("/", appLogsController.getLogFile);

/**
 * DELETE /api/admin/app-logs
 * Clears specified log file
 */
router.delete("/", appLogsController.clearLogFile);

export default router;
