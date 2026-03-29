/**
 * Dreamweaver Agent -- Guidara's Unreasonable Hospitality Applied to AI
 *
 * One job: scan each client's data for hospitality opportunities
 * that no SaaS product has ever delivered. Then queue the surprise.
 *
 * This agent doesn't optimize metrics. It creates legends.
 * A legend is a moment so specific and unexpected that the
 * recipient retells it for years.
 *
 * Runs daily at 6:00 AM before the morning briefing.
 * Writes to behavioral_events as "dreamweaver.legend_queued".
 * The Monday email, Lob card pipeline, and CS Agent all
 * consume these events.
 */

import { db } from "../database/connection";
import { recordAgentFinding } from "./behavioralIntelligence";

interface LegendOpportunity {
  orgId: number;
  orgName: string;
  legendType: string;
  headline: string;
  detail: string;
  action: "monday_email" | "lob_card" | "dashboard_card" | "notification";
  priority: number;
  shareability: number;
}

/**
 * Scan all active organizations for hospitality opportunities.
 * Returns legends found. Each legend is queued as an agent finding
 * and a behavioral event for downstream consumers.
 */
export async function runDreamweaver(): Promise<LegendOpportunity[]> {
  const orgs = await db("organizations")
    .whereNotNull("name")
    .select("id", "name", "created_at", "checkup_score", "first_win_attributed_at", "owner_profile", "patientpath_status");

  const legends: LegendOpportunity[] = [];

  for (const org of orgs) {
    const found = await findLegendsForOrg(org);
    legends.push(...found);
  }

  // Record each legend as an agent finding for the signal bus
  for (const legend of legends) {
    await recordAgentFinding({
      agentName: "dreamweaver",
      findingType: `legend.${legend.legendType}`,
      priority: legend.priority,
      shareability: legend.shareability,
      headline: legend.headline,
      detail: legend.detail,
      orgId: legend.orgId,
    });

    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "dreamweaver.legend_queued",
      org_id: legend.orgId,
      properties: JSON.stringify({
        legend_type: legend.legendType,
        headline: legend.headline,
        action: legend.action,
      }),
      created_at: new Date(),
    }).catch(() => {});
  }

  console.log(`[Dreamweaver] Found ${legends.length} legends across ${orgs.length} orgs`);
  return legends;
}

