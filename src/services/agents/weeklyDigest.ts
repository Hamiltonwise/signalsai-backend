/**
 * Weekly Digest Agent -- Execution Service
 *
 * Runs Sunday 8pm PT.
 * Aggregates the entire week's behavioral_events, agent outputs,
 * client health scores, and competitive moves into a structured
 * weekly summary for Corey.
 *
 * Writes to behavioral_events as "digest.weekly_summary".
 * Data-driven (SQL aggregation only). No AI calls.
 */

import { db } from "../../database/connection";

// ── Types ──────────────────────────────────────────────────────────

interface WeeklyDigestData {
  weekOf: string;
  generatedAt: string;

  // THE NUMBER
  topMetric: {
    label: string;
    value: string;
    direction: "up" | "down" | "new" | "steady";
    context: string;
  };

  // CLIENTS
  clients: {
    active: number;
    trial: number;
    atRisk: number;
    notableSignals: Array<{ orgName: string; signal: string }>;
  };

  // AGENTS
  agents: {
    totalActions: number;
    totalEscalations: number;
    topAgent: string;
    topAgentActions: number;
    agentBreakdown: Record<string, number>;
  };

  // EVENTS SUMMARY
  events: {
    totalEvents: number;
    byType: Record<string, number>;
    competitorMoves: number;
    reviewActivity: number;
    checkupsSubmitted: number;
    newSignups: number;
  };

  // MARKET SIGNALS (from Market Signal Scout + Technology Horizon)
  marketSignals: {
    totalSignals: number;
    p0Count: number;
    techSignals: number;
  };

  // AEO COVERAGE (from AEO Monitor)
  aeoCoverage: {
    queriesPresent: number;
    queriesChecked: number;
  };

  // SEO PERFORMANCE (from Programmatic SEO Agent)
  seoPerformance: {
    totalPages: number;
    rising: number;
    declining: number;
  };
}

// ── Core ───────────────────────────────────────────────────────────

/**
 * Run the Weekly Digest aggregation.
 */
export async function runWeeklyDigest(): Promise<WeeklyDigestData> {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekOf = weekStart.toISOString().split("T")[0];

  console.log(`[WeeklyDigest] Generating digest for week of ${weekOf}...`);

  // Gather all data in parallel
  const [
    clientData,
    agentData,
    eventData,
    marketData,
    aeoData,
    seoData,
  ] = await Promise.all([
    gatherClientData(weekStart),
    gatherAgentData(weekStart),
    gatherEventData(weekStart),
    gatherMarketData(weekStart),
    gatherAEOData(weekStart),
    gatherSEOData(weekStart),
  ]);

  // Determine THE NUMBER (most notable metric this week)
  const topMetric = determineTopMetric(clientData, eventData, agentData);

  const digest: WeeklyDigestData = {
    weekOf,
    generatedAt: now.toISOString(),
    topMetric,
    clients: clientData,
    agents: agentData,
    events: eventData,
    marketSignals: marketData,
    aeoCoverage: aeoData,
    seoPerformance: seoData,
  };

  // Write digest to behavioral_events
  await writeDigestEvent(digest);

  console.log(
    `[WeeklyDigest] Digest complete: ${eventData.totalEvents} events, ${clientData.active} active clients, ${agentData.totalActions} agent actions`
  );

  return digest;
}

// ── Data Gatherers ─────────────────────────────────────────────────

