/**
 * Competitive Monitoring Cron
 *
 * Execution layer for the Competitive Intelligence Agent.
 * BullMQ cron: Tuesday 6am PT.
 *
 * For each active org:
 * 1. Fetch top competitor from latest weekly_ranking_snapshot
 * 2. Query Places API for competitor's current review count
 * 3. Compare to last Tuesday's count
 * 4. If delta >= 5: log disruption event, queue Tuesday alert email
 * 5. Update stored count for next week's comparison
 */

import axios from "axios";
import { db } from "../database/connection";
import { BehavioralEventModel } from "../models/BehavioralEventModel";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API;
const PLACES_API_BASE = "https://places.googleapis.com/v1";
const N8N_WEBHOOK_URL = process.env.ALLORO_N8N_WEBHOOK_URL;

// ─── Types ──────────────────────────────────────────────────────────

interface DisruptionEvent {
  orgId: number;
  orgName: string;
  competitorName: string;
  reviewsAdded: number;
  newTotal: number;
  previousTotal: number;
  clientReviewCount: number;
  gap: number;
}

// ─── Main Cron Entry Point ──────────────────────────────────────────

/**
 * Run competitive monitoring for all active orgs.
 * Called by BullMQ cron every Tuesday 6am PT.
 */
export async function runCompetitiveMonitoring(): Promise<{
  scanned: number;
  disruptions: number;
  errors: number;
}> {
  let scanned = 0;
  let disruptions = 0;
  let errors = 0;

  try {
    // Get all orgs with ranking data
    const orgs = await db("organizations")
      .whereIn("subscription_status", ["active", "trial"])
      .select("id", "name", "competitor_review_count_last_tuesday");

    for (const org of orgs) {
      try {
        const result = await checkCompetitorForOrg(org);
        scanned++;
        if (result) disruptions++;
      } catch (err: any) {
        console.error(`[CompetitiveMonitoring] Error for org ${org.id}:`, err.message);
        errors++;
      }
    }

    console.log(
      `[CompetitiveMonitoring] Complete: ${scanned} scanned, ${disruptions} disruptions, ${errors} errors`,
    );
  } catch (error: any) {
    console.error("[CompetitiveMonitoring] Cron error:", error.message);
  }

  return { scanned, disruptions, errors };
}

// ─── Single Org Check ───────────────────────────────────────────────

/**
 * Check a single org's top competitor for material review changes.
 * Returns the disruption event if delta >= 5, null otherwise.
 */
export async function checkCompetitorForOrg(org: {
  id: number;
  name: string;
  competitor_review_count_last_tuesday?: number | null;
}): Promise<DisruptionEvent | null> {
  // Get latest ranking snapshot for this org
  const snapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: org.id })
    .orderBy("week_start", "desc")
    .first();

  if (!snapshot?.competitor_name) return null;

  const competitorName = snapshot.competitor_name;
  const clientReviewCount = snapshot.client_review_count || 0;

  // Get competitor's current review count from Places API
  const currentReviewCount = await fetchCompetitorReviewCount(competitorName, snapshot);
  if (currentReviewCount === null) return null;

  // Compare to last Tuesday's count
  const previousCount = org.competitor_review_count_last_tuesday ?? snapshot.competitor_review_count ?? 0;
  const delta = currentReviewCount - previousCount;

  // Update stored count for next week
  await db("organizations")
    .where({ id: org.id })
    .update({ competitor_review_count_last_tuesday: currentReviewCount });

  // Check materiality threshold
  if (delta < 5) return null;

  // Material disruption detected
  const gap = currentReviewCount - clientReviewCount;

  const disruption: DisruptionEvent = {
    orgId: org.id,
    orgName: org.name,
    competitorName,
    reviewsAdded: delta,
    newTotal: currentReviewCount,
    previousTotal: previousCount,
    clientReviewCount,
    gap,
  };

  // Log behavioral event
  await BehavioralEventModel.create({
    event_type: "competitor.disruption_detected",
    org_id: org.id,
    properties: {
      competitor_name: competitorName,
      reviews_added: delta,
      new_total: currentReviewCount,
      previous_total: previousCount,
      client_review_count: clientReviewCount,
      gap,
    },
  });

  // Queue Tuesday alert email via n8n
  await sendTuesdayAlert(disruption);

  console.log(
    `[CompetitiveMonitoring] Disruption: ${competitorName} +${delta} reviews (now ${currentReviewCount}) for ${org.name}`,
  );

  return disruption;
}

// ─── Places API Lookup ──────────────────────────────────────────────

async function fetchCompetitorReviewCount(
  competitorName: string,
  snapshot: any,
): Promise<number | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn("[CompetitiveMonitoring] GOOGLE_PLACES_API not set");
    return null;
  }

  try {
    // Use text search to find the competitor and get current review count
    const response = await axios.post(
      `${PLACES_API_BASE}/places:searchText`,
      {
        textQuery: competitorName,
        maxResultCount: 1,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask": "places.userRatingCount,places.displayName",
        },
        timeout: 10000,
      },
    );

    const place = response.data?.places?.[0];
    if (!place) return null;

    return place.userRatingCount || null;
  } catch (error: any) {
    console.error(`[CompetitiveMonitoring] Places API error for ${competitorName}:`, error.message);
    // Fall back to stored count if API fails
    return snapshot.competitor_review_count || null;
  }
}

// ─── Tuesday Alert Email ────────────────────────────────────────────

async function sendTuesdayAlert(disruption: DisruptionEvent): Promise<void> {
  if (!N8N_WEBHOOK_URL) {
    console.warn("[CompetitiveMonitoring] ALLORO_N8N_WEBHOOK_URL not set, skipping alert");
    return;
  }

  // Get the org owner's email
  const adminUser = await db("organization_users")
    .where({ organization_id: disruption.orgId, role: "admin" })
    .join("users", "users.id", "organization_users.user_id")
    .first();

  if (!adminUser?.email) return;

  const payload = {
    email_type: "tuesday_alert",
    recipient_email: adminUser.email,
    practice_name: disruption.orgName,
    doctor_name: adminUser.first_name || adminUser.name || "Doctor",
    subject_line: `${disruption.competitorName} added ${disruption.reviewsAdded} reviews this week`,
    competitor_name: disruption.competitorName,
    reviews_added: disruption.reviewsAdded,
    competitor_total: disruption.newTotal,
    client_total: disruption.clientReviewCount,
    gap: disruption.gap,
    action_text: "See the full comparison",
    action_url: "/dashboard/rankings",
  };

  try {
    await axios.post(N8N_WEBHOOK_URL, payload, { timeout: 15000 });
  } catch (error: any) {
    console.error(`[CompetitiveMonitoring] n8n webhook failed:`, error.message);
  }
}

// T2 registers POST /api/admin/competitive-monitoring/run-now
