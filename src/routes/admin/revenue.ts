/**
 * Admin Revenue -- Real Stripe MRR
 *
 * GET /api/admin/revenue/mrr
 *
 * Queries Stripe for active subscriptions and returns real MRR.
 * Cached for 5 minutes to avoid excessive Stripe API calls.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { getStripe, isStripeConfigured } from "../../config/stripe";

const adminRevenueRoutes = express.Router();

// Simple in-memory cache (5 min TTL)
let mrrCache: { data: any; expiry: number } | null = null;

adminRevenueRoutes.get(
  "/mrr",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      // Return cache if fresh
      if (mrrCache && Date.now() < mrrCache.expiry) {
        return res.json(mrrCache.data);
      }

      if (!isStripeConfigured()) {
        return res.json({
          success: true,
          mrr: 0,
          arr: 0,
          activeSubscriptions: 0,
          trialingSubscriptions: 0,
          source: "stripe_not_configured",
        });
      }

      const stripe = getStripe();

      // Fetch active subscriptions
      const active = await stripe.subscriptions.list({
        status: "active",
        limit: 100,
        expand: ["data.items.data.price"],
      });

      // Fetch trialing subscriptions
      const trialing = await stripe.subscriptions.list({
        status: "trialing",
        limit: 100,
      });

      // Sum MRR from active subscriptions
      let mrr = 0;
      for (const sub of active.data) {
        for (const item of sub.items.data) {
          const price = item.price;
          if (price.recurring?.interval === "month") {
            mrr += (price.unit_amount || 0) / 100;
          } else if (price.recurring?.interval === "year") {
            mrr += (price.unit_amount || 0) / 100 / 12;
          }
        }
      }

      const result = {
        success: true,
        mrr: Math.round(mrr),
        arr: Math.round(mrr * 12),
        activeSubscriptions: active.data.length,
        trialingSubscriptions: trialing.data.length,
        source: "stripe",
      };

      // Cache for 5 minutes
      mrrCache = { data: result, expiry: Date.now() + 5 * 60_000 };

      return res.json(result);
    } catch (error: any) {
      console.error("[AdminRevenue] Error fetching MRR:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch revenue data" });
    }
  },
);

export default adminRevenueRoutes;
