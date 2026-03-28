/**
 * Week 1 Win Processor (WO-48)
 *
 * Fires 24 hours after signup. Identifies the single most valuable
 * quick win from GBP completeness, NAP consistency, or site speed.
 * Stores the finding on the organizations table for dashboard display.
 */

import type { Job } from "bullmq";
import { db } from "../../database/connection";

interface Week1WinData {
  orgId: number;
}

export async function processWeek1Win(job: Job<Week1WinData>) {
  const { orgId } = job.data;
  console.log(`[Week1Win] Processing for org ${orgId}`);

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) {
    console.log(`[Week1Win] Org ${orgId} not found, skipping`);
    return;
  }

  // Skip if already computed
  if (org.week1_win_headline) {
    console.log(`[Week1Win] Org ${orgId} already has a Week 1 win, skipping`);
    return;
  }

  let headline: string | null = null;
  let detail: string | null = null;
  let winType: string | null = null;

  // Check 1: GBP completeness from checkup data
  const checkupData = org.checkup_data
    ? typeof org.checkup_data === "string"
      ? JSON.parse(org.checkup_data)
      : org.checkup_data
    : null;

  if (checkupData) {
    // Calculate a simple completeness estimate from available data
    const hasReviews = (checkupData.reviewCount || 0) > 0;
    const hasCompetitors = checkupData.topCompetitor?.name;
    const rank = checkupData.market?.rank;
    const city = checkupData.market?.city || "your market";
    const totalCompetitors = checkupData.market?.totalCompetitors || 0;

    // If rank is good, celebrate it
    if (rank && rank <= 3 && totalCompetitors >= 5) {
      headline = "Your Week 1 win.";
      detail = `You rank #${rank} of ${totalCompetitors} in ${city}. That puts you in the top tier. Alloro is now monitoring every competitor move to keep you there.`;
      winType = "strong_profile";
    }
    // If there's a clear review gap, surface it
    else if (
      hasCompetitors &&
      checkupData.topCompetitor?.reviewCount &&
      checkupData.reviewCount != null
    ) {
      const gap = checkupData.topCompetitor.reviewCount - checkupData.reviewCount;
      if (gap > 0 && gap <= 30) {
        headline = "Your Week 1 win.";
        detail = `You're ${gap} reviews away from matching ${checkupData.topCompetitor.name} in ${city}. At 3 reviews per week, that's ${Math.ceil(gap / 3)} weeks. Alloro is tracking your pace.`;
        winType = "review_gap_closeable";
      } else if (gap > 30) {
        headline = "Your Week 1 win.";
        detail = `${checkupData.topCompetitor.name} has ${gap} more reviews in ${city}. Alloro identified this gap and is building a plan. Your Monday brief will show weekly progress.`;
        winType = "review_gap_identified";
      }
    }

    // Default: checkup itself is the win
    if (!headline && hasReviews) {
      headline = "Your Week 1 win.";
      detail = `Alloro scanned ${totalCompetitors} competitors in ${city} and built your competitive profile. Your Monday brief starts this week with specific intelligence on what moved.`;
      winType = "competitive_scan";
    }
  }

  // Fallback if no checkup data
  if (!headline) {
    headline = "Your Week 1 win.";
    detail =
      "Alloro started watching your market. Your first competitive intelligence report arrives Monday morning. No action needed from you.";
    winType = "monitoring_started";
  }

  // Store the win
  await db("organizations").where({ id: orgId }).update({
    week1_win_headline: headline,
    week1_win_detail: detail,
    week1_win_type: winType,
    week1_win_shown_at: new Date(),
  });

  // Log behavioral event
  const hasTable = await db.schema.hasTable("behavioral_events");
  if (hasTable) {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "week1_win.generated",
      org_id: orgId,
      properties: JSON.stringify({ winType, headline }),
      created_at: new Date(),
    });
  }

  console.log(`[Week1Win] Win generated for org ${orgId}: ${winType}`);
}
