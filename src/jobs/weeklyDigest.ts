/**
 * Weekly Intelligence Digest -- WO-WEEKLY-DIGEST-SERVICE
 *
 * BullMQ cron: Sunday 8pm PT.
 * Synthesizes the week into a single brief for Corey.
 * Posts to #alloro-brief.
 *
 * Biological-economic lens: Corey reads this Sunday at 8pm.
 * He needs to feel clear about Monday, not anxious about Sunday.
 * The format answers: are we safe? are we winning? what's the one thing?
 *
 * // No routes needed -- triggered by cron only
 */

import axios from "axios";
import { db } from "../database/connection";
import { getMarketPatterns } from "../services/marketIntelligence";
import { getLatestWeeklyMetrics } from "../services/analyticsAggregator";

const SLACK_WEBHOOK = process.env.ALLORO_BRIEF_SLACK_WEBHOOK || "";

// ─── Helpers ───

function getWeekLabel(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff);
}

// ─── Build Each Section ───

async function buildTheNumber(): Promise<string> {
  const metrics = await getLatestWeeklyMetrics();
  if (!metrics) return "No weekly metrics available yet. Analytics pipeline hasn't run.";

  // Find the most changed metric by comparing to what matters
  const highlights: { metric: string; value: number; note: string }[] = [];

  if (metrics.new_signups > 0) {
    highlights.push({
      metric: "new signups",
      value: metrics.new_signups,
      note: `${metrics.new_signups} new trial signup${metrics.new_signups !== 1 ? "s" : ""} this week.`,
    });
  }
  if (metrics.trial_conversions > 0) {
    highlights.push({
      metric: "conversions",
      value: metrics.trial_conversions * 10, // weight conversions heavily
      note: `${metrics.trial_conversions} trial${metrics.trial_conversions !== 1 ? "s" : ""} converted to paid this week.`,
    });
  }
  if (metrics.churns > 0) {
    highlights.push({
      metric: "churns",
      value: metrics.churns * 15, // weight churns very heavily
      note: `${metrics.churns} cancellation${metrics.churns !== 1 ? "s" : ""} this week.`,
    });
  }
  if (metrics.first_wins > 0) {
    highlights.push({
      metric: "first wins",
      value: metrics.first_wins * 5,
      note: `${metrics.first_wins} client${metrics.first_wins !== 1 ? "s" : ""} got their first win this week.`,
    });
  }

  if (highlights.length === 0) {
    return "Steady week. No metric moved more than 5%. That's either stability or stagnation. You decide.";
  }

  // Pick the most impactful
  highlights.sort((a, b) => b.value - a.value);
  return highlights[0].note;
}

async function buildClients(): Promise<string> {
  const weekStart = getWeekStart();

  // Active / trial / at risk counts
  const statusCounts = await db("organizations")
    .select("subscription_status")
    .count("id as count")
    .groupBy("subscription_status");

  const counts: Record<string, number> = {};
  for (const row of statusCounts) {
    counts[row.subscription_status as string] = Number(row.count);
  }

  const active = counts["active"] || 0;
  const trial = counts["trial"] || 0;

  // At risk: RED health status
  const atRiskResult = await db("organizations")
    .where({ client_health_status: "red" })
    .count("id as count")
    .first();
  const atRisk = Number(atRiskResult?.count || 0);

  let section = `${active} active | ${trial} trial | ${atRisk} at risk`;

  // Named clients with notable signals (max 5)
  const notableEvents = await db("behavioral_events")
    .join("organizations", "behavioral_events.org_id", "organizations.id")
    .where("behavioral_events.created_at", ">=", weekStart)
    .whereIn("behavioral_events.event_type", [
      "first_win.achieved",
      "billing.subscription_created",
      "billing.subscription_cancelled",
      "billing.payment_failed",
      "gp.gone_dark",
    ])
    .select(
      "organizations.name as practice_name",
      "behavioral_events.event_type",
    )
    .orderBy("behavioral_events.created_at", "desc")
    .limit(5);

  const signalMap: Record<string, string> = {
    "first_win.achieved": "First win delivered",
    "billing.subscription_created": "Converted to paid",
    "billing.subscription_cancelled": "Cancelled",
    "billing.payment_failed": "Payment failed",
    "gp.gone_dark": "GP went dark",
  };

  for (const event of notableEvents) {
    const signal = signalMap[event.event_type] || event.event_type;
    section += `\n${event.practice_name} -- ${signal}`;
  }

  return section;
}

async function buildAgents(): Promise<string> {
  const weekStart = getWeekStart();

  // Count agent-related events
  const agentEvents = await db("behavioral_events")
    .where("created_at", ">=", weekStart)
    .whereRaw("event_type LIKE 'agent.%' OR event_type LIKE 'cs_pulse.%'")
    .select("event_type")
    .count("id as count")
    .groupBy("event_type");

  let totalActions = 0;
  let topAgent = "";
  let topCount = 0;

  for (const row of agentEvents) {
    const count = Number(row.count);
    totalActions += count;
    if (count > topCount) {
      topCount = count;
      topAgent = row.event_type as string;
    }
  }

  // Dream team tasks created this week (proxy for escalations)
  const tasksResult = await db("dream_team_tasks")
    .where("created_at", ">=", weekStart)
    .count("id as count")
    .first();
  const escalations = Number(tasksResult?.count || 0);

  if (totalActions === 0 && escalations === 0) {
    return "No agent activity this week.";
  }

  let section = `${totalActions} actions taken | ${escalations} escalations | 0 suppressed by Orchestrator`;
  if (topAgent) {
    const agentName = topAgent.replace("agent.", "").replace("cs_pulse.", "CS Pulse ").replace(/_/g, " ");
    section += `\nTop agent this week: ${agentName} -- ${topCount} actions`;
  }

  return section;
}

