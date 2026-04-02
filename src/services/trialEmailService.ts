/**
 * Trial Email Service
 *
 * 7-day drip sequence with live data from the org.
 * Each email pulls fresh intelligence so the content
 * stays relevant as the trial progresses.
 *
 * Day 1: Welcome + what Alloro found
 * Day 3: "Reply with a GP name" (the reply-trap)
 * Day 5: Referral ask + competitor update
 * Day 6: "Add payment to keep access"
 * Day 7: "Your trial ended. Here's what you'll lose." (loss aversion)
 */

import { db } from "../database/connection";
import { sendEmail } from "../emails/emailService";
import { wrapInBaseTemplate, APP_URL } from "../emails/templates/base";

interface OrgTrialData {
  id: number;
  name: string;
  checkup_score: number | null;
  checkup_data: string | null;
  top_competitor_name: string | null;
  trial_email_sequence_position: number;
}

interface TrialEmailContext {
  org: OrgTrialData;
  email: string;
  practiceName: string;
  score: number | null;
  competitorName: string | null;
  reviewCount: number;
  competitorReviewCount: number | null;
  recentReviewGrowth: number;
}

async function buildContext(orgId: number): Promise<TrialEmailContext | null> {
  const org = await db("organizations")
    .where({ id: orgId })
    .select(
      "id",
      "name",
      "checkup_score",
      "checkup_data",
      "top_competitor_name",
      "trial_email_sequence_position"
    )
    .first();

  if (!org) return null;

  // Get the primary user email
  const orgUser = await db("organization_users")
    .where({ organization_id: orgId })
    .first();
  if (!orgUser) return null;

  const user = await db("users").where({ id: orgUser.user_id }).first();
  if (!user) return null;

  // Parse checkup data for review counts
  let checkupData: Record<string, any> = {};
  try {
    checkupData =
      typeof org.checkup_data === "string"
        ? JSON.parse(org.checkup_data)
        : org.checkup_data || {};
  } catch {
    checkupData = {};
  }

  // Get latest ranking snapshot for fresh competitor data
  const latestSnapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("created_at", "desc")
    .first();

  const reviewCount =
    latestSnapshot?.client_review_count || checkupData.reviewCount || 0;
  const competitorReviewCount =
    latestSnapshot?.competitor_review_count ||
    (typeof checkupData.topCompetitor === "object"
      ? checkupData.topCompetitor?.reviewCount
      : null);

  // Check review growth since signup
  const checkupReviewCount = await db("organizations")
    .where({ id: orgId })
    .select("checkup_review_count_at_creation")
    .first();
  const recentReviewGrowth = reviewCount - (checkupReviewCount?.checkup_review_count_at_creation || reviewCount);

  return {
    org,
    email: user.email,
    practiceName: org.name || "your practice",
    score: org.checkup_score,
    competitorName: org.top_competitor_name || latestSnapshot?.competitor_name || null,
    reviewCount,
    competitorReviewCount,
    recentReviewGrowth,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Day 1: Welcome + what Alloro found ----

export async function sendTrialDay1(orgId: number): Promise<void> {
  const ctx = await buildContext(orgId);
  if (!ctx) return;

  const html = `
    <div style="max-width: 560px; margin: 0 auto;">
      <h1 style="color: #1A1D23; font-size: 22px; font-weight: 700; margin-bottom: 8px;">
        Welcome to Alloro, ${escapeHtml(ctx.practiceName)}.
      </h1>
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        Your Business Health Checkup scored your practice ${ctx.score || "N/A"}/100.
        Here is what we found in the first scan of your market.
      </p>

      ${ctx.competitorName ? `
      <div style="background: #212D40; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="color: #D56753; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">
          Top Competitor
        </p>
        <p style="color: white; font-size: 18px; font-weight: 600; margin: 0;">
          ${escapeHtml(ctx.competitorName)}
        </p>
        ${ctx.competitorReviewCount ? `
        <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 4px 0 0 0;">
          ${ctx.competitorReviewCount} reviews vs your ${ctx.reviewCount}
        </p>` : ""}
      </div>` : ""}

      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        Over the next 7 days, Alloro will monitor your competitors, track your reviews,
        and surface intelligence you can act on. Your dashboard updates in real time.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL}/dashboard" style="display: inline-block; background: #D56753; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
          Open your dashboard
        </a>
      </div>
    </div>
  `;

  await sendEmail({
    subject: `${ctx.practiceName} scored ${ctx.score || "N/A"}/100. Here is what it means.`,
    body: wrapInBaseTemplate(html, { preheader: "Your free trial has started.", showFooterLinks: false }),
    recipients: [ctx.email],
  });

  await advanceSequence(orgId, 1);
}

// ---- Day 3: "Reply with a GP name" (reply-trap) ----

export async function sendTrialDay3(orgId: number): Promise<void> {
  const ctx = await buildContext(orgId);
  if (!ctx) return;

  const html = `
    <div style="max-width: 560px; margin: 0 auto;">
      <h1 style="color: #1A1D23; font-size: 22px; font-weight: 700; margin-bottom: 8px;">
        Quick question for ${escapeHtml(ctx.practiceName)}
      </h1>
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        We are building your referral intelligence map. To make it more accurate,
        we need one data point from you.
      </p>

      <div style="background: rgba(213, 103, 83, 0.08); border-radius: 12px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #D56753;">
        <p style="color: #1A1D23; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">
          Who is the GP that sends you the most referrals?
        </p>
        <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
          Just reply to this email with their name and practice. We will add them
          to your intelligence dashboard and track how they compare to other
          referral sources in your area.
        </p>
      </div>

      <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
        This helps us show you exactly where your referrals are coming from
        and where the untapped opportunities are.
      </p>
    </div>
  `;

  await sendEmail({
    subject: "Who sends you the most referrals?",
    body: wrapInBaseTemplate(html, { preheader: "One question that unlocks better intelligence.", showFooterLinks: false }),
    recipients: [ctx.email],
  });

  await advanceSequence(orgId, 3);
}

// ---- Day 5: Referral ask + competitor update ----

export async function sendTrialDay5(orgId: number): Promise<void> {
  const ctx = await buildContext(orgId);
  if (!ctx) return;

  const growthNote = ctx.recentReviewGrowth > 0
    ? `You have gained ${ctx.recentReviewGrowth} new review${ctx.recentReviewGrowth > 1 ? "s" : ""} since joining.`
    : "Your review count has held steady this week.";

  const competitorNote = ctx.competitorName
    ? `${escapeHtml(ctx.competitorName)} ${ctx.competitorReviewCount ? `now has ${ctx.competitorReviewCount} reviews` : "is still active in your market"}.`
    : "Your competitors are still being tracked.";

  const html = `
    <div style="max-width: 560px; margin: 0 auto;">
      <h1 style="color: #1A1D23; font-size: 22px; font-weight: 700; margin-bottom: 8px;">
        Mid-trial update for ${escapeHtml(ctx.practiceName)}
      </h1>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="color: #1A1D23; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">
          ${growthNote}
        </p>
        <p style="color: #64748b; font-size: 14px; margin: 0;">
          ${competitorNote}
        </p>
      </div>

      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        Know someone who would benefit from a free Business Health Checkup?
        Every referral helps us build better intelligence for your market.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL}/dashboard" style="display: inline-block; background: #D56753; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
          See latest intelligence
        </a>
      </div>
    </div>
  `;

  await sendEmail({
    subject: `${growthNote} Here is your competitive update.`,
    body: wrapInBaseTemplate(html, { preheader: "Your mid-trial intelligence update.", showFooterLinks: false }),
    recipients: [ctx.email],
  });

  await advanceSequence(orgId, 5);
}

// ---- Day 6: "Add payment to keep access" ----

export async function sendTrialDay6(orgId: number): Promise<void> {
  const ctx = await buildContext(orgId);
  if (!ctx) return;

  // Check if already converted
  const org = await db("organizations").where({ id: orgId }).select("subscription_status", "trial_status").first();
  if (org?.subscription_status === "active" || org?.trial_status === "converted") return;

  const html = `
    <div style="max-width: 560px; margin: 0 auto;">
      <h1 style="color: #1A1D23; font-size: 22px; font-weight: 700; margin-bottom: 8px;">
        Your trial ends tomorrow.
      </h1>
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        ${escapeHtml(ctx.practiceName)}, your competitive intelligence dashboard,
        weekly Monday Briefs, and real-time market monitoring all continue
        if you add a payment method before tomorrow.
      </p>

      <div style="background: #212D40; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="color: white; font-size: 15px; line-height: 1.6; margin: 0;">
          Everything you have built in the last 6 days stays exactly as it is.
          Your competitors do not stop growing when your trial does.
        </p>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL}/settings/billing" style="display: inline-block; background: #D56753; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
          Add payment method
        </a>
      </div>
    </div>
  `;

  await sendEmail({
    subject: "Your access continues tomorrow if you add a payment method",
    body: wrapInBaseTemplate(html, { preheader: "One step to keep your intelligence running.", showFooterLinks: false }),
    recipients: [ctx.email],
  });

  await advanceSequence(orgId, 6);
}

// ---- Day 7: "Your trial ended. Here's what you'll lose." ----

export async function sendTrialDay7(orgId: number): Promise<void> {
  const ctx = await buildContext(orgId);
  if (!ctx) return;

  // Check if already converted
  const org = await db("organizations").where({ id: orgId }).select("subscription_status", "trial_status").first();
  if (org?.subscription_status === "active" || org?.trial_status === "converted") return;

  // Mark trial as expired
  await db("organizations").where({ id: orgId }).update({ trial_status: "expired" });

  const lossItems: string[] = [];
  if (ctx.competitorName) lossItems.push(`Real-time tracking of ${escapeHtml(ctx.competitorName)} and ${ctx.competitorReviewCount ? "their " + ctx.competitorReviewCount + " reviews" : "your competitors"}`);
  lossItems.push("Weekly Monday Intelligence Briefs with market shifts");
  lossItems.push("Automated review monitoring and growth tracking");
  if (ctx.recentReviewGrowth > 0) lossItems.push(`The momentum from your ${ctx.recentReviewGrowth} new review${ctx.recentReviewGrowth > 1 ? "s" : ""}`);
  lossItems.push("One Action Card recommendations personalized to your market");

  const lossList = lossItems
    .map((item) => `<li style="color: #1A1D23; font-size: 14px; line-height: 1.8;">${item}</li>`)
    .join("");

  const html = `
    <div style="max-width: 560px; margin: 0 auto;">
      <h1 style="color: #1A1D23; font-size: 22px; font-weight: 700; margin-bottom: 8px;">
        Your trial has ended.
      </h1>
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        ${escapeHtml(ctx.practiceName)}, as of today you no longer have access to:
      </p>

      <ul style="padding-left: 20px; margin-bottom: 24px;">
        ${lossList}
      </ul>

      <div style="background: rgba(213, 103, 83, 0.08); border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #D56753;">
        <p style="color: #1A1D23; font-size: 15px; font-weight: 600; margin: 0;">
          Your competitors are still being tracked. You just cannot see the data anymore.
        </p>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL}/settings/billing" style="display: inline-block; background: #D56753; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
          Reactivate your intelligence
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-top: 32px;">
        Questions? Reply to this email. A real person reads every reply.
      </p>
    </div>
  `;

  await sendEmail({
    subject: "Your trial ended. Here is what you will lose.",
    body: wrapInBaseTemplate(html, { preheader: "Your competitive intelligence has been paused.", showFooterLinks: false }),
    recipients: [ctx.email],
  });

  await advanceSequence(orgId, 7);
}

async function advanceSequence(orgId: number, position: number): Promise<void> {
  await db("organizations")
    .where({ id: orgId })
    .update({ trial_email_sequence_position: position });

  await db("behavioral_events")
    .insert({
      event_type: `trial.email_day_${position}_sent`,
      org_id: orgId,
      properties: JSON.stringify({ day: position }),
    })
    .catch(() => {});
}
