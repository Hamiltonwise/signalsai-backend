/**
 * AgentsV2 Routes
 *
 * Thin route layer that maps HTTP endpoints to controller functions.
 * All business logic lives in src/controllers/agents/.
 *
 * Endpoints:
 * - POST /proofline-run                    - Daily proofline agent for all clients
 * - POST /monthly-agents-run               - Monthly agents for a specific account
 * - POST /monthly-agents-run-test          - Test endpoint (no DB writes)
 * - POST /gbp-optimizer-run                - Monthly GBP Copy Optimizer
 * - POST /ranking-run                      - Automated practice ranking agent
 * - POST /guardian-governance-agents-run    - Monthly Guardian & Governance agents
 * - POST /process-all                      - DEPRECATED: use /proofline-run
 * - GET  /latest/:googleAccountId          - Latest agent outputs for dashboard
 *
 * All endpoints require superAdmin auth.
 */

// Auth imports injected by security audit
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

/*
 * - GET  /getLatestReferralEngineOutput/:googleAccountId - Latest Referral Engine output
 * - GET  /health                           - Health check
 */

import express from "express";
import * as controller from "../controllers/agents/AgentsController";

const router = express.Router();

router.use(authenticateToken, superAdminMiddleware);

// Production endpoints
router.post("/proofline-run", controller.runProoflineAgent);
router.post("/monthly-agents-run", controller.runMonthlyAgents);
router.post("/gbp-optimizer-run", controller.runGbpOptimizer);
router.post("/ranking-run", controller.runRankingAgent);
router.post("/guardian-governance-agents-run", controller.runGuardianGovernance);

// Data retrieval
router.get("/latest/:googleAccountId", controller.getLatestOutputs);
router.get(
  "/getLatestReferralEngineOutput/:googleAccountId",
  controller.getLatestReferralEngineOutput,
);
router.get("/health", controller.healthCheck);

// Test & deprecated
router.post("/monthly-agents-run-test", controller.runMonthlyAgentsTest);
router.post("/process-all", controller.processAllDeprecated);

export default router;
