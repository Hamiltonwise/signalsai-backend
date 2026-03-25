/**
 * Behavioral Events Admin API
 *
 * GET /api/admin/behavioral-events -- last 50 events, reverse chronological.
 * Supports ?type= filter prefix and ?limit= override (max 100).
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const behavioralEventsRoutes = express.Router();

// ─── Display text + sentiment mapping for Session Intelligence UI ───

const EVENT_DISPLAY: Record<string, { text: string; sentiment: "positive" | "neutral" | "negative" }> = {
  "first_win.achieved": { text: "First win delivered", sentiment: "positive" },
  "billing.subscription_created": { text: "New subscriber", sentiment: "positive" },
  "billing.subscription_cancelled": { text: "Cancellation", sentiment: "negative" },
  "billing.payment_failed": { text: "Payment failed", sentiment: "negative" },
  "billing.payment_succeeded": { text: "Payment received", sentiment: "positive" },
  "ttfv.yes": { text: "TTFV confirmed", sentiment: "positive" },
  "ttfv.not_yet": { text: "TTFV: not yet", sentiment: "neutral" },
  "gp.gone_dark": { text: "GP gone dark", sentiment: "negative" },
  "gp.drift_detected": { text: "GP drift detected", sentiment: "negative" },
  "milestone.achieved": { text: "Milestone reached", sentiment: "positive" },
  "cs_pulse.daily_brief": { text: "CS Pulse ran", sentiment: "neutral" },
  "referral.submitted": { text: "New GP referral submitted", sentiment: "positive" },
  "competitor.disruption_detected": { text: "Competitor disruption", sentiment: "negative" },
  "feedback.nps": { text: "NPS score received", sentiment: "neutral" },
  "monday_email.replied": { text: "Doctor replied to Monday email", sentiment: "positive" },
  "account.created": { text: "New account created", sentiment: "positive" },
  "checkup.account_created": { text: "New account created", sentiment: "positive" },
  "checkup.completed": { text: "Checkup completed", sentiment: "positive" },
  "clearpath.build_triggered": { text: "PatientPath build started", sentiment: "positive" },
  "result_email.sent": { text: "Result email sent", sentiment: "neutral" },
  "review_request.sent": { text: "Review request sent", sentiment: "positive" },
  "trial_email.sent": { text: "Trial email sent", sentiment: "neutral" },
  "pms.upload_completed": { text: "PMS data uploaded", sentiment: "positive" },
};

function getDisplayInfo(eventType: string): { display_text: string; sentiment: "positive" | "neutral" | "negative" } {
  const mapped = EVENT_DISPLAY[eventType];
  if (mapped) return { display_text: mapped.text, sentiment: mapped.sentiment };

  // Fallback: humanize the event type
  const display_text = eventType
    .replace(/\./g, ": ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Infer sentiment from keywords
  let sentiment: "positive" | "neutral" | "negative" = "neutral";
  if (/achieved|created|success|sent|confirmed|completed/.test(eventType)) sentiment = "positive";
  if (/failed|cancelled|dark|drift|error/.test(eventType)) sentiment = "negative";

  return { display_text, sentiment };
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

behavioralEventsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const typeFilter = req.query.type as string | undefined;
      const eventType = req.query.event_type as string | undefined;
      const orgIdFilter = req.query.org_id as string | undefined;
      const source = req.query.source as string | undefined;
      const hoursAgo = Number(req.query.hours_ago) || 24;
      const limit = Math.min(Number(req.query.limit) || 50, 200);

      const cutoff = new Date(Date.now() - hoursAgo * 3_600_000);

      let query = db("behavioral_events")
        .leftJoin("organizations", "behavioral_events.org_id", "organizations.id")
        .where("behavioral_events.created_at", ">=", cutoff)
        .orderBy("behavioral_events.created_at", "desc")
        .limit(limit)
        .select(
          "behavioral_events.id",
          "behavioral_events.event_type",
          "behavioral_events.org_id",
          "behavioral_events.session_id",
          "behavioral_events.properties",
          "behavioral_events.created_at as occurred_at",
          "organizations.name as practice_name",
        );

      if (typeFilter) query = query.where("behavioral_events.event_type", "like", `${typeFilter}%`);
      if (eventType) query = query.where("behavioral_events.event_type", eventType);
      if (orgIdFilter) query = query.where("behavioral_events.org_id", Number(orgIdFilter));
      if (source) {
        query = query.whereRaw(
          "behavioral_events.properties::text ILIKE ?",
          [`%${source}%`],
        );
      }

      const events = await query;

      const enriched = events.map((e: any) => {
        const { display_text, sentiment } = getDisplayInfo(e.event_type);
        return {
          id: e.id,
          event_type: e.event_type,
          display_text,
          sentiment,
          org_id: e.org_id,
          practice_name: e.practice_name || null,
          occurred_at: e.occurred_at,
          time_ago: timeAgo(e.occurred_at),
          payload: typeof e.properties === "string" ? JSON.parse(e.properties) : (e.properties || {}),
        };
      });

      return res.json({ success: true, events: enriched, count: enriched.length });
    } catch (error: any) {
      console.error("[BehavioralEvents] Fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load events" });
    }
  },
);

export default behavioralEventsRoutes;

// T2 registers this route at /api/admin/behavioral-events in src/index.ts
