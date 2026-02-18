/**
 * Support Routes
 *
 * Handles user inquiries and support requests
 * - POST /api/support/inquiry - Submit a support request (sends email to admins)
 * - GET /api/support/health - Health check endpoint
 */

import express from "express";
import * as supportController from "../controllers/support/supportController";

const router = express.Router();

/**
 * POST /api/support/inquiry
 * Submit a support request / inquiry
 * This forwards the message to admin team via email
 */
router.post("/inquiry", supportController.handleInquiry);

/**
 * GET /api/support/health
 * Health check endpoint
 */
router.get("/health", supportController.healthCheck);

export default router;
