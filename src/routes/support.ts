/**
 * Support Routes
 *
 * Handles user inquiries and support requests
 * - POST /api/support/inquiry - Submit a support request (sends email to admins)
 * - GET /api/support/health - Health check endpoint
 */

import express from "express";
import * as supportController from "../controllers/support/supportController";
import * as ticketsController from "../controllers/support/SupportTicketsController";
import { authenticateToken } from "../middleware/auth";
import {
  locationScopeMiddleware,
  rbacMiddleware,
} from "../middleware/rbac";

const router = express.Router();
const protectedSupport = [
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
];

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

router.get("/tickets", ...protectedSupport, ticketsController.listTickets);
router.post("/tickets", ...protectedSupport, ticketsController.createTicket);
router.get("/tickets/:ticketId", ...protectedSupport, ticketsController.getTicket);
router.post(
  "/tickets/:ticketId/messages",
  ...protectedSupport,
  ticketsController.addMessage
);

export default router;
