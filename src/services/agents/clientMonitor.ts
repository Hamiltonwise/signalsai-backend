/**
 * Client Monitor Agent -- Execution Service
 *
 * Runs daily at 6 AM ET. Scores every active org's health based on
 * behavioral_events from the last 7 days. Classifies each org as
 * GREEN, AMBER, or RED, then takes action accordingly.
 *
 * GREEN (3+ events/week): silent, no action needed.
 * AMBER (1-2 events): writes a nudge notification.
 * RED (0 events in 7 days): creates a dream_team_task for follow-up.
 *
 * All classifications are written to behavioral_events as
 * "client_health.scored" with metadata { score, classification }.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface OrgHealth {
  orgId: number;
  orgName: string;
  eventCount: number;
  score: number;
  classification: "green" | "amber" | "red";
}

interface ClientMonitorSummary {
  green: number;
  amber: number;
  red: number;
  scoredAt: string;
  details: OrgHealth[];
}

// ── Scoring weights ─────────────────────────────────────────────────

const EVENT_WEIGHTS: Record<string, number> = {
  "dashboard.viewed": 2,
  "one_action.completed": 3,
  "review_request.sent": 3,
  "email.opened": 1,
  "checkup.submitted": 2,
  "referral.thanked": 2,
};

const DEFAULT_WEIGHT = 1;

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the Client Monitor for all active orgs.
 * Returns a summary with GREEN/AMBER/RED counts.
 */
export async function runClientMonitor(): Promise<ClientMonitorSummary> {
  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select("id", "name");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const details: OrgHealth[] = [];

  for (const org of orgs) {
    const health = await scoreOrg(org.id, org.name, sevenDaysAgo);
    details.push(health);

    // Write the health score to behavioral_events
    await db("behavioral_events")
      .insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "client_health.scored",
        org_id: org.id,
        properties: JSON.stringify({
          score: health.score,
          classification: health.classification,
          event_count: health.eventCount,
        }),
        created_at: new Date(),
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[ClientMonitor] Failed to write health event for org ${org.id}:`,
          message,
        );
      });

    // Update the org's stored health status
    await db("organizations")
      .where({ id: org.id })
      .update({ client_health_status: health.classification })
      .catch(() => {});

    // Take action based on classification
    if (health.classification === "amber") {
      await writeAmberNotification(org.id, org.name);
    } else if (health.classification === "red") {
      await createRedTask(org.id, org.name);
    }
  }

  const summary: ClientMonitorSummary = {
    green: details.filter((d) => d.classification === "green").length,
    amber: details.filter((d) => d.classification === "amber").length,
    red: details.filter((d) => d.classification === "red").length,
    scoredAt: new Date().toISOString(),
    details,
  };

  console.log(
    `[ClientMonitor] Complete: ${summary.green} green, ${summary.amber} amber, ${summary.red} red`,
  );

  return summary;
}

/**
 * Score a single org based on behavioral events in the last 7 days.
 */
async function scoreOrg(
  orgId: number,
  orgName: string,
  since: Date,
): Promise<OrgHealth> {
  const events = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", since)
    .select("event_type");

  // Count raw events
  const eventCount = events.length;

  // Calculate weighted score
  let score = 0;
  for (const event of events) {
    const eventType = event.event_type || "";
    score += EVENT_WEIGHTS[eventType] ?? DEFAULT_WEIGHT;
  }

  // Classify based on event count
  let classification: "green" | "amber" | "red";
  if (eventCount >= 3) {
    classification = "green";
  } else if (eventCount >= 1) {
    classification = "amber";
  } else {
    classification = "red";
  }

  return { orgId, orgName, eventCount, score, classification };
}

/**
 * AMBER: write a nudge notification to behavioral_events.
 */
async function writeAmberNotification(
  orgId: number,
  orgName: string,
): Promise<void> {
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "client_monitor.amber_nudge",
      org_id: orgId,
      properties: JSON.stringify({
        message: "It's been a few days. Your One Action Card is waiting.",
        org_name: orgName,
      }),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[ClientMonitor] Failed to write amber nudge for org ${orgId}:`,
        message,
      );
    });
}

/**
 * RED: create a dream_team_task for human follow-up.
 */
async function createRedTask(orgId: number, orgName: string): Promise<void> {
  // Check if there's already an open RED task for this org to avoid duplicates
  const existingTask = await db("dream_team_tasks")
    .where({ status: "open", source_type: "client_monitor" })
    .whereRaw("title LIKE ?", [`%${orgName}%`])
    .first();

  if (existingTask) {
    console.log(
      `[ClientMonitor] Open RED task already exists for ${orgName}, skipping`,
    );
    return;
  }

  await db("dream_team_tasks")
    .insert({
      id: db.raw("gen_random_uuid()"),
      owner_name: "Corey",
      title: `Account ${orgName} has been inactive for 7+ days`,
      description: `Client Monitor flagged org ${orgId} (${orgName}) as RED. Zero engagement events in the past 7 days. Proactive outreach recommended before the client disengages further.`,
      status: "open",
      priority: "high",
      source_type: "client_monitor",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[ClientMonitor] Failed to create RED task for org ${orgId}:`,
        message,
      );
    });
}
