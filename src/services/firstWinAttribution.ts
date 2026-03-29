/**
 * First Win Attribution — WO32
 *
 * Runs after rankings snapshot + PMS ingestion.
 * Fires when first meaningful win is detected.
 * Gates the referral mechanic in Monday emails.
 */

import axios from "axios";
import { db } from "../database/connection";

const SLACK_WEBHOOK = process.env.ALLORO_BRIEF_SLACK_WEBHOOK || "";

/**
 * Check and attribute first win for an org.
 * Fires once — never again after first_win_attributed_at is set.
 */
export async function checkFirstWinAttribution(orgId: number): Promise<boolean> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org || org.first_win_attributed_at) return false;

  const snapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "asc");

  if (snapshots.length < 2) return false;

  const first = snapshots[0];
  const latest = snapshots[snapshots.length - 1];

  let eventType: string | null = null;
  let description: string | null = null;

  // Condition 1: Ranking improved 2+ positions vs first snapshot
  if (
    first.position && latest.position &&
    first.position - latest.position >= 2
  ) {
    eventType = "ranking_improvement";
    description = `Ranking improved from #${first.position} to #${latest.position}`;
  }

  // Condition 2: Review count grew 5+ from creation baseline
  if (!eventType) {
    const baselineReviews = org.checkup_review_count_at_creation || first.client_review_count || 0;
    const currentReviews = latest.client_review_count || 0;

    if (currentReviews - baselineReviews >= 5) {
      eventType = "review_growth";
      description = `Reviews grew from ${baselineReviews} to ${currentReviews} (+${currentReviews - baselineReviews})`;
    }
  }

  // Condition 3: Dormant referral source reactivated
  if (!eventType) {
    try {
      const hasTable = await db.schema.hasTable("referral_sources");
      if (hasTable) {
        const reactivated = await db("referral_sources")
          .where({ organization_id: orgId })
          .where("recent_referral_count", ">", 0)
          .whereRaw("last_referral_date > NOW() - INTERVAL '30 days'")
          .whereRaw("prior_3_month_avg = 0 OR prior_3_month_avg IS NULL")
          .first();

        if (reactivated) {
          eventType = "gp_reactivation";
          description = `${reactivated.gp_name || reactivated.name || "A referral source"} reactivated after 30+ days of silence`;
        }
      }
    } catch {
      // referral_sources table may not exist
    }
  }

  if (!eventType || !description) return false;

  // Create attribution event
  await db("first_win_attribution_events").insert({
    org_id: orgId,
    event_type: eventType,
    description,
  });

  // Set first_win_attributed_at on org
  await db("organizations").where({ id: orgId }).update({
    first_win_attributed_at: new Date(),
  });

  // Log to behavioral_events
  try {
    await db("behavioral_events").insert({
      event_type: "first_win.achieved",
      org_id: orgId,
      properties: JSON.stringify({
        event_type: eventType,
        description,
        practice_name: org.name,
      }),
    });
  } catch {
    // behavioral_events table may not exist
  }

  // Write to notifications table (feeds the bell popover)
  await db("notifications").insert({
    organization_id: orgId,
    title: "Your first win is here",
    message: description,
    type: "agent",
    read: false,
    metadata: JSON.stringify({
      source: "first_win_attribution",
      event_type: eventType,
    }),
    created_at: new Date(),
    updated_at: new Date(),
  }).catch(() => {});

  // Slack notification
  if (SLACK_WEBHOOK) {
    try {
      await axios.post(SLACK_WEBHOOK, {
        text: `🏆 First Win: ${org.name} — ${description}`,
      });
    } catch {
      console.error("[FirstWin] Slack notification failed");
    }
  }

  console.log(`[FirstWin] Attributed for ${org.name}: ${eventType} — ${description}`);
  return true;
}
