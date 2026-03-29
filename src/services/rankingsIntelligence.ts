/**
 * Rankings Intelligence Service — WO31
 *
 * Generates weekly snapshots with Claude-powered bullets.
 * Called by BullMQ cron (Sunday 11PM UTC) or manual trigger.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../database/connection";
import { textSearch } from "../controllers/places/feature-services/GooglePlacesApiService";
import { checkFirstWinAttribution } from "./firstWinAttribution";
import { computeAllVelocities } from "./reviewVelocity";

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

const LLM_MODEL = "claude-sonnet-4-20250514";

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split("T")[0];
}

/**
 * Generate snapshot for a single org.
 */
export async function generateSnapshotForOrg(orgId: number): Promise<boolean> {
  const weekStart = getWeekStart();

  // Already generated?
  const existing = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId, week_start: weekStart })
    .first();
  if (existing) return false;

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return false;

  // Get org's primary location for specialty + address
  const location = await db("locations")
    .where({ organization_id: orgId, is_primary: true })
    .first();

  const specialty = org.organization_type === "health" ? "dentist" : "business";
  const address = location?.business_data?.address || org.operational_jurisdiction || "";

  // 1. Query Places API for current position
  let currentPosition: number | null = null;
  let topCompetitorName: string | null = null;
  let topCompetitorReviews = 0;
  let clientReviews = 0;

  try {
    const query = `${specialty} near ${address}`.trim();
    if (query.length > 10) {
      const results = await textSearch(query, 10);
      const orgNameLower = org.name.toLowerCase();

      for (let i = 0; i < results.length; i++) {
        const placeName = (results[i].displayName?.text || "").toLowerCase();
        if (placeName.includes(orgNameLower) || orgNameLower.includes(placeName)) {
          currentPosition = i + 1;
          clientReviews = results[i].userRatingCount || 0;
          break;
        }
      }

      // Top competitor = #1 result (if not us)
      if (results.length > 0) {
        const first = results[0];
        const firstName = (first.displayName?.text || "").toLowerCase();
        if (!firstName.includes(orgNameLower)) {
          topCompetitorName = first.displayName?.text || null;
          topCompetitorReviews = first.userRatingCount || 0;
        } else if (results.length > 1) {
          topCompetitorName = results[1].displayName?.text || null;
          topCompetitorReviews = results[1].userRatingCount || 0;
        }
      }
    }
  } catch (err: any) {
    console.error(`[RankingsIntel] Places API error for org ${orgId}:`, err.message);
  }

  // Fall back to practice_rankings if Places API didn't find us
  if (currentPosition === null) {
    const latestRanking = await db("practice_rankings")
      .where({ organization_id: orgId, status: "completed" })
      .orderBy("created_at", "desc")
      .first();
    if (latestRanking) {
      currentPosition = latestRanking.rank_position;
      const rawData = typeof latestRanking.raw_data === "string"
        ? JSON.parse(latestRanking.raw_data) : latestRanking.raw_data || {};
      clientReviews = rawData?.client_gbp?.totalReviewCount || 0;
      const comps = rawData?.competitors || [];
      if (comps[0]) {
        topCompetitorName = comps[0].name || comps[0].displayName?.text || null;
        topCompetitorReviews = comps[0].userRatingCount || comps[0].reviewCount || 0;
      }
    }
  }

  if (currentPosition === null) return false;

  // 2. Compare to last week
  const prevSnapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .where("week_start", "<", weekStart)
    .orderBy("week_start", "desc")
    .first();

  // 3. Generate 3 bullets via Claude
  let bullets: string[] = [];
  try {
    const client = getAnthropic();
    const prevPos = prevSnapshot?.position || null;
    const prevReviews = prevSnapshot?.client_review_count || 0;
    const reviewDelta = clientReviews - prevReviews;

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 500,
      system: `Generate exactly 3 bullets about what changed in this practice's competitive position this week. Format: WHAT happened + RESULT for the practice. Never say HOW (no SEO, schema, keywords). Be specific. Be brief. Use the practice's actual competitor names.`,
      messages: [{
        role: "user",
        content: `Practice: ${org.name}
Current position: #${currentPosition}${prevPos ? ` (was #${prevPos})` : " (first week)"}
Reviews: ${clientReviews}${prevReviews ? ` (was ${prevReviews}, delta: ${reviewDelta >= 0 ? "+" : ""}${reviewDelta})` : ""}
Top competitor: ${topCompetitorName || "Unknown"} at #1 with ${topCompetitorReviews} reviews
Market: ${address || specialty}`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    bullets = text.split("\n").map(b => b.replace(/^[-•*]\s*/, "").trim()).filter(Boolean).slice(0, 3);
  } catch {
    // Fallback to template bullets
    bullets = [
      `Your ranking is #${currentPosition} this week.`,
      `You have ${clientReviews} reviews.${topCompetitorName ? ` ${topCompetitorName} has ${topCompetitorReviews}.` : ""}`,
      topCompetitorName ? `${topCompetitorName} holds the #1 position.` : "Position tracked.",
    ];
  }

  // 4. Dollar figure
  const avgCaseValue = 1500;
  const compVelocity = topCompetitorReviews / 104;
  const clientVelocity = clientReviews / 104;
  const velocityGap = Math.max(0, compVelocity - clientVelocity);
  const dollarFigure = Math.round(velocityGap * 0.3 * avgCaseValue / 100) * 100;

  // 5. Finding headline
  const prevPos = prevSnapshot?.position;
  const findingHeadline = prevPos && currentPosition !== prevPos
    ? `Ranking ${currentPosition < prevPos ? "improved" : "declined"}: #${prevPos} → #${currentPosition}`
    : `Holding position #${currentPosition}`;

  // 6. Competitor note
  const competitorNote = topCompetitorName
    ? `${topCompetitorName} holds #1 with ${topCompetitorReviews} reviews this week.`
    : null;

  // Store
  await db("weekly_ranking_snapshots").insert({
    org_id: orgId,
    week_start: weekStart,
    position: currentPosition,
    keyword: specialty,
    bullets: JSON.stringify(bullets),
    competitor_note: competitorNote,
    finding_headline: findingHeadline,
    dollar_figure: dollarFigure,
    competitor_position: 1,
    competitor_name: topCompetitorName,
    competitor_review_count: topCompetitorReviews,
    client_review_count: clientReviews,
  });

  console.log(`[RankingsIntel] Snapshot: ${org.name} → #${currentPosition}, $${dollarFigure}`);

  // Write ranking change notification if position moved (feeds the bell popover)
  if (prevSnapshot?.position && currentPosition !== prevSnapshot.position) {
    const improved = currentPosition < prevSnapshot.position;
    await db("notifications").insert({
      organization_id: orgId,
      title: improved
        ? `Ranking improved to #${currentPosition}`
        : `Ranking shifted to #${currentPosition}`,
      message: improved
        ? `You moved up from #${prevSnapshot.position} to #${currentPosition}. ${competitorNote || ""}`
        : `You were #${prevSnapshot.position} last week, now #${currentPosition}. ${competitorNote || ""}`,
      type: "ranking",
      read: false,
      metadata: JSON.stringify({
        source: "ranking_snapshot",
        old_position: prevSnapshot.position,
        new_position: currentPosition,
        competitor_name: topCompetitorName,
      }),
      created_at: new Date(),
      updated_at: new Date(),
    }).catch(() => {});
  }

  // Run first win check
  await checkFirstWinAttribution(orgId).catch(() => {});

  // Compute review velocity from snapshot history
  await computeAllVelocities(orgId).catch(() => {});

  return true;
}

/**
 * Generate snapshots for ALL active orgs.
 */
export async function generateAllSnapshots(): Promise<{ generated: number; total: number }> {
  // Include subscribed orgs AND Checkup-originated signups (have checkup_score but no subscription yet)
  const orgs = await db("organizations")
    .where(function () {
      this.whereNotNull("subscription_status")
        .orWhereNotNull("checkup_score")
        .orWhere("onboarding_completed", true);
    })
    .select("id", "name");

  let generated = 0;
  for (const org of orgs) {
    try {
      const created = await generateSnapshotForOrg(org.id);
      if (created) generated++;
    } catch (err: any) {
      console.error(`[RankingsIntel] Failed for ${org.name}:`, err.message);
    }
    // Rate limit Places API
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[RankingsIntel] Generated ${generated}/${orgs.length} snapshots`);
  return { generated, total: orgs.length };
}
