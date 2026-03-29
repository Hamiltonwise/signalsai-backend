/**
 * Dreamweaver Agent -- Hospitality Moments
 *
 * Inspired by Will Guidara's "Unreasonable Hospitality." This agent
 * has one job: find moments where a small, personalized gesture makes
 * the business owner feel seen.
 *
 * Runs daily at 7:15 AM PT, after the Client Monitor (7:00 AM).
 *
 * Rules:
 * - Maximum 1 Dreamweaver notification per org per week (the 95/5 rule).
 * - Every message must be warm, specific, and story-worthy.
 * - Never generic. If we have data, use it. If we don't, stay silent.
 * - Writes "dreamweaver.moment_created" to behavioral_events for audit.
 */

import { db } from "../../database/connection";
import {
  prepareAgentContext,
  recordAgentAction,
  closeLoop,
} from "./agentRuntime";
import { getToneProfile, ToneProfile } from "../toneEvolution";

// ── Types ───────────────────────────────────────────────────────────

interface HotDogMoment {
  orgId: number;
  orgName: string;
  eventType: string;
  title: string;
  message: string;
  properties: Record<string, unknown>;
}

interface DreamweaverSummary {
  momentsCreated: number;
  orgsScanned: number;
  skippedRateLimit: number;
  runAt: string;
}

// ── Moment Detectors ────────────────────────────────────────────────

/**
 * Scan behavioral_events for the last 48h and detect "hot dog moments"
 * for a single org. Returns the single best moment (if any).
 */
async function detectMoment(
  orgId: number,
  orgName: string,
  orgCreatedAt: Date,
): Promise<HotDogMoment | null> {
  const fortyEightHoursAgo = new Date();
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  const events = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", fortyEightHoursAgo)
    .orderBy("created_at", "desc")
    .select("event_type", "properties", "created_at");

  const tone = getToneProfile(orgCreatedAt);

  // Priority order: we return the first match found (highest priority first)

  // 1. Milestone achieved (rank up, passed competitor, review milestone)
  const milestone = events.find((e) => e.event_type === "milestone.achieved");
  if (milestone) {
    const props = parseProps(milestone.properties);
    return {
      orgId,
      orgName,
      eventType: "milestone.achieved",
      title: "A milestone worth celebrating",
      message: craftMilestoneMessage(props, orgName, tone),
      properties: props,
    };
  }

  // 2. Five-star review received
  const fiveStarReview = events.find(
    (e) =>
      e.event_type === "review.received" &&
      parseProps(e.properties).rating === 5,
  );
  if (fiveStarReview) {
    const props = parseProps(fiveStarReview.properties);
    const snippet =
      typeof props.text === "string"
        ? props.text.slice(0, 50)
        : "";
    return {
      orgId,
      orgName,
      eventType: "review.received",
      title: "Someone noticed",
      message: snippet
        ? `A client left you 5 stars today. They said: "${snippet}${props.text && props.text.length > 50 ? "..." : ""}"`
        : "A client left you 5 stars today. That is the kind of thing that compounds.",
      properties: props,
    };
  }

  // 3. Competitor movement where client is winning
  const competitorWin = events.find(
    (e) =>
      e.event_type === "competitor.movement" &&
      parseProps(e.properties).direction === "client_gaining",
  );
  if (competitorWin) {
    const props = parseProps(competitorWin.properties);
    const competitorName = props.competitor_name || "your closest competitor";
    const reviewsGained = props.reviews_gained || "several";
    return {
      orgId,
      orgName,
      eventType: "competitor.movement",
      title: "The gap is closing",
      message: `While ${competitorName} went quiet this month, you gained ${reviewsGained} reviews. Momentum is on your side.`,
      properties: props,
    };
  }

  // 4. First login after 7+ days away
  const dashboardView = events.find(
    (e) => e.event_type === "dashboard.viewed",
  );
  if (dashboardView) {
    const previousVisit = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "dashboard.viewed" })
      .where("created_at", "<", fortyEightHoursAgo)
      .orderBy("created_at", "desc")
      .first();

    if (previousVisit) {
      const daysSinceLastVisit = Math.floor(
        (fortyEightHoursAgo.getTime() -
          new Date(previousVisit.created_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysSinceLastVisit >= 7) {
        // Find the most interesting event while they were away
        const bestEvent = await db("behavioral_events")
          .where({ org_id: orgId })
          .whereIn("event_type", [
            "milestone.achieved",
            "review.received",
            "competitor.movement",
            "ranking.changed",
          ])
          .where("created_at", ">", previousVisit.created_at)
          .orderBy("created_at", "desc")
          .first();

        const changeSummary = bestEvent
          ? summarizeEvent(bestEvent)
          : "We kept watching your market while you were away.";

        return {
          orgId,
          orgName,
          eventType: "welcome_back",
          title: "Welcome back",
          message: `Welcome back. While you were away: ${changeSummary}`,
          properties: { days_away: daysSinceLastVisit },
        };
      }
    }
  }

  // 5. Account reaches 90 days
  const daysSinceCreation = Math.floor(
    (Date.now() - orgCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysSinceCreation >= 89 && daysSinceCreation <= 91) {
    // Check we haven't already sent this milestone
    const alreadySent = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "dreamweaver.moment_created" })
      .whereRaw("properties->>'moment_type' = ?", ["90_day_milestone"])
      .first();

    if (!alreadySent) {
      return {
        orgId,
        orgName,
        eventType: "90_day_milestone",
        title: "90 days of clarity",
        message:
          "90 days of clarity. Most businesses don't make it this far. You did.",
        properties: { moment_type: "90_day_milestone", days: daysSinceCreation },
      };
    }
  }

  // 6. Referral converted
  const referralConverted = events.find(
    (e) => e.event_type === "referral.converted",
  );
  if (referralConverted) {
    const props = parseProps(referralConverted.properties);
    const referredName = props.referred_name || "A new practice";
    return {
      orgId,
      orgName,
      eventType: "referral.converted",
      title: "You made that happen",
      message: `${referredName} just joined. You made that happen.`,
      properties: props,
    };
  }

  return null;
}

