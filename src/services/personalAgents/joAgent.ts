/**
 * Jo Agent -- Personal AI agent for the Integrator.
 *
 * Monitors: client health (green/amber/red), CS triggers, trial conversions,
 * operational checklists, onboarding completion rates.
 *
 * Tone: operational, structured, action-oriented. Opens with the count of
 * things that need attention.
 */

import { db } from "../../database/connection";
import { PersonalBrief } from "./types";

interface OrgHealth {
  name: string;
  status: string;
  subscriptionStatus: string;
  daysSinceLogin: number | null;
}

async function getClientHealthGrid(): Promise<OrgHealth[]> {
  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select(
      "name",
      "subscription_status",
      "client_health_status",
      "first_login_at",
    );

  const now = new Date();

  return orgs.map((org: {
    name: string;
    subscription_status: string;
    client_health_status: string | null;
    first_login_at: string | null;
  }) => {
    let daysSinceLogin: number | null = null;
    if (org.first_login_at) {
      const last = new Date(org.first_login_at);
      daysSinceLogin = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      name: org.name,
      status: org.client_health_status || "green",
      subscriptionStatus: org.subscription_status,
      daysSinceLogin,
    };
  });
}

async function getTrialsExpiringThisWeek(): Promise<{ name: string; createdAt: string }[]> {
  // Trials typically expire 14 days after creation
  const now = new Date();
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  // Find trials created ~14 days ago (expiring within the next 7 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const trials = await db("organizations")
    .where("subscription_status", "trial")
    .whereBetween("created_at", [fourteenDaysAgo.toISOString(), sevenDaysAgo.toISOString()])
    .select("name", "created_at");

  return trials.map((t: { name: string; created_at: string }) => ({
    name: t.name,
    createdAt: t.created_at,
  }));
}

async function getIncompleteOnboarding(): Promise<string[]> {
  // Clients who signed up but never logged in
  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .whereNull("first_login_at")
    .select("name");

  return orgs.map((o: { name: string }) => o.name);
}

async function getRecentCSAlerts(): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - 1);

  try {
    const events = await db("behavioral_events")
      .where("created_at", ">=", since.toISOString())
      .whereIn("event_type", [
        "cs_agent.response",
        "cs_agent.alert",
        "churn_risk.detected",
        "client_monitor.amber",
        "client_monitor.red",
      ])
      .orderBy("created_at", "desc")
      .select("event_type", "properties", "org_id")
      .limit(10);

    return events.map((e: { event_type: string; org_id: number | null }) => {
      return `${e.event_type} (org ${e.org_id || "unknown"})`;
    });
  } catch {
    return [];
  }
}

export async function generateDailyBrief(_userId: number): Promise<PersonalBrief> {
  const [healthGrid, expiringTrials, incompleteOnboarding, csAlerts] = await Promise.all([
    getClientHealthGrid(),
    getTrialsExpiringThisWeek(),
    getIncompleteOnboarding(),
    getRecentCSAlerts(),
  ]);

  const sections: PersonalBrief["sections"] = [];
  let urgentCount = 0;

  // Categorize health
  const greenCount = healthGrid.filter((c) => c.status === "green").length;
  const amberCount = healthGrid.filter((c) => c.status === "amber").length;
  const redCount = healthGrid.filter((c) => c.status === "red").length;
  const totalClients = healthGrid.length;

  urgentCount = amberCount + redCount;

  // Section 1: Health summary
  const healthItems: string[] = [
    `${totalClients} active clients: ${greenCount} green, ${amberCount} amber, ${redCount} red`,
  ];

  // List amber and red clients by name
  const problemClients = healthGrid.filter((c) => c.status !== "green");
  for (const client of problemClients) {
    const loginInfo = client.daysSinceLogin !== null
      ? `last login ${client.daysSinceLogin}d ago`
      : "never logged in";
    healthItems.push(`[${client.status.toUpperCase()}] ${client.name} (${loginInfo})`);
  }

  sections.push({ title: "Client Health", items: healthItems });

  // Section 2: Trials expiring
  if (expiringTrials.length > 0) {
    urgentCount += expiringTrials.length;
    sections.push({
      title: "Trials Expiring This Week",
      items: expiringTrials.map((t) => t.name),
    });
  }

  // Section 3: Incomplete onboarding
  if (incompleteOnboarding.length > 0) {
    sections.push({
      title: "Onboarding Incomplete (never logged in)",
      items: incompleteOnboarding,
    });
  }

  // Section 4: CS alerts
  if (csAlerts.length > 0) {
    sections.push({
      title: "CS Alerts (last 24h)",
      items: csAlerts,
    });
  }

  // Headline: count of things needing attention
  const attentionItems = urgentCount + incompleteOnboarding.length + csAlerts.length;
  const headline = attentionItems > 0
    ? `${attentionItems} item${attentionItems === 1 ? "" : "s"} need attention today across ${totalClients} clients.`
    : `All ${totalClients} clients healthy. No items need attention.`;

  // Signoff
  const signoff = urgentCount === 0
    ? "All clients healthy"
    : `${urgentCount} need attention today.`;

  return { headline, sections, signoff, urgentCount };
}
