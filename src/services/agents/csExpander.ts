/**
 * CS Expander Agent -- Execution Service
 *
 * Runs monthly (first Monday 9 AM ET) and on first_win events.
 * For each org with first_win_attributed_at, checks health score,
 * account age, and engagement. If healthy + first win + 30+ days
 * active, creates a dream_team_task for expansion opportunity.
 *
 * Writes "expansion.opportunity_detected" event.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface ExpansionCandidate {
  orgId: number;
  orgName: string;
  firstWinAt: string;
  accountAgeDays: number;
  healthScore: number;
  reason: string;
}

interface CSExpanderSummary {
  scanned: number;
  qualified: number;
  opportunities: ExpansionCandidate[];
  scannedAt: string;
}

// ── Thresholds ──────────────────────────────────────────────────────

const MIN_ACCOUNT_AGE_DAYS = 30;
const MIN_HEALTH_SCORE = 70;

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run CS Expander scan for all eligible orgs.
 */
export async function runCSExpander(): Promise<CSExpanderSummary> {
  // Find orgs with first_win_attributed_at set, active subscription
  const orgs = await db("organizations")
    .whereNotNull("first_win_attributed_at")
    .where("subscription_status", "active")
    .select("id", "name", "first_win_attributed_at", "created_at", "client_health_status");

  let scanned = 0;
  const opportunities: ExpansionCandidate[] = [];

  for (const org of orgs) {
    scanned++;

    try {
      const candidate = await evaluateOrg(org);
      if (candidate) {
        opportunities.push(candidate);
        await createExpansionTask(candidate);
        await writeExpansionEvent(candidate);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CSExpander] Failed to evaluate org ${org.id}:`,
        message,
      );
    }
  }

  const summary: CSExpanderSummary = {
    scanned,
    qualified: opportunities.length,
    opportunities,
    scannedAt: new Date().toISOString(),
  };

  console.log(
    `[CSExpander] Scanned ${scanned} orgs, ${opportunities.length} expansion opportunities`,
  );

  return summary;
}

/**
 * Run CS Expander for a single org (triggered by first_win event).
 */
export async function runCSExpanderForOrg(
  orgId: number,
): Promise<ExpansionCandidate | null> {
  const org = await db("organizations")
    .where({ id: orgId })
    .whereNotNull("first_win_attributed_at")
    .where("subscription_status", "active")
    .select("id", "name", "first_win_attributed_at", "created_at", "client_health_status")
    .first();

  if (!org) return null;

  const candidate = await evaluateOrg(org);
  if (candidate) {
    await createExpansionTask(candidate);
    await writeExpansionEvent(candidate);
  }

  return candidate;
}

// ── Evaluation ──────────────────────────────────────────────────────

async function evaluateOrg(org: any): Promise<ExpansionCandidate | null> {
  // Calculate account age
  const createdAt = new Date(org.created_at);
  const now = new Date();
  const accountAgeDays = Math.floor(
    (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS) return null;

  // Get health score from the most recent client_health.scored event
  const healthEvent = await db("behavioral_events")
    .where({ org_id: org.id, event_type: "client_health.scored" })
    .orderBy("created_at", "desc")
    .first();

  let healthScore = 0;
  if (healthEvent) {
    try {
      const props =
        typeof healthEvent.properties === "string"
          ? JSON.parse(healthEvent.properties)
          : healthEvent.properties;
      healthScore = props.score ?? 0;
    } catch {
      // Default to 0
    }
  }

  // Also consider the stored health status
  if (org.client_health_status === "red") return null;

  if (healthScore < MIN_HEALTH_SCORE && org.client_health_status !== "green") {
    return null;
  }

  // Check recent engagement (login within 14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recentActivity = await db("behavioral_events")
    .where({ org_id: org.id })
    .where("created_at", ">=", fourteenDaysAgo)
    .whereIn("event_type", ["dashboard.viewed", "one_action.completed", "email.opened"])
    .first();

  if (!recentActivity) return null;

  // Check for existing open expansion task to avoid duplicates
  const existingTask = await db("dream_team_tasks")
    .where({ status: "open", source_type: "cs_expander" })
    .whereRaw("title LIKE ?", [`%${org.name}%`])
    .first();

  if (existingTask) {
    console.log(
      `[CSExpander] Open expansion task already exists for ${org.name}, skipping`,
    );
    return null;
  }

  return {
    orgId: org.id,
    orgName: org.name,
    firstWinAt: org.first_win_attributed_at,
    accountAgeDays,
    healthScore,
    reason: `First win on ${new Date(org.first_win_attributed_at).toLocaleDateString()}, ${accountAgeDays} days active, health ${org.client_health_status || "green"}`,
  };
}

// ── Writers ─────────────────────────────────────────────────────────

async function createExpansionTask(
  candidate: ExpansionCandidate,
): Promise<void> {
  await db("dream_team_tasks")
    .insert({
      id: db.raw("gen_random_uuid()"),
      owner_name: "Corey",
      title: `Expansion opportunity: ${candidate.orgName}`,
      description: `CS Expander identified ${candidate.orgName} as expansion-ready. ${candidate.reason}. Health score: ${candidate.healthScore}. Account age: ${candidate.accountAgeDays} days. Consider referral activation or stage progression conversation.`,
      status: "open",
      priority: "medium",
      source_type: "cs_expander",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CSExpander] Failed to create task for ${candidate.orgName}:`,
        message,
      );
    });
}

async function writeExpansionEvent(
  candidate: ExpansionCandidate,
): Promise<void> {
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "expansion.opportunity_detected",
      org_id: candidate.orgId,
      properties: JSON.stringify({
        org_name: candidate.orgName,
        first_win_at: candidate.firstWinAt,
        account_age_days: candidate.accountAgeDays,
        health_score: candidate.healthScore,
        reason: candidate.reason,
      }),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CSExpander] Failed to write expansion event for ${candidate.orgName}:`,
        message,
      );
    });
}
