/**
 * Billing Routes
 *
 * Stripe billing endpoints for subscription management.
 *
 * IMPORTANT: The webhook route uses express.raw() for Stripe signature
 * verification. It must NOT go through the JSON body parser.
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, requireRole } from "../middleware/rbac";
import * as BillingController from "../controllers/billing/BillingController";

const billingRoutes = express.Router();

// ─── Authenticated Endpoints ───

// POST /api/billing/checkout — Create Stripe Checkout Session
billingRoutes.post(
  "/checkout",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  BillingController.createCheckout
);

// POST /api/billing/portal — Create Stripe Customer Portal session
billingRoutes.post(
  "/portal",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  BillingController.createPortal
);

// GET /api/billing/status — Get current subscription status
billingRoutes.get(
  "/status",
  authenticateToken,
  rbacMiddleware,
  BillingController.getStatus
);

// ─── Public Webhook Endpoint ───
// Uses raw body parser for Stripe signature verification.
// No auth — verified by Stripe webhook signature.
billingRoutes.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  BillingController.handleWebhook
);

export default billingRoutes;
