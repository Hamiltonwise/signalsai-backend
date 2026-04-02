/**
 * Support Routes
 *
 * Handles user inquiries and support requests
 * - POST /api/support/inquiry - Submit a support request (sends email to admins)
 * - GET /api/support/health - Health check endpoint
 */

import express from "express";
import rateLimit from "express-rate-limit";
import * as supportController from "../controllers/support/supportController";

const router = express.Router();

// Rate limit support inquiries: 5 per hour per IP
const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, error: "Too many support requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/support/inquiry
 * Submit a support request / inquiry
 * This forwards the message to admin team via email
 */
router.post("/inquiry", supportLimiter, supportController.handleInquiry);

/**
 * GET /api/support/health
 * Health check endpoint
 */
router.get("/health", supportController.healthCheck);

export default router;
