/**
 * Admin Signal Route
 *
 * GET /api/admin/signal — Returns the single most significant event
 * across all accounts in the past 7 days as one sentence.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const signalRoutes = express.Router();

signalRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Look for the most significant behavioral event in the past 7 days
      // Priority: checkup completions, email captures, scan completions
      const recentEvents = await db("behavioral_events")
        .where("created_at", ">=", sevenDaysAgo)
        .orderBy("created_at", "desc")
        .limit(50);

      if (!recentEvents || recentEvents.length === 0) {
        return res.json({
          signal: "Alloro is watching. First signals arrive after your next agent run.",
          generated_at: new Date().toISOString(),
        });
      }

      // Parse properties for events that have them
      const parsed = recentEvents.map((e: any) => ({
        ...e,
        properties: typeof e.properties === "string" ? JSON.parse(e.properties) : e.properties,
      }));

      // Find the most interesting signal — prioritize by event type
      const priorityOrder = [
        "checkup.email_captured",
        "checkup.scan_completed",
        "checkup.gate_viewed",
        "checkup.started",
        "result_email.sent",
      ];

      let bestEvent = null;
      for (const eventType of priorityOrder) {
        bestEvent = parsed.find((e: any) => e.event_type === eventType);
        if (bestEvent) break;
      }

      if (!bestEvent) {
        bestEvent = parsed[0];
      }

      // Generate a human-readable signal sentence
      const signal = generateSignalSentence(bestEvent, parsed);

      return res.json({
        signal,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Signal endpoint error:", err);
      return res.json({
        signal: "Alloro is watching. First signals arrive after your next agent run.",
        generated_at: new Date().toISOString(),
      });
    }
  },
);

function generateSignalSentence(
  event: any,
  allEvents: any[],
): string {
  const props = event.properties || {};

  switch (event.event_type) {
    case "checkup.email_captured": {
      const city = props.city || "their market";
      const specialty = props.specialty || "practice";
      const totalCaptures = allEvents.filter(
        (e: any) => e.event_type === "checkup.email_captured",
      ).length;
      if (totalCaptures > 1) {
        return `${totalCaptures} practices captured their email through the Checkup this week — ${specialty} owners in ${city} want to know where they stand.`;
      }
      return `A ${specialty} in ${city} just captured their email through the Checkup. The funnel is live.`;
    }
    case "checkup.scan_completed": {
      const name = props.top_competitor_name || "a competitor";
      const score = props.score;
      const competitorCount = props.competitor_count || "several";
      if (score) {
        return `A practice scored ${score} against ${competitorCount} competitors — ${name} is the one to beat.`;
      }
      return `A scan just completed against ${competitorCount} competitors. ${name} leads the pack.`;
    }
    case "checkup.gate_viewed": {
      const totalViews = allEvents.filter(
        (e: any) => e.event_type === "checkup.gate_viewed",
      ).length;
      return `${totalViews} practice${totalViews !== 1 ? "s" : ""} viewed the blur gate this week. They want to see what's behind it.`;
    }
    case "checkup.started": {
      const city = props.city || "a new market";
      const specialty = props.specialty || "A practice";
      const totalStarts = allEvents.filter(
        (e: any) => e.event_type === "checkup.started",
      ).length;
      if (totalStarts > 1) {
        return `${totalStarts} practices started a Checkup this week — ${specialty} owners in ${city} are paying attention.`;
      }
      return `${specialty} in ${city} just started a Checkup. Someone is paying attention.`;
    }
    case "result_email.sent": {
      const competitor = props.competitor_name || "their top competitor";
      return `A result email just landed — subject line called out ${competitor} by name.`;
    }
    default:
      return `${allEvents.length} signals captured this week. The system is learning.`;
  }
}

export default signalRoutes;
