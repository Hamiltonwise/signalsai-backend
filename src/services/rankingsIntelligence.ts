/**
 * Rankings Intelligence Service — WO31
 *
 * Generates weekly snapshots with Claude-powered bullets.
 * Called by BullMQ cron (Sunday 11PM UTC) or manual trigger.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../database/connection";
import { cleanCompetitorName } from "../utils/textCleaning";
import { textSearch, getPlaceDetails } from "../controllers/places/feature-services/GooglePlacesApiService";
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
export async function generateSnapshotForOrg(orgId: number, force = false): Promise<boolean> {
  const weekStart = getWeekStart();

  // Already generated? Skip unless force refresh requested.
  const existing = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId, week_start: weekStart })
    .first();
  if (existing && !force) return false;
  // If force and existing, we'll delete and recreate with fresh data
  if (existing && force) {
    await db("weekly_ranking_snapshots").where({ id: existing.id }).delete();
  }

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return false;

  // Get org's primary location for specialty + address
  const location = await db("locations")
    .where({ organization_id: orgId, is_primary: true })
    .first();

  // Parse checkup_data for market info (most reliable source of specialty + city)
  let checkupMarket: { specialty?: string; city?: string; state?: string } | null = null;
  try {
    const cdRaw = org.checkup_data;
    const cd = typeof cdRaw === "string" ? JSON.parse(cdRaw) : cdRaw;
    checkupMarket = cd?.market || null;
  } catch { /* non-blocking */ }

  // Derive search specialty: checkup_data.market.specialty > GBP category > fallback
  // NEVER use the org name as the keyword -- that produces brand searches, not market searches
  const gbpCategory = location?.business_data?.category || "";
  const specialty = checkupMarket?.specialty || gbpCategory || "business";
  const city = checkupMarket?.city || "";
  const address = city
    ? `${city}${checkupMarket?.state ? `, ${checkupMarket.state}` : ""}`
    : (location?.business_data?.address || org.operational_jurisdiction || "");

  // 1. Query Places API for current position
  let currentPosition: number | null = null;
  let topCompetitorName: string | null = null;
  let topCompetitorReviews = 0;
  let clientReviews = 0;

  // Look up client placeId from checkup_data for accurate matching
  let clientPlaceId: string | null = null;
  try {
    const orgData = await db("organizations").where({ id: orgId }).select("checkup_data").first();
    const parsed = orgData?.checkup_data
      ? (typeof orgData.checkup_data === "string" ? JSON.parse(orgData.checkup_data) : orgData.checkup_data)
      : null;
    clientPlaceId = parsed?.placeId || null;
  } catch { /* non-blocking */ }

  // Get practice coordinates from placeId for location-biased search
  let practiceLat: number | null = null;
  let practiceLng: number | null = null;
  if (clientPlaceId) {
    try {
      const placeDetails = await getPlaceDetails(clientPlaceId);
      practiceLat = placeDetails?.location?.latitude ?? null;
      practiceLng = placeDetails?.location?.longitude ?? null;
    } catch (err: any) {
      console.error(`[RankingsIntel] Failed to get coordinates for ${org.name}:`, err.message);
    }
  }

  try {
    const query = `${specialty} near ${address}`.trim();
    if (query.length > 10) {
      const locationBias = (practiceLat && practiceLng)
        ? { lat: practiceLat, lng: practiceLng, radiusMeters: 16093 } // 10 miles
        : undefined;
      const rawResults = await textSearch(query, 10, locationBias);
      const orgNameLower = org.name.toLowerCase();

      // Distance filter: remove results more than 40km (~25mi) from practice
      // locationBias is a preference, not a restriction. Google returns national
      // results for niche specialties (e.g. "Advanced Endodontics of Chicago"
      // for a Falls Church, VA endodontist). Filter them out.
      const MAX_DISTANCE_KM = 40; // ~25 miles -- realistic local service area
      const results = (practiceLat && practiceLng)
        ? rawResults.filter((r: any) => {
            const rLat = r.location?.latitude;
            const rLng = r.location?.longitude;
            if (rLat == null || rLng == null) return true; // keep if no coords (benefit of doubt)
            const dLat = (rLat - practiceLat!) * 111; // rough km per degree
            const dLng = (rLng - practiceLng!) * 111 * Math.cos(practiceLat! * Math.PI / 180);
            const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
            if (distKm > MAX_DISTANCE_KM) {
              console.log(`[RankingsIntel] Filtered out "${r.displayName?.text}" (${Math.round(distKm)}km / ${Math.round(distKm * 0.621)}mi away from ${org.name})`);
              return false;
            }
            return true;
          })
        : rawResults;

      // Match self: prefer placeId (exact), fall back to name matching
      for (let i = 0; i < results.length; i++) {
        const rPlaceId = results[i].id || null;
        if (clientPlaceId && rPlaceId === clientPlaceId) {
          currentPosition = i + 1;
          clientReviews = results[i].userRatingCount || 0;
          break;
        }
      }

      // If placeId didn't match, try name matching (stricter: require both directions or exact)
      if (currentPosition === null) {
        for (let i = 0; i < results.length; i++) {
          const placeName = (results[i].displayName?.text || "").toLowerCase();
          // Require the place name to contain the org name (not just the reverse)
          // This prevents "My Orthodontist" matching "Garrison Orthodontics"
          if (placeName.includes(orgNameLower)) {
            currentPosition = i + 1;
            clientReviews = results[i].userRatingCount || 0;
            console.log(`[RankingsIntel] Name match for ${org.name}: "${results[i].displayName?.text}" at position ${i + 1}`);
            break;
          }
        }
      }

      // Top competitor = first result that isn't us
      for (const result of results) {
        const rName = (result.displayName?.text || "").toLowerCase();
        const rPlaceId = result.id || null;

        // Skip self by placeId
        if (clientPlaceId && rPlaceId === clientPlaceId) continue;
        // Skip self or multi-location variant by name
        if (rName.includes(orgNameLower) || orgNameLower.includes(rName)) continue;

        topCompetitorName = result.displayName?.text || null;
        topCompetitorReviews = result.userRatingCount || 0;
        break;
      }
    }
  } catch (err: any) {
    console.error(`[RankingsIntel] Places API error for org ${orgId}:`, err.message);
  }

  // Fall back to practice_rankings for competitor data only (not position).
  // rank_position from practice_rankings is Alloro's internal scoring algorithm,
  // NOT the real Google position. Never display it as a Google rank.
  if (currentPosition === null) {
    const latestRanking = await db("practice_rankings")
      .where({ organization_id: orgId, status: "completed" })
      .orderBy("created_at", "desc")
      .first();
    if (latestRanking) {
      const rawData = typeof latestRanking.raw_data === "string"
        ? JSON.parse(latestRanking.raw_data) : latestRanking.raw_data || {};
      clientReviews = rawData?.client_gbp?.totalReviewCount || 0;
      const comps = rawData?.competitors || [];
      if (comps[0]) {
        topCompetitorName = comps[0].name || comps[0].displayName?.text || null;
        topCompetitorReviews = comps[0].userRatingCount || comps[0].reviewCount || 0;
      }
      // Use the internal rank only if we have no other source, and log it
      currentPosition = latestRanking.rank_position;
      console.log(`[RankingsIntel] WARNING: Using internal rank_position (${currentPosition}) for ${org.name}, not real Google position. PlaceId: ${clientPlaceId || "none"}`);
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
    const prevReviews = prevSnapshot?.client_review_count || 0;
    const reviewDelta = clientReviews - prevReviews;

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 500,
      system: `Generate exactly 3 bullets about what changed in this practice's competitive position this week. Format: WHAT happened + RESULT for the practice. Never say HOW (no SEO, schema, keywords). Never claim a specific Google ranking number (e.g. "#1" or "#3") because our position data is approximate. Focus on review counts, review gaps, and competitor activity, which are verifiable. Be specific. Be brief. Never make assumptions about competitive relationships. Report what the data shows. Do not say a competitor "is your biggest threat" or "you need to beat X." Report facts: positions, review counts, gaps. The business owner defines their own competitive priorities. CRITICAL: Never say "I need more information", "I don't have enough data", "insufficient data", or similar. Always produce 3 concrete bullets from whatever data is provided. If a field is missing, skip it and focus on what IS available.`,
      messages: [{
        role: "user",
        content: `Practice: ${org.name}
Reviews: ${clientReviews}${prevReviews ? ` (was ${prevReviews}, delta: ${reviewDelta >= 0 ? "+" : ""}${reviewDelta})` : ""}
Top competitor: ${topCompetitorName || "Unknown"} with ${topCompetitorReviews} reviews
Market: ${address || specialty}`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const garbagePhrases = ["i need more", "i don't have", "insufficient", "not enough data", "more information", "no data", "cannot determine"];
    bullets = text
      .split("\n")
      .map(b => b.replace(/^[-•*]\s*/, "").trim())
      .filter(b => b.length > 0 && !garbagePhrases.some(g => b.toLowerCase().includes(g)))
      .slice(0, 3);
  } catch {
    // Fallback to template bullets (verifiable data only, no position claims, no competitor framing)
    bullets = [
      `You have ${clientReviews} reviews this week.${topCompetitorName ? ` The leading practice in your market has ${topCompetitorReviews}.` : ""}`,
      topCompetitorName && topCompetitorReviews > clientReviews
        ? `The review gap in your market is ${topCompetitorReviews - clientReviews}.`
        : topCompetitorName
          ? `There are ${topCompetitorReviews} reviews at the leading practice in your market.`
          : "Your market is being tracked.",
      "Alloro is monitoring your competitive landscape weekly.",
    ];
  }

  // 4. Dollar figure (use vocabulary config for org's vertical, fallback to $200)
  const avgCaseValue = await getAvgCaseValueForOrg(orgId);
  const compVelocity = topCompetitorReviews / 104;
  const clientVelocity = clientReviews / 104;
  const velocityGap = Math.max(0, compVelocity - clientVelocity);
  const dollarFigure = Math.round(velocityGap * 0.3 * avgCaseValue / 100) * 100;

  // 5. Finding headline (verifiable data, no position claims)
  const prevReviewCount = prevSnapshot?.client_review_count || 0;
  const reviewChange = clientReviews - prevReviewCount;
  const findingHeadline = topCompetitorName
    ? reviewChange > 0
      ? `${reviewChange} new review${reviewChange !== 1 ? "s" : ""}, ${topCompetitorName} has ${topCompetitorReviews}`
      : `${topCompetitorName} leads with ${topCompetitorReviews} reviews`
    : `${clientReviews} reviews tracked this week`;

  // 6. Competitor note (market data only, never frame as "the one to beat")
  const competitorNote = topCompetitorName
    ? `The leading practice in your market has ${topCompetitorReviews} reviews.`
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
    competitor_name: cleanCompetitorName(topCompetitorName),
    competitor_review_count: topCompetitorReviews,
    client_review_count: clientReviews,
  });

  console.log(`[RankingsIntel] Snapshot: ${org.name} → #${currentPosition}, $${dollarFigure}`);

  // Write ranking change notification if review landscape shifted (feeds the bell popover)
  if (prevSnapshot?.client_review_count && clientReviews !== prevSnapshot.client_review_count) {
    const gained = clientReviews > prevSnapshot.client_review_count;
    const delta = Math.abs(clientReviews - prevSnapshot.client_review_count);
    await db("notifications").insert({
      organization_id: orgId,
      title: gained
        ? `${delta} new review${delta !== 1 ? "s" : ""} this week`
        : `Market update`,
      message: gained
        ? `You gained ${delta} review${delta !== 1 ? "s" : ""} this week. ${competitorNote || ""}`
        : `Your competitive landscape shifted. ${competitorNote || ""}`,
      type: "ranking",
      read: false,
      metadata: JSON.stringify({
        source: "ranking_snapshot",
        old_position: prevSnapshot.position,
        new_position: currentPosition,
        competitor_name: cleanCompetitorName(topCompetitorName),
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
export async function generateAllSnapshots(force = false): Promise<{ generated: number; total: number }> {
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
      const created = await generateSnapshotForOrg(org.id, force);
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

/**
 * Look up avgCaseValue from vocabulary config for the org's vertical.
 * Falls back to $200 (universal default) instead of dental-specific $1,500.
 */
async function getAvgCaseValueForOrg(orgId: number): Promise<number> {
  try {
    const config = await db("vocabulary_configs").where({ org_id: orgId }).first();
    if (config?.vertical) {
      const defaults = await db("vocabulary_defaults").where({ vertical: config.vertical }).first();
      if (defaults?.config) {
        const parsed = typeof defaults.config === "string" ? JSON.parse(defaults.config) : defaults.config;
        if (parsed.avgCaseValue) return parsed.avgCaseValue;
      }
    }
  } catch {
    // Fall through to default
  }
  return 200;
}
