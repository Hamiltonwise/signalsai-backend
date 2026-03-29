/**
 * Morning Briefing Agent -- Execution Service
 *
 * Runs daily at 6:30 AM ET (after Client Monitor at 6 AM).
 * Assembles overnight signals from behavioral_events into a
 * structured summary for the admin dashboard.
 *
 * Groups by: new signups, competitor movements, review activity,
 * client health changes, milestone achievements.
 *
 * Stores the briefing in the morning_briefings table and exposes
 * via GET /api/admin/morning-briefing/latest.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface MorningBriefingSummary {
  date: string;
  newSignups: number;
  competitorMoves: number;
  reviewsReceived: number;
  clientHealth: {
    green: number;
    amber: number;
    red: number;
  };
  milestones: number;
  topEvent: string | null;
}

// ── Event type mappings ─────────────────────────────────────────────

const SIGNUP_EVENTS = ["account.created", "checkup.submitted"];
const COMPETITOR_EVENTS = [
  "competitor.reviews_surge",
  "competitor.rating_changed",
  "competitor.new_entrant",
  "competitive_scout.movement",
];
const REVIEW_EVENTS = [
  "review_request.sent",
  "review.received",
  "review_sync.completed",
];
const HEALTH_EVENTS = ["client_health.scored"];
const MILESTONE_EVENTS = [
  "milestone.achieved",
  "milestone.detected",
  "week1_win.generated",
];

// ── Core ────────────────────────────────────────────────────────────

/**
 * Assemble the morning briefing from the last 24 hours of events.
 * Stores the result in morning_briefings and returns the summary.
 */
export async function runMorningBriefing(): Promise<MorningBriefingSummary> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  // Fetch all events from the last 24 hours
  const events = await db("behavioral_events")
    .where("created_at", ">=", twentyFourHoursAgo)
    .select("event_type", "org_id", "properties", "created_at");

  // Group and count
  const newSignups = events.filter((e) =>
    SIGNUP_EVENTS.includes(e.event_type),
  ).length;

  const competitorMoves = events.filter((e) =>
    COMPETITOR_EVENTS.includes(e.event_type),
  ).length;

  const reviewsReceived = events.filter((e) =>
    REVIEW_EVENTS.includes(e.event_type),
  ).length;

  const milestones = events.filter((e) =>
    MILESTONE_EVENTS.includes(e.event_type),
  ).length;

  // Extract client health from the latest scored events
  const healthEvents = events.filter((e) =>
    HEALTH_EVENTS.includes(e.event_type),
  );
  const clientHealth = { green: 0, amber: 0, red: 0 };
  for (const he of healthEvents) {
    const props =
      typeof he.properties === "string"
        ? JSON.parse(he.properties)
        : he.properties || {};
    const classification = props.classification as
      | "green"
      | "amber"
      | "red"
      | undefined;
    if (classification && classification in clientHealth) {
      clientHealth[classification]++;
    }
  }

  // Determine the top event (most impactful signal)
  const topEvent = determineTopEvent(events);

  const today = new Date().toISOString().split("T")[0];

  const summary: MorningBriefingSummary = {
    date: today,
    newSignups,
    competitorMoves,
    reviewsReceived,
    clientHealth,
    milestones,
    topEvent,
  };

  // Store in morning_briefings table
  const tableExists = await db.schema.hasTable("morning_briefings");
  if (tableExists) {
    await db("morning_briefings")
      .insert({
        id: db.raw("gen_random_uuid()"),
        briefing_date: today,
        summary: JSON.stringify(summary),
        new_signups: newSignups,
        competitor_moves: competitorMoves,
        reviews_received: reviewsReceived,
        client_health_green: clientHealth.green,
        client_health_amber: clientHealth.amber,
        client_health_red: clientHealth.red,
        milestones,
        top_event: topEvent,
        created_at: new Date(),
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[MorningBriefing] Failed to store briefing:", message);
      });
  } else {
    console.warn(
      "[MorningBriefing] morning_briefings table does not exist, skipping storage",
    );
  }

  // Log the briefing event
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "morning_briefing.assembled",
      properties: JSON.stringify({
        date: today,
        total_events: events.length,
        new_signups: newSignups,
        competitor_moves: competitorMoves,
        reviews_received: reviewsReceived,
        milestones,
      }),
      created_at: new Date(),
    })
    .catch(() => {});

  console.log(
    `[MorningBriefing] Assembled for ${today}: ${events.length} events, ` +
      `${newSignups} signups, ${competitorMoves} competitor moves, ` +
      `${reviewsReceived} reviews, ${milestones} milestones`,
  );

  return summary;
}

/**
 * Determine the single most impactful event from the last 24 hours.
 * Priority: RED health > competitor surges > new signups > milestones.
 */
function determineTopEvent(
  events: Array<{
    event_type: string;
    org_id: number | null;
    properties: unknown;
  }>,
): string | null {
  // Check for RED client health events
  const redEvents = events.filter((e) => {
    if (e.event_type !== "client_health.scored") return false;
    const props =
      typeof e.properties === "string"
        ? JSON.parse(e.properties)
        : e.properties || {};
    return props.classification === "red";
  });
  if (redEvents.length > 0) {
    return `${redEvents.length} client(s) flagged RED. Immediate follow-up needed.`;
  }

  // Check for competitor surges
  const surges = events.filter(
    (e) => e.event_type === "competitor.reviews_surge",
  );
  if (surges.length > 0) {
    return `${surges.length} competitor review surge(s) detected overnight.`;
  }

  // Check for new signups
  const signups = events.filter((e) =>
    SIGNUP_EVENTS.includes(e.event_type),
  );
  if (signups.length > 0) {
    return `${signups.length} new signup(s) overnight.`;
  }

  // Check for milestones
  const mileEvents = events.filter((e) =>
    MILESTONE_EVENTS.includes(e.event_type),
  );
  if (mileEvents.length > 0) {
    return `${mileEvents.length} milestone(s) achieved.`;
  }

  if (events.length === 0) {
    return "Quiet night. All systems nominal.";
  }

  return `${events.length} event(s) logged overnight.`;
}
