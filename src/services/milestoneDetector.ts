/**
 * Milestone Detector
 *
 * Compares a new ranking result against previous data to detect:
 *   1. Rank position improvement (moved up)
 *   2. Passed a specific competitor in review count
 *   3. Hit a review count milestone (50, 100, 250, 500, 1000)
 *
 * Each milestone is:
 *   - Stored in milestone_notifications
 *   - Logged to behavioral_events as milestone.achieved
 *   - Sent as email via n8n webhook
 *
 * Called after each ranking job completes.
 */

import { db } from "../database/connection";
import { sendEmail } from "../emails/emailService";
import {
  wrapInBaseTemplate,
  createButton,
  BRAND_COLORS,
  APP_URL,
} from "../emails/templates/base";

// ─── Types ──────────────────────────────────────────────────────────

export interface MilestoneInput {
  organizationId: number;
  locationId: number | null;
  practiceName: string;
  specialty: string;
  city: string;
  currentPosition: number;
  totalCompetitors: number;
  currentReviewCount: number;
  competitors: Array<{
    name: string;
    reviewCount: number;
    position: number;
  }>;
}

export interface DetectedMilestone {
  type: "rank_up" | "passed_competitor" | "review_count_milestone";
  headline: string;
  detail: string;
  competitorName: string | null;
  oldValue: number | null;
  newValue: number | null;
}

// ─── Review count milestone thresholds ──────────────────────────────

const REVIEW_MILESTONES = [25, 50, 100, 150, 200, 250, 500, 750, 1000];

// ─── Detection logic ────────────────────────────────────────────────

export async function detectMilestones(
  input: MilestoneInput,
): Promise<DetectedMilestone[]> {
  const milestones: DetectedMilestone[] = [];

  // Get previous ranking for this org to compare
  const previous = await db("practice_rankings")
    .where({
      organization_id: input.organizationId,
      status: "completed",
    })
    .orderBy("created_at", "desc")
    .offset(1) // skip the current one (most recent)
    .first();

  const prevPosition = previous?.rank_position ?? null;
  const prevRawData = typeof previous?.raw_data === "string"
    ? JSON.parse(previous.raw_data)
    : previous?.raw_data;
  const prevReviewCount = prevRawData?.client_gbp?.totalReviewCount ?? null;

  // ── 1. Rank position improvement ──
  if (prevPosition !== null && input.currentPosition < prevPosition) {
    const positionsGained = prevPosition - input.currentPosition;
    milestones.push({
      type: "rank_up",
      headline: `You're more visible in ${input.city} this week`,
      detail: `Your Google presence improved. Reviews, profile completeness, and recent activity all contribute to visibility.`,
      competitorName: null,
      oldValue: prevPosition,
      newValue: input.currentPosition,
    });
  }

  // ── 2. Passed a competitor in review count ──
  if (prevReviewCount !== null && input.currentReviewCount > prevReviewCount) {
    // Find competitors whose review count is between our old and new count
    for (const comp of input.competitors) {
      if (
        comp.reviewCount < input.currentReviewCount &&
        comp.reviewCount >= prevReviewCount &&
        comp.name
      ) {
        // We passed this competitor
        const isTied = comp.reviewCount === input.currentReviewCount;
        milestones.push({
          type: "passed_competitor",
          headline: `You just passed ${comp.name} in review count`,
          detail: isTied
            ? `You're now tied at ${input.currentReviewCount} reviews.`
            : `You now have ${input.currentReviewCount} reviews vs their ${comp.reviewCount}. Keep building -- review momentum drives visibility.`,
          competitorName: comp.name,
          oldValue: prevReviewCount,
          newValue: input.currentReviewCount,
        });
        break; // Only report the most notable competitor passed
      }
    }
  }

  // ── 3. Review count milestone ──
  if (prevReviewCount !== null) {
    for (const threshold of REVIEW_MILESTONES) {
      if (input.currentReviewCount >= threshold && prevReviewCount < threshold) {
        milestones.push({
          type: "review_count_milestone",
          headline: `You hit ${threshold} Google reviews`,
          detail: `${input.practiceName} now has ${input.currentReviewCount} reviews in ${input.city}. ` +
            (threshold >= 100
              ? `That puts you in rare company — most practices never reach ${threshold}.`
              : `Every review is social proof working for you 24/7.`),
          competitorName: null,
          oldValue: prevReviewCount,
          newValue: input.currentReviewCount,
        });
        break; // Only the highest crossed threshold
      }
    }
  }

  return milestones;
}

