/**
 * Billing Admin — WO-BILLING-RECOVERY
 *
 * GET /api/admin/billing/at-risk — orgs with failed/suspended billing
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const billingAdminRoutes = express.Router();

billingAdminRoutes.get(
  "/at-risk",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);

      const atRisk = await db("organizations")
        .where(function () {
          this.where({ subscription_status: "suspended" })
            .orWhere(function () {
              this.whereNotNull("payment_failed_at")
                .where("payment_failed_at", "<", threeDaysAgo)
                .whereNot({ subscription_status: "active" });
            });
        })
        .select(
          "id", "name", "subscription_status", "subscription_tier",
          "stripe_customer_id", "payment_failed_at", "created_at",
        )
        .orderBy("payment_failed_at", "desc");

      return res.json({
        success: true,
        atRisk,
        count: atRisk.length,
      });
    } catch (error: any) {
      console.error("[BillingAdmin] At-risk error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch at-risk accounts" });
    }
  },
);

export default billingAdminRoutes;