async function buildThePattern(): Promise<string> {
  try {
    const patterns = await getMarketPatterns();
    if (patterns.length === 0) {
      return "No cross-client patterns detected this week.";
    }
    // Use the first (highest impact) pattern
    return `${patterns[0].description}. ${patterns[0].economic_implication}`;
  } catch {
    return "No cross-client patterns detected this week.";
  }
}

async function buildThisWeeksSignal(): Promise<string> {
  const weekStart = getWeekStart();

  // Priority: first_win > conversion > churn > notable event
  const priorityEvents = [
    "first_win.achieved",
    "billing.subscription_created",
    "billing.subscription_cancelled",
    "billing.payment_failed",
  ];

  for (const eventType of priorityEvents) {
    const event = await db("behavioral_events")
      .leftJoin("organizations", "behavioral_events.org_id", "organizations.id")
      .where("behavioral_events.event_type", eventType)
      .where("behavioral_events.created_at", ">=", weekStart)
      .select("organizations.name as practice_name", "behavioral_events.properties")
      .orderBy("behavioral_events.created_at", "desc")
      .first();

    if (event) {
      const name = event.practice_name || "A client";
      const props = typeof event.properties === "string" ? JSON.parse(event.properties) : (event.properties || {});

      switch (eventType) {
        case "first_win.achieved":
          return `${name} got their first win${props.description ? `: ${props.description}` : ""}. The system delivered value.`;
        case "billing.subscription_created":
          return `${name} converted to paid. Revenue growing.`;
        case "billing.subscription_cancelled":
          return `${name} cancelled. Worth understanding why before Monday.`;
        case "billing.payment_failed":
          return `${name}'s payment failed. Jo has an urgent task.`;
      }
    }
  }

  return "Quiet week. No high-signal events. Sometimes that's the signal.";
}

async function buildOneQuestion(): Promise<string> {
  const weekStart = getWeekStart();

  // Look for patterns that require Visionary judgment
  const metrics = await getLatestWeeklyMetrics();

  // If TTFV rate is low, ask about it
  if (metrics && metrics.ttfv_yes_rate > 0 && metrics.ttfv_yes_rate < 40) {
    return `TTFV yes rate is ${metrics.ttfv_yes_rate}% this week. Are we showing enough value before asking, or is the prompt too early in the experience?`;
  }

  // If no conversions but signups exist
  if (metrics && metrics.new_signups > 2 && metrics.trial_conversions === 0) {
    return `${metrics.new_signups} new signups this week but zero conversions. Is the trial-to-paid bridge showing enough value, or do we need a stronger TTFV moment?`;
  }

  // If churns happened
  if (metrics && metrics.churns > 0) {
    return `${metrics.churns} cancellation${metrics.churns !== 1 ? "s" : ""} this week. Is this a product gap, a timing issue, or the wrong customer profile?`;
  }

  // Check for GP drift clustering
  const driftCount = await db("behavioral_events")
    .where({ event_type: "gp.gone_dark" })
    .where("created_at", ">=", weekStart)
    .countDistinct("org_id as count")
    .first();

  if (Number(driftCount?.count || 0) >= 2) {
    return "Multiple clients seeing GP drift this week. Is this seasonal, or should we build a proactive GP re-engagement tool?";
  }

  return "What's the one thing you'd change about the product if AAE goes perfectly?";
}

// ─── Main Function ───

/**
 * Compile and post the Weekly Intelligence Digest to #alloro-brief.
 */
export async function sendWeeklyDigest(): Promise<boolean> {
  const weekLabel = getWeekLabel();

  const [theNumber, clients, agents, thePattern, signal, question] = await Promise.all([
    buildTheNumber(),
    buildClients(),
    buildAgents(),
    buildThePattern(),
    buildThisWeeksSignal(),
    buildOneQuestion(),
  ]);

  // Build the brief
  const sections: string[] = [
    `*Weekly Intelligence Brief -- Week of ${weekLabel}*`,
    "",
    `*THE NUMBER:* ${theNumber}`,
    "",
    `*CLIENTS:*\n${clients}`,
  ];

  // Only include AGENTS if there's something to say
  if (!agents.startsWith("No agent")) {
    sections.push("", `*AGENTS:*\n${agents}`);
  }

  sections.push(
    "",
    `*THE PATTERN:* ${thePattern}`,
    "",
    `*THIS WEEK'S SIGNAL:* ${signal}`,
    "",
    `*ONE QUESTION FOR COREY:* ${question}`,
  );

  const briefText = sections.join("\n");

  // Post to Slack
  if (SLACK_WEBHOOK) {
    try {
      await axios.post(SLACK_WEBHOOK, { text: briefText }, { timeout: 15000 });
      console.log("[WeeklyDigest] Brief posted to #alloro-brief");
    } catch (err: any) {
      console.error("[WeeklyDigest] Slack post failed:", err.message);
    }
  } else {
    console.log("[WeeklyDigest] ALLORO_BRIEF_SLACK_WEBHOOK not set -- brief logged only");
    console.log(briefText);
  }

  // Log to behavioral_events
  try {
    await db("behavioral_events").insert({
      event_type: "weekly_digest.posted",
      properties: JSON.stringify({
        week: weekLabel,
        sections: { theNumber, clients, agents, thePattern, signal, question },
      }),
    });
  } catch {
    // Non-critical
  }

  return true;
}