// ─── Store + notify + track ─────────────────────────────────────────

export async function processMilestones(
  input: MilestoneInput,
): Promise<{ milestonesDetected: number; milestones: DetectedMilestone[] }> {
  const milestones = await detectMilestones(input);

  for (const m of milestones) {
    // 1. Store in milestone_notifications
    await db("milestone_notifications").insert({
      organization_id: input.organizationId,
      location_id: input.locationId,
      milestone_type: m.type,
      headline: m.headline,
      detail: m.detail,
      competitor_name: m.competitorName,
      old_value: m.oldValue,
      new_value: m.newValue,
      metadata: JSON.stringify({
        practice_name: input.practiceName,
        specialty: input.specialty,
        city: input.city,
        position: input.currentPosition,
        total_competitors: input.totalCompetitors,
        review_count: input.currentReviewCount,
      }),
      seen: false,
      email_sent: false,
    });

    // 2. Write to notifications table (feeds the bell popover)
    await db("notifications").insert({
      organization_id: input.organizationId,
      location_id: input.locationId,
      title: m.headline,
      message: m.detail,
      type: m.type === "rank_up" ? "ranking" : "agent",
      read: false,
      metadata: JSON.stringify({
        milestone_type: m.type,
        old_value: m.oldValue,
        new_value: m.newValue,
        competitor_name: m.competitorName,
      }),
      created_at: new Date(),
      updated_at: new Date(),
    }).catch(() => {});

    // 3. Log to behavioral_events
    await db("behavioral_events").insert({
      event_type: "milestone.achieved",
      org_id: input.organizationId,
      properties: JSON.stringify({
        milestone_type: m.type,
        headline: m.headline,
        practice_name: input.practiceName,
        city: input.city,
        old_value: m.oldValue,
        new_value: m.newValue,
        competitor_name: m.competitorName,
      }),
    });

    // 4. Send email
    await sendMilestoneEmail(input, m).catch((err) =>
      console.error("[Milestone] Email failed:", err.message),
    );

    console.log(`[Milestone] ${input.practiceName}: ${m.headline}`);
  }

  return { milestonesDetected: milestones.length, milestones };
}

// ─── Milestone email ────────────────────────────────────────────────

async function sendMilestoneEmail(
  input: MilestoneInput,
  milestone: DetectedMilestone,
): Promise<void> {
  // Find the org owner's email
  const orgUser = await db("organization_users")
    .where({ organization_id: input.organizationId, role: "admin" })
    .first();

  if (!orgUser) return;

  const user = await db("users").where({ id: orgUser.user_id }).first();
  if (!user?.email) return;

  const emoji =
    milestone.type === "rank_up" ? "📈"
    : milestone.type === "passed_competitor" ? "🏆"
    : "⭐";

  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 16px;">${emoji}</div>
      <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: ${BRAND_COLORS.navy};">
        ${escapeHtml(milestone.headline)}
      </h1>
      <p style="margin: 0; font-size: 15px; color: ${BRAND_COLORS.darkGray}; line-height: 1.6;">
        ${escapeHtml(milestone.detail)}
      </p>
    </div>

    <div style="background-color: ${BRAND_COLORS.lightGray}; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">
        Current Position
      </p>
      <p style="margin: 0; font-size: 36px; font-weight: 600; color: ${BRAND_COLORS.navy};">
        #${input.currentPosition}
      </p>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">
        of ${input.totalCompetitors} ${input.specialty}s in ${escapeHtml(input.city)}
      </p>
    </div>

    <div style="text-align: center; margin-top: 28px;">
      ${createButton("View Your Dashboard", `${APP_URL}/dashboard`)}
    </div>

    <p style="margin: 28px 0 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray}; text-align: center;">
      Keep the momentum going. Every review, every photo, every response moves the needle.
    </p>
  `;

  const body = wrapInBaseTemplate(content, {
    preheader: milestone.headline,
    showFooterLinks: false,
  });

  await sendEmail({
    subject: `${emoji} ${milestone.headline}`,
    body,
    recipients: [user.email],
  });

  // Mark as email_sent
  await db("milestone_notifications")
    .where({
      organization_id: input.organizationId,
      headline: milestone.headline,
    })
    .orderBy("created_at", "desc")
    .limit(1)
    .update({ email_sent: true });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c),
  );
}
