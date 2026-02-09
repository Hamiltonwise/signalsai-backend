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

// Log file paths mapping
const LOG_FILES: Record<string, string> = {
  "agent-run": path.join(__dirname, "../logs/agent-run.log"),
  email: path.join(__dirname, "../logs/email.log"),
  "scraping-tool": path.join(__dirname, "../logs/scraping-tool.log"),
  "website-scrape": path.join(__dirname, "../logs/website-scrape.log"),
};

// Valid log types
const VALID_LOG_TYPES = Object.keys(LOG_FILES);

/**
 * GET /api/admin/app-logs
 *
 * Returns the latest lines from the specified log file
 *
 * Query params:
 *   - type: Log file type (agent-run, email, scraping-tool). Default: agent-run
 *   - lines: Maximum number of lines to return (default: 500)
 *
 * Returns:
 *   - logs: Array of log lines
 *   - total_lines: Total number of lines in the file
 *   - timestamp: Current timestamp
 *   - log_type: The type of log being returned
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const logType = (req.query.type as string) || "agent-run";
    const maxLines = parseInt(req.query.lines as string) || 500;

    // Validate log type
    if (!VALID_LOG_TYPES.includes(logType)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_LOG_TYPE",
        message: `Invalid log type. Valid types: ${VALID_LOG_TYPES.join(", ")}`,
      });
    }

    const logFilePath = LOG_FILES[logType];

    // Check if log file exists
    if (!fs.existsSync(logFilePath)) {
      return res.json({
        success: true,
        data: {
          logs: [],
          total_lines: 0,
          timestamp: new Date().toISOString(),
          log_type: logType,
        },
        message: "Log file does not exist yet",
      });
    }

    // Read the log file
    const content = await readFile(logFilePath, "utf-8");
    const allLines = content.split("\n");

    // Get the latest lines (last N lines)
    const latestLines = allLines.slice(-maxLines);

    return res.json({
      success: true,
      data: {
        logs: latestLines,
        total_lines: allLines.length,
        timestamp: new Date().toISOString(),
        log_type: logType,
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
 * Clears the specified log file
 *
 * Query params:
 *   - type: Log file type (agent-run, email, scraping-tool). Default: agent-run
 *
 * Returns:
 *   - success: Boolean indicating success
 *   - message: Confirmation message
 */
router.delete("/", async (req: Request, res: Response) => {
  try {
    const logType = (req.query.type as string) || "agent-run";

    // Validate log type
    if (!VALID_LOG_TYPES.includes(logType)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_LOG_TYPE",
        message: `Invalid log type. Valid types: ${VALID_LOG_TYPES.join(", ")}`,
      });
    }

    const logFilePath = LOG_FILES[logType];

    // Check if log file exists
    if (!fs.existsSync(logFilePath)) {
      return res.json({
        success: true,
        message: "Log file does not exist",
      });
    }

    // Clear the log file by writing an empty string
    await writeFile(logFilePath, "");

    console.log(`[App Logs] ✓ ${logType} log file cleared successfully`);

    return res.json({
      success: true,
      message: `${logType} log file cleared successfully`,
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
