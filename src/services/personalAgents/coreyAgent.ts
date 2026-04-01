/**
 * Corey Agent -- Personal AI agent for the Visionary.
 *
 * Monitors: revenue changes, customer signup/churn, Stripe payment events,
 * competitive landscape shifts, AAE pipeline progress.
 *
 * Tone: executive, concise, no fluff. Opens with the single most important thing.
 */

import { db } from "../../database/connection";
import { PersonalBrief } from "./types";

// Per-org pricing (actual contracted rates, mirrors roadmapEngine.ts)
const ORG_MONTHLY_RATE: Record<number, number> = {
  5: 2000,   // Garrison Orthodontics
  6: 3500,   // DentalEMR
  8: 1500,   // Artful Orthodontics
  21: 0,     // McPherson Endodontics (beta)
  25: 5000,  // Caswell Orthodontics (3 locations)
  34: 0,     // Alloro (team org)
  39: 1500,  // One Endodontics
  42: 0,     // Valley Endodontics (demo)
};

async function getMRRData(): Promise<{ currentMRR: number; activeCount: number }> {
  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select("id", "subscription_status");

  let totalMRR = 0;
  let activeCount = 0;

  for (const org of orgs) {
    const rate = ORG_MONTHLY_RATE[org.id];
    if (rate && rate > 0) {
      totalMRR += rate;
      activeCount++;
    }
  }

  return { currentMRR: totalMRR, activeCount };
}

async function getRecentSignups(days: number = 7): Promise<{ name: string; createdAt: string }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const orgs = await db("organizations")
    .where("created_at", ">=", since.toISOString())
    .select("name", "created_at");

  return orgs.map((o: { name: string; created_at: string }) => ({
    name: o.name,
    createdAt: o.created_at,
  }));
}

async function getAtRiskClients(inactiveDays: number = 14): Promise<{ name: string; daysSinceLogin: number }[]> {
  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .whereNotNull("first_login_at")
    .select("name", "first_login_at");

  const now = new Date();
  const atRisk: { name: string; daysSinceLogin: number }[] = [];

  for (const org of orgs) {
    const lastLogin = new Date(org.first_login_at);
    const days = Math.floor((now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24));
    if (days >= inactiveDays) {
      atRisk.push({ name: org.name, daysSinceLogin: days });
    }
  }

  return atRisk.sort((a, b) => b.daysSinceLogin - a.daysSinceLogin);
}

async function getPendingRedItems(): Promise<string[]> {
  // Red blast radius items waiting for Corey's approval from dream_team_tasks
  try {
    const tasks = await db("dream_team_tasks")
      .where({ status: "open" })
      .whereRaw("LOWER(properties::text) LIKE '%red%' OR LOWER(properties::text) LIKE '%escalat%'")
      .select("title", "properties")
      .limit(10);

    return tasks.map((t: { title: string }) => t.title);
  } catch {
    // dream_team_tasks may not exist or have different schema
    return [];
  }
}

async function getTopFinding(): Promise<string | null> {
  try {
    const event = await db("behavioral_events")
      .whereIn("event_type", [
        "intelligence.generated",
        "checkup.analyzed",
        "surprise_finding.detected",
      ])
      .orderBy("created_at", "desc")
      .select("event_type", "properties")
      .first();

    if (!event) return null;

    const props = typeof event.properties === "string"
      ? JSON.parse(event.properties)
      : event.properties;

    return props.headline || props.finding || props.summary || `${event.event_type} event detected`;
  } catch {
    return null;
  }
}

async function getOvernightActionCount(): Promise<number> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  try {
    const result = await db("behavioral_events")
      .where("created_at", ">=", yesterday.toISOString())
      .whereIn("event_type", [
        "cs_agent.response",
        "one_action_card.generated",
        "intelligence.generated",
        "checkup.analyzed",
        "personal_agent.handoff",
      ])
      .count("id as count")
      .first();

    return Number(result?.count || 0);
  } catch {
    return 0;
  }
}

export async function generateDailyBrief(_userId: number): Promise<PersonalBrief> {
  const [mrr, signups, atRisk, redItems, topFinding, overnightActions] = await Promise.all([
    getMRRData(),
    getRecentSignups(),
    getAtRiskClients(),
    getPendingRedItems(),
    getTopFinding(),
    getOvernightActionCount(),
  ]);

  const sections: PersonalBrief["sections"] = [];
  let urgentCount = 0;

  // Section 1: Revenue
  const revenueItems: string[] = [
    `MRR: $${mrr.currentMRR.toLocaleString()} across ${mrr.activeCount} paying clients`,
  ];
  if (signups.length > 0) {
    revenueItems.push(`New signups (7d): ${signups.map((s) => s.name).join(", ")}`);
  } else {
    revenueItems.push("No new signups in the last 7 days");
  }
  sections.push({ title: "Revenue", items: revenueItems });

  // Section 2: At-risk clients
  if (atRisk.length > 0) {
    urgentCount += atRisk.length;
    sections.push({
      title: "Clients at Risk (no login 14+ days)",
      items: atRisk.map((c) => `${c.name}: ${c.daysSinceLogin} days since last login`),
    });
  }

  // Section 3: Pending decisions
  if (redItems.length > 0) {
    urgentCount += redItems.length;
    sections.push({
      title: "Decisions Needing Your Approval",
      items: redItems,
    });
  }

  // Section 4: Top finding
  if (topFinding) {
    sections.push({
      title: "Top Finding",
      items: [topFinding],
    });
  }

  // Build headline: the single most important thing
  let headline: string;
  if (atRisk.length > 0) {
    headline = `${atRisk.length} client${atRisk.length === 1 ? "" : "s"} at risk. MRR at $${mrr.currentMRR.toLocaleString()}.`;
  } else if (signups.length > 0) {
    headline = `${signups.length} new signup${signups.length === 1 ? "" : "s"} this week. MRR at $${mrr.currentMRR.toLocaleString()}.`;
  } else {
    headline = `MRR steady at $${mrr.currentMRR.toLocaleString()} with ${mrr.activeCount} paying clients.`;
  }

  const decisionsNeeded = redItems.length;
  const signoff = `Your agents handled ${overnightActions} actions overnight. ${decisionsNeeded} decision${decisionsNeeded === 1 ? "" : "s"} need${decisionsNeeded === 1 ? "s" : ""} you.`;

  return { headline, sections, signoff, urgentCount };
}