async function gatherClientData(since: Date): Promise<WeeklyDigestData["clients"]> {
  try {
    // Count orgs by subscription status
    const statusCounts = await db("organizations")
      .select("subscription_status")
      .count("id as count")
      .groupBy("subscription_status");

    let active = 0;
    let trial = 0;
    let atRisk = 0;

    for (const row of statusCounts) {
      const status = String(row.subscription_status || "").toLowerCase();
      const count = parseInt(String(row.count), 10);
      if (status === "active" || status === "paid") active += count;
      else if (status === "trial" || status === "trialing") trial += count;
      else if (status === "at_risk" || status === "churning") atRisk += count;
    }

    // Get notable client signals from behavioral_events
    const notableEvents = await db("behavioral_events")
      .select("org_id", "event_type", "properties")
      .whereIn("event_type", [
        "client_health.scored",
        "milestone.achieved",
        "first_win.detected",
        "competitor.movement",
      ])
      .where("created_at", ">=", since)
      .orderBy("created_at", "desc")
      .limit(10);

    const notableSignals: Array<{ orgName: string; signal: string }> = [];
    for (const event of notableEvents) {
      if (notableSignals.length >= 5) break;
      const org = event.org_id
        ? await db("organizations").where({ id: event.org_id }).select("name").first()
        : null;
      const orgName = org?.name || `Org #${event.org_id || "system"}`;
      const props = typeof event.properties === "string"
        ? JSON.parse(event.properties)
        : event.properties || {};
      const signal = props.headline || props.description || event.event_type;
      notableSignals.push({ orgName, signal });
    }

    return { active, trial, atRisk, notableSignals };
  } catch (err: any) {
    console.error("[WeeklyDigest] Error gathering client data:", err.message);
    return { active: 0, trial: 0, atRisk: 0, notableSignals: [] };
  }
}

async function gatherAgentData(since: Date): Promise<WeeklyDigestData["agents"]> {
  try {
    // Count agent actions from behavioral_events
    const agentEvents = await db("behavioral_events")
      .select("event_type")
      .count("id as count")
      .where("created_at", ">=", since)
      .whereRaw("event_type LIKE 'agent.%' OR event_type LIKE '%.summary' OR event_type LIKE '%.scout_%' OR event_type LIKE 'aeo.%' OR event_type LIKE 'tech.%' OR event_type LIKE 'seo.%' OR event_type LIKE 'market.%' OR event_type LIKE 'competitor.%' OR event_type LIKE 'client_health.%'")
      .groupBy("event_type");

    const agentBreakdown: Record<string, number> = {};
    let totalActions = 0;
    let totalEscalations = 0;

    for (const row of agentEvents) {
      const count = parseInt(String(row.count), 10);
      agentBreakdown[row.event_type] = count;
      totalActions += count;
      if (String(row.event_type).includes("escalat")) {
        totalEscalations += count;
      }
    }

    // Find top agent by action count
    const sorted = Object.entries(agentBreakdown).sort((a, b) => b[1] - a[1]);
    const topAgent = sorted.length > 0 ? sorted[0][0] : "none";
    const topAgentActions = sorted.length > 0 ? sorted[0][1] : 0;

    return { totalActions, totalEscalations, topAgent, topAgentActions, agentBreakdown };
  } catch (err: any) {
    console.error("[WeeklyDigest] Error gathering agent data:", err.message);
    return { totalActions: 0, totalEscalations: 0, topAgent: "none", topAgentActions: 0, agentBreakdown: {} };
  }
}

async function gatherEventData(since: Date): Promise<WeeklyDigestData["events"]> {
  try {
    const eventCounts = await db("behavioral_events")
      .select("event_type")
      .count("id as count")
      .where("created_at", ">=", since)
      .groupBy("event_type");

    const byType: Record<string, number> = {};
    let totalEvents = 0;
    let competitorMoves = 0;
    let reviewActivity = 0;
    let checkupsSubmitted = 0;
    let newSignups = 0;

    for (const row of eventCounts) {
      const type = String(row.event_type);
      const count = parseInt(String(row.count), 10);
      byType[type] = count;
      totalEvents += count;

      if (type.startsWith("competitor.")) competitorMoves += count;
      if (type.includes("review")) reviewActivity += count;
      if (type === "checkup.submitted") checkupsSubmitted += count;
      if (type === "account.created") newSignups += count;
    }

    return { totalEvents, byType, competitorMoves, reviewActivity, checkupsSubmitted, newSignups };
  } catch (err: any) {
    console.error("[WeeklyDigest] Error gathering event data:", err.message);
    return { totalEvents: 0, byType: {}, competitorMoves: 0, reviewActivity: 0, checkupsSubmitted: 0, newSignups: 0 };
  }
}

