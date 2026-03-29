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
import { rbacMiddleware, requireRole, type RBACRequest } from "../middleware/rbac";
import * as BillingController from "../controllers/billing/BillingController";
import { db } from "../database/connection";

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

// GET /api/billing/details — Get detailed billing info (invoices, payment method, etc.)
billingRoutes.get(
  "/details",
  authenticateToken,
  rbacMiddleware,
  BillingController.getDetails
);

// POST /api/billing/cancel-reason — Log cancellation reason before Stripe portal
billingRoutes.post(
  "/cancel-reason",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false });

      const { reason, other_text } = req.body || {};

      // Log to behavioral_events
      const hasTable = await db.schema.hasTable("behavioral_events");
      if (hasTable) {
        await db("behavioral_events").insert({
          organization_id: orgId,
          event_type: "billing.cancel_reason",
          metadata: JSON.stringify({ reason, other_text: other_text || null }),
        });
      }

      // Create dream_team_task for Corey (every cancel reason gets human attention)
      try {
        const org = await db("organizations").where({ id: orgId }).first("name");
        await db("dream_team_tasks").insert({
          owner_name: "Corey",
          title: `Cancel intent: ${org?.name || `Org ${orgId}`}`,
          description: `Client indicated intent to cancel. Reason: ${reason}${other_text ? `. Detail: ${other_text}` : ""}. Org ID: ${orgId}.`,
          status: "open",
          priority: "urgent",
          source_type: "cancel_flow",
        });
      } catch {}

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Billing] Cancel reason error:", err.message);
      return res.status(500).json({ success: false });
    }
  },
);

// POST /api/billing/pause — Pause subscription (up to 3 months)
billingRoutes.post(
  "/pause",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false });

      const { reason, other_text } = req.body || {};

      // Update org status to paused
      await db("organizations").where({ id: orgId }).update({
        subscription_status: "paused",
        paused_at: new Date(),
        pause_reason: reason || null,
      });

      // Log to behavioral_events
      const hasTable = await db.schema.hasTable("behavioral_events");
      if (hasTable) {
        await db("behavioral_events").insert({
          organization_id: orgId,
          event_type: "billing.subscription_paused",
          metadata: JSON.stringify({ reason, other_text: other_text || null }),
        });
      }

      // Create task for follow-up
      try {
        const org = await db("organizations").where({ id: orgId }).first("name");
        await db("dream_team_tasks").insert({
          owner_name: "Corey",
          title: `Paused: ${org?.name || `Org ${orgId}`}`,
          description: `Client paused their account. Reason: ${reason}${other_text ? `. Detail: ${other_text}` : ""}. Follow up in 2 weeks.`,
          status: "open",
          priority: "high",
          source_type: "cancel_flow",
        });
      } catch {}

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Billing] Pause error:", err.message);
      return res.status(500).json({ success: false });
    }
  },
);

// POST /api/billing/create-portal-session — Alias for portal (used by cancel flow)
billingRoutes.post(
  "/create-portal-session",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  BillingController.createPortal
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