// ── Message Crafting ────────────────────────────────────────────────

function craftMilestoneMessage(
  props: Record<string, unknown>,
  _orgName: string,
  tone: ToneProfile,
): string {
  const milestoneType = props.milestone_type || props.type || "achievement";

  if (milestoneType === "rank_up") {
    const newRank = props.new_value || props.new_rank;
    if (tone.formality === "familiar") {
      return newRank
        ? `You just moved to #${newRank}. The work is paying off.`
        : "You moved up in the rankings. That does not happen by accident.";
    }
    return newRank
      ? `Your market position improved to #${newRank}. Continued momentum puts you in reach of the top 3.`
      : "Your competitive position improved this week. Sustained effort compounds.";
  }

  if (milestoneType === "passed_competitor") {
    const competitorName = props.competitor_name || "a competitor";
    if (tone.formality === "familiar") {
      return `You just passed ${competitorName}. Keep going.`;
    }
    return `You passed ${competitorName} in the rankings. That gap you have been closing is gone.`;
  }

  if (milestoneType === "review_count_milestone") {
    const count = props.new_value || props.review_count;
    if (count) {
      return `${count} reviews. Every single one is proof that your clients trust you enough to say it publicly.`;
    }
    return "You hit a review milestone. Each one is a vote of confidence from a real person.";
  }

  return "Something worth celebrating happened. Check your dashboard for the details.";
}

function summarizeEvent(event: { event_type: string; properties: unknown }): string {
  const props = parseProps(event.properties);

  switch (event.event_type) {
    case "milestone.achieved":
      return props.milestone_type === "rank_up"
        ? "your market position improved."
        : "you hit a milestone.";
    case "review.received":
      return "a new review came in.";
    case "competitor.movement":
      return "a competitor's activity shifted.";
    case "ranking.changed":
      return "your ranking changed.";
    default:
      return "your market moved.";
  }
}

// ── Rate Limiting ───────────────────────────────────────────────────

/**
 * The 95/5 rule: max 1 Dreamweaver notification per org per week.
 * Returns true if we should skip this org.
 */
async function isRateLimited(orgId: number): Promise<boolean> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentMoment = await db("behavioral_events")
    .where({ org_id: orgId, event_type: "dreamweaver.moment_created" })
    .where("created_at", ">=", oneWeekAgo)
    .first();

  return !!recentMoment;
}

// ── Core Runner ─────────────────────────────────────────────────────

/**
 * Run the Dreamweaver agent across all active orgs.
 * Called daily at 7:15 AM PT.
 */
export async function runDreamweaver(): Promise<DreamweaverSummary> {
  const agentCtx = { agentName: "dreamweaver", topic: "hospitality_moments" };

  await prepareAgentContext(agentCtx);

  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select("id", "name", "created_at");

  let momentsCreated = 0;
  let skippedRateLimit = 0;

  for (const org of orgs) {
    // 95/5 rule: max 1 per week per org
    if (await isRateLimited(org.id)) {
      skippedRateLimit++;
      continue;
    }

    const moment = await detectMoment(
      org.id,
      org.name,
      new Date(org.created_at),
    );

    if (!moment) continue;

    // Write to notifications table
    await db("notifications")
      .insert({
        organization_id: org.id,
        title: moment.title,
        message: moment.message,
        type: "agent",
        priority: "normal",
        read: false,
        metadata: JSON.stringify({
          source: "dreamweaver",
          event_type: moment.eventType,
          ...moment.properties,
        }),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[Dreamweaver] Failed to write notification for org ${org.id}:`,
          message,
        );
      });

    // Write audit event to behavioral_events
    await db("behavioral_events")
      .insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "dreamweaver.moment_created",
        org_id: org.id,
        properties: JSON.stringify({
          moment_type: moment.eventType,
          title: moment.title,
          message: moment.message,
        }),
        created_at: new Date(),
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[Dreamweaver] Failed to write behavioral event for org ${org.id}:`,
          message,
        );
      });

    momentsCreated++;
  }

  const summary: DreamweaverSummary = {
    momentsCreated,
    orgsScanned: orgs.length,
    skippedRateLimit,
    runAt: new Date().toISOString(),
  };

  // Record the agent action
  await recordAgentAction(agentCtx, {
    type: "scan_complete",
    headline: `Dreamweaver: ${momentsCreated} hospitality moments created across ${orgs.length} orgs`,
    detail: `${skippedRateLimit} orgs skipped (rate limited). ${orgs.length - skippedRateLimit - momentsCreated} orgs had no qualifying moment.`,
  });

  // Close the loop
  await closeLoop(agentCtx, {
    expected: "Scan all active orgs for hospitality moments",
    actual: `${momentsCreated} moments created, ${skippedRateLimit} rate-limited, ${orgs.length} total`,
    success: true,
    learning:
      momentsCreated > 0
        ? `Created ${momentsCreated} Dreamweaver moments. Top types: ${summary.momentsCreated}`
        : "No qualifying moments found this run.",
  });

  console.log(
    `[Dreamweaver] Complete: ${momentsCreated} moments, ${skippedRateLimit} rate-limited, ${orgs.length} orgs scanned`,
  );

  return summary;
}

// ── Processor (callable from admin/cron routes) ─────────────────────

export async function processDreamweaver(): Promise<DreamweaverSummary> {
  return runDreamweaver();
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseProps(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as Record<string, any>;
  return {};
}