async function gatherMarketData(since: Date): Promise<WeeklyDigestData["marketSignals"]> {
  try {
    const signals = await db("behavioral_events")
      .where("event_type", "market.signal_detected")
      .where("created_at", ">=", since)
      .count("id as count")
      .first();

    const p0 = await db("behavioral_events")
      .where("event_type", "market.signal_detected")
      .where("created_at", ">=", since)
      .whereRaw("properties::text LIKE '%\"tier\":\"P0\"%'")
      .count("id as count")
      .first();

    const tech = await db("behavioral_events")
      .where("event_type", "tech.horizon_signal")
      .where("created_at", ">=", since)
      .count("id as count")
      .first();

    return {
      totalSignals: parseInt(String(signals?.count || 0), 10),
      p0Count: parseInt(String(p0?.count || 0), 10),
      techSignals: parseInt(String(tech?.count || 0), 10),
    };
  } catch (err: any) {
    console.error("[WeeklyDigest] Error gathering market data:", err.message);
    return { totalSignals: 0, p0Count: 0, techSignals: 0 };
  }
}

async function gatherAEOData(since: Date): Promise<WeeklyDigestData["aeoCoverage"]> {
  try {
    const latest = await db("behavioral_events")
      .where("event_type", "aeo.weekly_summary")
      .where("created_at", ">=", since)
      .orderBy("created_at", "desc")
      .first();

    if (!latest) return { queriesPresent: 0, queriesChecked: 0 };

    const props = typeof latest.properties === "string"
      ? JSON.parse(latest.properties)
      : latest.properties || {};

    return {
      queriesPresent: props.queries_present || 0,
      queriesChecked: props.queries_checked || 0,
    };
  } catch (err: any) {
    console.error("[WeeklyDigest] Error gathering AEO data:", err.message);
    return { queriesPresent: 0, queriesChecked: 0 };
  }
}

async function gatherSEOData(since: Date): Promise<WeeklyDigestData["seoPerformance"]> {
  try {
    const latest = await db("behavioral_events")
      .where("event_type", "seo.weekly_summary")
      .where("created_at", ">=", since)
      .orderBy("created_at", "desc")
      .first();

    if (!latest) return { totalPages: 0, rising: 0, declining: 0 };

    const props = typeof latest.properties === "string"
      ? JSON.parse(latest.properties)
      : latest.properties || {};

    return {
      totalPages: props.total_pages || 0,
      rising: props.rising || 0,
      declining: props.declining || 0,
    };
  } catch (err: any) {
    console.error("[WeeklyDigest] Error gathering SEO data:", err.message);
    return { totalPages: 0, rising: 0, declining: 0 };
  }
}

// ── Top Metric ─────────────────────────────────────────────────────

function determineTopMetric(
  clients: WeeklyDigestData["clients"],
  events: WeeklyDigestData["events"],
  agents: WeeklyDigestData["agents"]
): WeeklyDigestData["topMetric"] {
  // Priority: new signups > checkups > competitor moves > agent actions
  if (events.newSignups > 0) {
    return {
      label: "New signups",
      value: String(events.newSignups),
      direction: "new",
      context: `${events.newSignups} new account(s) created this week.`,
    };
  }

  if (events.checkupsSubmitted > 0) {
    return {
      label: "Checkups submitted",
      value: String(events.checkupsSubmitted),
      direction: events.checkupsSubmitted > 3 ? "up" : "steady",
      context: `${events.checkupsSubmitted} checkup(s) submitted. Each one is a potential client in an active evaluation state.`,
    };
  }

  if (events.competitorMoves > 0) {
    return {
      label: "Competitor moves detected",
      value: String(events.competitorMoves),
      direction: events.competitorMoves > 5 ? "up" : "steady",
      context: `${events.competitorMoves} competitive movement(s) across client markets.`,
    };
  }

  if (agents.totalActions > 0) {
    return {
      label: "Agent actions",
      value: String(agents.totalActions),
      direction: "steady",
      context: `${agents.totalActions} automated actions taken. Top agent: ${agents.topAgent}.`,
    };
  }

  return {
    label: "Activity",
    value: "Quiet week",
    direction: "steady",
    context: "No significant metric movements this week. That is either stability or stagnation.",
  };
}

// ── Writers ────────────────────────────────────────────────────────

async function writeDigestEvent(digest: WeeklyDigestData): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "digest.weekly_summary",
      properties: JSON.stringify(digest),
    });
  } catch (err: any) {
    console.error(
      `[WeeklyDigest] Failed to write digest event:`,
      err.message
    );
  }
}
