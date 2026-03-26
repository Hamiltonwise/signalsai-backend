/**
 * User Preferences + Billing Portal — WO-NOTIFICATION-PREFS + WO-STRIPE-PORTAL
 *
 * PATCH /api/user/notification-preferences — toggle email/alert/celebration prefs
 * GET   /api/user/billing-portal          — Stripe customer portal redirect URL
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const preferencesRoutes = express.Router();

// ─── PATCH /notification-preferences ────────────────────────────────

preferencesRoutes.patch(
  "/notification-preferences",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.status(400).json({ success: false, error: "No organization" });
      }

      const { monday_email, competitor_alerts, milestone_celebrations } = req.body;

      // Get current prefs
      const org = await db("organizations").where({ id: orgId }).first();
      const currentPrefs = typeof org?.notification_prefs === "string"
        ? JSON.parse(org.notification_prefs)
        : org?.notification_prefs || {
            monday_email: true,
            competitor_alerts: true,
            milestone_celebrations: true,
          };

      // Merge updates
      const updated = {
        ...currentPrefs,
        ...(monday_email !== undefined ? { monday_email } : {}),
        ...(competitor_alerts !== undefined ? { competitor_alerts } : {}),
        ...(milestone_celebrations !== undefined ? { milestone_celebrations } : {}),
      };

      await db("organizations").where({ id: orgId }).update({
        notification_prefs: JSON.stringify(updated),
      });

      return res.json({ success: true, preferences: updated });
    } catch (error: any) {
      console.error("[Prefs] Update error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to update preferences" });
    }
  },
);

// ─── GET /notification-preferences ──────────────────────────────────

preferencesRoutes.get(
  "/notification-preferences",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({
          success: true,
          preferences: { monday_email: true, competitor_alerts: true, milestone_celebrations: true },
        });
      }

      const org = await db("organizations").where({ id: orgId }).first();
      const prefs = typeof org?.notification_prefs === "string"
        ? JSON.parse(org.notification_prefs)
        : org?.notification_prefs || {
            monday_email: true,
            competitor_alerts: true,
            milestone_celebrations: true,
          };

      return res.json({ success: true, preferences: prefs });
    } catch (error: any) {
      console.error("[Prefs] Fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load preferences" });
    }
  },
);

// ─── GET /billing-portal ────────────────────────────────────────────

preferencesRoutes.get(
  "/billing-portal",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.status(400).json({ success: false, error: "No organization" });
      }

      const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
      if (!STRIPE_SECRET_KEY) {
        return res.status(500).json({
          success: false,
          error: "Billing portal not configured. Contact support.",
        });
      }

      const org = await db("organizations").where({ id: orgId }).first();
      if (!org?.stripe_customer_id) {
        return res.status(400).json({
          success: false,
          error: "No billing account found. Contact support to set up billing.",
        });
      }

      // Create Stripe billing portal session
      const stripe = require("stripe")(STRIPE_SECRET_KEY);

      const session = await stripe.billingPortal.sessions.create({
        customer: org.stripe_customer_id,
        return_url: `${process.env.APP_URL || "https://app.getalloro.com"}/settings/billing`,
      });

      return res.json({ success: true, url: session.url });
    } catch (error: any) {
      console.error("[BillingPortal] Error:", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to create billing portal session",
      });
    }
  },
);

export default preferencesRoutes;
