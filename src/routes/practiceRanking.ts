/**
 * Practice Ranking Routes
 *
 * Endpoints for the Practice Ranking Analysis feature:
 * - POST /trigger - Start a new batch ranking analysis (multi-location)
 * - GET /status/:id - Check individual analysis status
 * - GET /batch/:batchId/status - Check batch analysis status
 * - GET /results/:id - Get full results for single analysis
 * - GET /list - List all analyses
 * - GET /accounts - List onboarded accounts with GBP locations
 * - DELETE /:id - Delete a ranking analysis
 * - DELETE /batch/:batchId - Delete all rankings in a batch
 * - POST /refresh-competitors - Invalidate competitor cache
 * - GET /latest - Get latest rankings for all locations (client dashboard)
 * - GET /tasks - Get approved ranking tasks
 * - POST /webhook/llm-response - Receive LLM analysis from n8n
 */

import express from "express";
import * as controller from "../controllers/practice-ranking/PracticeRankingController";

const router = express.Router();

// Trigger analysis
router.post("/trigger", controller.triggerBatchAnalysis);

// Status endpoints
router.get("/batch/:batchId/status", controller.getBatchStatus);
router.get("/status/:id", controller.getRankingStatus);

// Results
router.get("/results/:id", controller.getRankingResults);
router.get("/list", controller.listRankings);
router.get("/accounts", controller.listAccounts);
router.get("/latest", controller.getLatestRankings);
router.get("/tasks", controller.getRankingTasks);

// Retry
router.post("/retry/:id", controller.retryRanking);
router.post("/retry-batch/:batchId", controller.retryBatch);

// Management
router.delete("/batch/:batchId", controller.deleteBatch);
router.delete("/:id", controller.deleteRanking);
router.post("/refresh-competitors", controller.refreshCompetitors);

// Webhook
router.post("/webhook/llm-response", controller.handleLlmWebhook);

export default router;
