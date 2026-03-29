/**
 * Checkup Funnel Analytics -- Admin-only
 *
 * GET /api/admin/checkup-funnel
 *
 * Returns the full checkup-to-signup funnel for a given time window.
 * This is how Corey measures whether the Oz moments are working.
 *
 * Funnel stages:
 *   1. Scan started (checkup.scan_started)
 *   2. Scan completed (checkup.scan_completed)
 *   3. Gate viewed (checkup.gate_viewed)
 *   4. Email captured (checkup.email_captured)
 *   5. Account created (checkup.account_created)
 *   6. First login (checkup.first_login)
 *   7. TTFV yes (ttfv.yes)
 *   8. Subscription created (billing.subscription_created)
 *
 * Also returns: share events, top Oz moments by shareability, and source channels.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const checkupFunnelRoutes = express.Router();

checkupFunnelRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const since = new Date(Date.now() - days * 86_400_000);

      const hasTable = await db.schema.hasTable("behavioral_events");
      if (!hasTable) {
        return res.json({ success: true, funnel: {}, message: "No behavioral_events table" });
      }

      // Count each funnel stage
      const stages = [
        "checkup.scan_started",
        "checkup.scan_completed",
        "checkup.gate_viewed",
        "checkup.email_captured",
        "checkup.account_created",
        "checkup.first_login",
        "ttfv.yes",
        "billing.subscription_created",
      ];

      const counts: Record<string, number> = {};
      for (const stage of stages) {
        const result = await db("behavioral_events")
          .where("event_type", stage)
          .where("created_at", ">=", since)
          .count("id as count")
          .first();
        counts[stage] = Number(result?.count || 0);
      }

      // Share events
      const shareCount = await db("behavioral_events")
        .where("event_type", "checkup.share_created")
        .where("created_at", ">=", since)
        .count("id as count")
        .first();

      const competitorInviteCount = await db("behavioral_events")
        .where("event_type", "checkup.competitor_invite_created")
        .where("created_at", ">=", since)
        .count("id as count")
        .first();

      // Source channel breakdown
      const sourceChannels = await db("behavioral_events")
        .where("event_type", "checkup.email_captured")
        .where("created_at", ">=", since)
        .select(db.raw("JSON_EXTRACT(metadata, '$.source_channel') as channel"))
        .groupBy("channel")
        .count("id as count")
        .catch(() => []);

      // Referral-driven signups
      const referralSignups = await db("behavioral_events")
        .where("event_type", "checkup.email_captured")
        .where("created_at", ">=", since)
        .whereRaw("metadata LIKE '%ref_code%'")
        .whereRaw("metadata NOT LIKE '%\"ref_code\":null%'")
        .count("id as count")
        .first()
        .catch(() => ({ count: 0 }));

      // Recent Oz moments (from checkup scan completed events with oz data)
      const recentOzEvents = await db("behavioral_events")
        .where("event_type", "checkup.scan_completed")
        .where("created_at", ">=", since)
        .whereRaw("metadata LIKE '%ozMoments%'")
        .orderBy("created_at", "desc")
        .limit(10)
        .catch(() => []);

      // Cancel reasons in the window
      const cancelReasons = await db("behavioral_events")
        .where("event_type", "billing.cancel_reason")
        .where("created_at", ">=", since)
        .select("metadata")
        .catch(() => []);

      const reasonCounts: Record<string, number> = {};
      for (const event of cancelReasons) {
        try {
          const meta = typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata;
          const reason = meta?.reason || "unknown";
          reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        } catch {}
      }

      // Conversion rates
      const scanToGate = counts["checkup.scan_completed"] > 0
        ? Math.round((counts["checkup.gate_viewed"] / counts["checkup.scan_completed"]) * 100)
        : 0;
      const gateToCapture = counts["checkup.gate_viewed"] > 0
        ? Math.round((counts["checkup.email_captured"] / counts["checkup.gate_viewed"]) * 100)
        : 0;
      const captureToTTFV = counts["checkup.email_captured"] > 0
        ? Math.round((counts["ttfv.yes"] / counts["checkup.email_captured"]) * 100)
        : 0;
      const ttfvToSubscribe = counts["ttfv.yes"] > 0
        ? Math.round((counts["billing.subscription_created"] / counts["ttfv.yes"]) * 100)
        : 0;
      const endToEnd = counts["checkup.scan_started"] > 0
        ? Math.round((counts["billing.subscription_created"] / counts["checkup.scan_started"]) * 100)
        : 0;

      return res.json({
        success: true,
        window: { days, since: since.toISOString() },
        funnel: {
          scans_started: counts["checkup.scan_started"],
          scans_completed: counts["checkup.scan_completed"],
          gates_viewed: counts["checkup.gate_viewed"],
          emails_captured: counts["checkup.email_captured"],
          accounts_created: counts["checkup.account_created"],
          first_logins: counts["checkup.first_login"],
          ttfv_yes: counts["ttfv.yes"],
          subscriptions: counts["billing.subscription_created"],
        },
        conversion_rates: {
          scan_to_gate: `${scanToGate}%`,
          gate_to_capture: `${gateToCapture}%`,
          capture_to_ttfv: `${captureToTTFV}%`,
          ttfv_to_subscribe: `${ttfvToSubscribe}%`,
          end_to_end: `${endToEnd}%`,
        },
        viral: {
          shares: Number(shareCount?.count || 0),
          competitor_invites: Number(competitorInviteCount?.count || 0),
          referral_signups: Number(referralSignups?.count || 0),
        },
        cancel_reasons: reasonCounts,
        source_channels: sourceChannels,
      });
    } catch (error: any) {
      console.error("[CheckupFunnel] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load funnel data" });
    }
  },
);

export default checkupFunnelRoutes;
