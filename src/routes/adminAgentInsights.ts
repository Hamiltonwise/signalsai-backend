/**
 * Admin Agent Insights API Routes
 *
 * Endpoints for viewing Guardian and Governance Sentinel agent recommendations
 * and tracking their status (PASS/REJECT)
 */

import express from "express";
import * as controller from "../controllers/admin-agent-insights/AdminAgentInsightsController";

const router = express.Router();

router.get("/summary", controller.getSummary);
router.get("/:agentType/recommendations", controller.getRecommendations);
router.patch("/recommendations/:id", controller.updateRecommendation);
router.patch("/:agentType/recommendations/mark-all-pass", controller.markAllPass);
router.delete("/recommendations/bulk-delete", controller.bulkDeleteRecommendations);
router.delete("/clear-month-data", controller.clearMonthData);
router.get("/:agentType/governance-ids", controller.getGovernanceIds);
router.post("/by-ids", controller.getByIds);

export default router;