async function findLegendsForOrg(org: any): Promise<LegendOpportunity[]> {
  const legends: LegendOpportunity[] = [];
  const now = new Date();
  const createdAt = new Date(org.created_at);
  const daysActive = Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000);

  // ─── Legend 1: Business Anniversary ─────────────────────────────
  const yearsSinceCreation = Math.floor(daysActive / 365);
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const createdDayOfYear = Math.floor((createdAt.getTime() - new Date(createdAt.getFullYear(), 0, 0).getTime()) / 86_400_000);

  // Check if today is the anniversary (within 1 day)
  if (yearsSinceCreation >= 1 && Math.abs(dayOfYear - createdDayOfYear) <= 1) {
    legends.push({
      orgId: org.id,
      orgName: org.name,
      legendType: "anniversary",
      headline: `${org.name} turns ${yearsSinceCreation} year${yearsSinceCreation !== 1 ? "s" : ""} old today.`,
      detail: `Most businesses don't make it this far. You did. Alloro has been watching since day ${Math.min(daysActive, daysActive - 365 * (yearsSinceCreation - 1))}.`,
      action: "monday_email",
      priority: 7,
      shareability: 9,
    });
  }

  // ─── Legend 2: Alloro Anniversary ──────────────────────────────
  const alloroAnniversaryDays = [30, 90, 180, 365];
  for (const milestone of alloroAnniversaryDays) {
    if (daysActive === milestone) {
      const label = milestone === 30 ? "one month" : milestone === 90 ? "three months" : milestone === 180 ? "six months" : "one year";
      legends.push({
        orgId: org.id,
        orgName: org.name,
        legendType: "alloro_milestone",
        headline: `${label} with Alloro.`,
        detail: `${org.name} has had a team watching their market for ${label}. That's rare. That matters.`,
        action: "monday_email",
        priority: 6,
        shareability: 7,
      });
    }
  }

  // ─── Legend 3: Review Milestone ────────────────────────────────
  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: org.id })
    .orderBy("week_start", "desc")
    .limit(2)
    .select("client_review_count", "competitor_review_count", "competitor_name");

  if (snapshots.length >= 2) {
    const current = snapshots[0]?.client_review_count || 0;
    const previous = snapshots[1]?.client_review_count || 0;
    const reviewMilestones = [25, 50, 75, 100, 150, 200, 250, 500];

    for (const milestone of reviewMilestones) {
      if (current >= milestone && previous < milestone) {
        legends.push({
          orgId: org.id,
          orgName: org.name,
          legendType: "review_milestone",
          headline: `${org.name} just passed ${milestone} Google reviews.`,
          detail: `That puts you ahead of most businesses in your market. Each review is a vote of confidence from someone you served.`,
          action: "lob_card",
          priority: 8,
          shareability: 9,
        });
      }
    }

    // ─── Legend 4: Passed a Competitor ──────────────────────────────
    const compReviews = snapshots[0]?.competitor_review_count || 0;
    const prevCompReviews = snapshots[1]?.competitor_review_count || 0;
    const compName = snapshots[0]?.competitor_name;

    if (compName && previous < compReviews && current >= compReviews) {
      legends.push({
        orgId: org.id,
        orgName: org.name,
        legendType: "passed_competitor",
        headline: `${org.name} just passed ${compName} in review count.`,
        detail: `You now have more reviews than the competitor who was ahead of you. That changes your market position.`,
        action: "monday_email",
        priority: 9,
        shareability: 10,
      });
    }
  }

  // ─── Legend 5: First Win (if not yet celebrated) ──────────────
  if (org.first_win_attributed_at) {
    const winDate = new Date(org.first_win_attributed_at);
    const daysSinceWin = Math.floor((now.getTime() - winDate.getTime()) / 86_400_000);
    if (daysSinceWin === 0) {
      legends.push({
        orgId: org.id,
        orgName: org.name,
        legendType: "first_win_today",
        headline: "Alloro caught something. You acted. It worked.",
        detail: "This is the moment the product promise became real. What happens next is up to you.",
        action: "dashboard_card",
        priority: 10,
        shareability: 9,
      });
    }
  }

  // ─── Legend 6: Owner Profile Insight ───────────────────────────
  if (org.owner_profile) {
    const profile = typeof org.owner_profile === "string" ? JSON.parse(org.owner_profile) : org.owner_profile;
    const vision = profile?.vision_3yr;
    const sundayFear = profile?.sunday_fear;

    // At 30 and 90 days, reference their own words back to them
    if (vision && (daysActive === 30 || daysActive === 90)) {
      legends.push({
        orgId: org.id,
        orgName: org.name,
        legendType: "vision_callback",
        headline: `You said you wanted: "${vision.substring(0, 60)}${vision.length > 60 ? "..." : ""}"`,
        detail: daysActive === 30
          ? "Thirty days in. Alloro is working toward that. Here's what moved."
          : "Ninety days. The trajectory is visible now. Here's where you stand.",
        action: "monday_email",
        priority: 8,
        shareability: 6,
      });
    }
  }

  // ─── Legend 7: PatientPath Launch ─────────────────────────────
  if (org.patientpath_status === "live") {
    // Check if it just went live (within last 24h)
    const recentBuild = await db("behavioral_events")
      .where({ org_id: org.id, event_type: "clearpath.build_triggered" })
      .where("created_at", ">=", new Date(now.getTime() - 48 * 60 * 60 * 1000))
      .first();

    if (recentBuild) {
      legends.push({
        orgId: org.id,
        orgName: org.name,
        legendType: "site_launch",
        headline: `${org.name}'s website is live. Someone could find you right now.`,
        detail: "Built from your reviews, your competitors, and what makes you irreplaceable. The first AI citation check runs in 72 hours.",
        action: "notification",
        priority: 8,
        shareability: 8,
      });
    }
  }

  // ─── Legend 8: The Clean Week ──────────────────────────────────
  // Guidara: the absence of a problem is itself a gift.
  // The most unreasonable hospitality: permission to not worry.
  if (daysActive >= 14) {
    const recentAlerts = await db("behavioral_events")
      .where({ org_id: org.id })
      .whereIn("event_type", ["gp.gone_dark", "gp.drift_detected", "competitor.disruption_detected"])
      .where("created_at", ">=", new Date(now.getTime() - 7 * 86_400_000))
      .count("id as count")
      .first();

    const alertCount = Number(recentAlerts?.count || 0);
    if (alertCount === 0) {
      legends.push({
        orgId: org.id,
        orgName: org.name,
        legendType: "clean_week",
        headline: "Quiet week. Nothing needs your attention.",
        detail: `No competitor moved. No referral source drifted. ${org.name} is holding steady. Alloro watched so you didn't have to.`,
        action: "monday_email",
        priority: 5,
        shareability: 4,
      });
    }
  }

  return legends;
}
