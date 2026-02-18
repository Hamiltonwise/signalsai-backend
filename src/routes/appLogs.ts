import express from "express";
import * as appLogsController from "../controllers/appLogs/appLogsController";

const router = express.Router();

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
