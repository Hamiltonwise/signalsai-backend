/**
 * App Logs API Routes
 *
 * Endpoints for viewing and managing application logs
 */

import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const router = express.Router();
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Path to the log file
const LOG_FILE_PATH = path.join(__dirname, "../logs/agent-run.log");

/**
 * GET /api/admin/app-logs
 *
 * Returns the latest lines from the log file
 *
 * Query params:
 *   - lines: Maximum number of lines to return (default: 500)
 *
 * Returns:
 *   - logs: Array of log lines
 *   - total_lines: Total number of lines in the file
 *   - timestamp: Current timestamp
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const maxLines = parseInt(req.query.lines as string) || 500;

    // Check if log file exists
    if (!fs.existsSync(LOG_FILE_PATH)) {
      return res.json({
        success: true,
        data: {
          logs: [],
          total_lines: 0,
          timestamp: new Date().toISOString(),
        },
        message: "Log file does not exist yet",
      });
    }

    // Read the log file
    const content = await readFile(LOG_FILE_PATH, "utf-8");
    const allLines = content.split("\n");

    // Get the latest lines (last N lines)
    const latestLines = allLines.slice(-maxLines);

    return res.json({
      success: true,
      data: {
        logs: latestLines,
        total_lines: allLines.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[App Logs] Error reading log file:", error);
    return res.status(500).json({
      success: false,
      error: "READ_ERROR",
      message: error?.message || "Failed to read log file",
    });
  }
});

/**
 * DELETE /api/admin/app-logs
 *
 * Clears the log file
 *
 * Returns:
 *   - success: Boolean indicating success
 *   - message: Confirmation message
 */
router.delete("/", async (req: Request, res: Response) => {
  try {
    // Check if log file exists
    if (!fs.existsSync(LOG_FILE_PATH)) {
      return res.json({
        success: true,
        message: "Log file does not exist",
      });
    }

    // Clear the log file by writing an empty string
    await writeFile(LOG_FILE_PATH, "");

    console.log("[App Logs] ✓ Log file cleared successfully");

    return res.json({
      success: true,
      message: "Log file cleared successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[App Logs] Error clearing log file:", error);
    return res.status(500).json({
      success: false,
      error: "CLEAR_ERROR",
      message: error?.message || "Failed to clear log file",
    });
  }
});

export default router;
