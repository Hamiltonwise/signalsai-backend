/**
 * RAG Controller
 *
 * Request/response handling for the RAG pipeline.
 * Validates environment, delegates to orchestrator, formats responses.
 */

import { Request, Response } from "express";
import { validateEnvironment } from "./feature-utils/util.rag-validator";
import { runPipeline } from "./feature-services/service.rag-orchestrator";
import { logError, getLogFilePath, getErrorLogFilePath } from "./feature-services/service.rag-logger";

// =====================================================================
// ROUTE HANDLERS
// =====================================================================

/**
 * GET /rag
 *
 * Runs the complete RAG pipeline:
 * 1. Validates environment variables
 * 2. Fetches all Notion databases
 * 3. Fetches all pages in each database
 * 4. Extracts and chunks content
 * 5. Generates embeddings using OpenAI
 * 6. Saves to PostgreSQL
 *
 * Returns a detailed summary with statistics, database results,
 * skipped items, errors, and log file paths.
 */
export async function runRagPipeline(req: Request, res: Response) {
  try {
    // Validate environment variables
    const validation = validateEnvironment();

    if (!validation.valid) {
      // Preserve original error format: return individual error for each missing var
      const firstError = validation.errors[0];
      return res.status(500).json({
        success: false,
        error: firstError,
        message: `Please set ${firstError.replace(" not configured", "")} in your .env file`,
      });
    }

    // Run the RAG pipeline
    const summary = await runPipeline();

    // Return success response with detailed JSON summary
    return res.json({
      ...summary,
      logs: {
        mainLog: getLogFilePath(),
        errorLog: getErrorLogFilePath(),
      },
    });
  } catch (error: any) {
    logError("RAG endpoint", error);

    return res.status(500).json({
      success: false,
      error: "RAG pipeline failed",
      message: error.message || "Unknown error occurred",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
