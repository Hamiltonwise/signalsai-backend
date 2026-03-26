/**
 * Monday Email BullMQ Cron — WO33
 *
 * Schedule: Monday 7:00 AM in practice's local timezone.
 * Sends intelligence brief via n8n webhook.
 *
 * UNTESTABLE until Dave confirms:
 * - ALLORO_N8N_WEBHOOK_URL
 * - MAILGUN_API_KEY
 * - MAILGUN_DOMAIN
 */

import { db } from "../database/connection";
import { sendMondayBriefEmail } from "../emails/templates/MondayBriefEmail";

/**
 * Send Monday email for a single org.
 */
export async function sendMondayEmailForOrg(orgId: number): Promise<boolean> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return false;

  // Must have active subscription OR be a Checkup-originated signup (billing after TTFV, not at Step 4)
  if (org.subscription_status !== "active" && !org.checkup_score && !org.onboarding_completed) return false;

  // Get doctor info
  const orgUser = await db("organization_users")
    .where({ organization_id: orgId, role: "admin" })
    .first();
  if (!orgUser) return false;

  const user = await db("users").where({ id: orgUser.user_id }).first();
  if (!user?.email) return false;

  const doctorName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Doctor";
  const doctorLastName = user.last_name || doctorName;

  // 1. Fetch most recent snapshot
  const snapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .first();

  if (!snapshot) {
    console.log(`[MondayEmail] No snapshot for ${org.name}, skipping`);
    return false;
  }

  // Parse bullets
  const bullets = typeof snapshot.bullets === "string"
    ? JSON.parse(snapshot.bullets)
    : snapshot.bullets || [];

  // 2. Build payload
  const weekNumber = Math.min(4, Math.ceil(new Date().getDate() / 7));

  // Finding headline format: "[Doctor Last Name], [most significant finding]"
  const findingHeadline = snapshot.finding_headline || "Your market position this week";

  // Subject line: ALWAYS specific
  const subjectLine = `${doctorLastName}, ${findingHeadline.toLowerCase()}`;

  // Finding body: bullets + autonomous action line
  let findingBody = bullets.join("\n\n");

  // Add autonomous action line
  if (snapshot.position && snapshot.competitor_name) {
    findingBody += `\n\nAlloro tracked your competitive position against ${snapshot.competitor_name} on ${new Date().toLocaleDateString()}.`;
  } else {
    findingBody += "\n\nAlloro monitored your market this week. No urgent changes.";
  }

  // 6. Steady-state override: after 3 consecutive steady weeks
  const recentSnapshots = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(4);

  const steadyWeeks = recentSnapshots.filter(
    (s: any, i: number) => i > 0 && s.position === recentSnapshots[0].position
  ).length;

  if (steadyWeeks >= 3) {
    // Surface most unusual data point
    const reviewDelta = (snapshot.client_review_count || 0) - (recentSnapshots[3]?.client_review_count || snapshot.client_review_count || 0);
    if (reviewDelta !== 0) {
      findingBody = `Your position has been steady at #${snapshot.position} for ${steadyWeeks} weeks. In that time, you ${reviewDelta > 0 ? "gained" : "lost"} ${Math.abs(reviewDelta)} reviews. ${snapshot.competitor_name || "Your top competitor"} ${reviewDelta > 0 ? "gained fewer" : "gained more"}.`;
    }
  }

  // 5-Minute Fix: specific action based on the finding
  const reviewGap = (snapshot.competitor_review_count || 0) - (snapshot.client_review_count || 0);
  let fiveMinuteFix = "";

  if (reviewGap > 0 && reviewGap <= 15) {
    const needed = Math.min(reviewGap, 3);
    fiveMinuteFix = `5-MINUTE FIX: Send a review request to ${needed} patient${needed !== 1 ? "s" : ""} who visited this week. You're ${reviewGap} review${reviewGap !== 1 ? "s" : ""} behind ${snapshot.competitor_name || "the #1 practice"}. Three reviews per week closes that gap in ${Math.ceil(reviewGap / 3)} weeks.`;
  } else if (reviewGap > 15) {
    fiveMinuteFix = `5-MINUTE FIX: Send 3 review requests today. Consistent weekly reviews compound. At 3/week, you close a ${reviewGap}-review gap by ${new Date(Date.now() + Math.ceil(reviewGap / 3) * 7 * 86400000).toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`;
  } else if (steadyWeeks >= 3) {
    fiveMinuteFix = `5-MINUTE FIX: Your position is steady. This is the week to gain ground. Send 3 review requests and add a new photo to your Google Business Profile.`;
  } else {
    fiveMinuteFix = `5-MINUTE FIX: Open your Google Business Profile and respond to any unanswered reviews. Each response signals activity to Google's ranking algorithm.`;
  }

  findingBody += `\n\n${fiveMinuteFix}`;

  // Action text
  const actionText = reviewGap > 0
    ? "Send review requests now"
    : snapshot.dollar_figure > 0
      ? `Close the $${snapshot.dollar_figure.toLocaleString()} gap`
      : "Open your dashboard";

  // Ranking update line
  const rankingUpdate = snapshot.position
    ? `#${snapshot.position} in your market`
    : "Ranking data available in your dashboard";

  // Referral line (gated: TTFV yes + first win + has code)
  const referralLine = (org.ttfv_response === "yes" && org.first_win_attributed_at && org.referral_code)
    ? `Know another doctor flying blind? Share this. You both get one month free. getalloro.com/checkup?ref=${org.referral_code}`
    : null;

  // Send via email service
  try {
    const success = await sendMondayBriefEmail({
      recipientEmail: user.email,
      practiceName: org.name,
      doctorName,
      doctorLastName,
      subjectLine,
      findingHeadline,
      findingBody,
      dollarFigure: snapshot.dollar_figure || 0,
      actionText,
      rankingUpdate,
      competitorNote: snapshot.competitor_note || "",
      referralLine,
    });

    if (success) {
      console.log(`[MondayEmail] Sent to ${user.email} for ${org.name}`);
    } else {
      console.error(`[MondayEmail] Email service returned failure for ${org.name}`);
    }
    return success;
  } catch (err: any) {
    console.error(`[MondayEmail] Failed for ${org.name}:`, err.message);
    return false;
  }
}

/**
 * Send Monday emails for ALL active orgs.
 */
export async function sendAllMondayEmails(): Promise<{ sent: number; total: number }> {
  // Include subscribed orgs AND Checkup-originated signups (billing after TTFV, not at Step 4)
  const orgs = await db("organizations")
    .where(function () {
      this.where({ subscription_status: "active" })
        .orWhereNotNull("checkup_score")
        .orWhere("onboarding_completed", true);
    })
    .select("id", "name");

  let sent = 0;
  for (const org of orgs) {
    try {
      const success = await sendMondayEmailForOrg(org.id);
      if (success) sent++;
    } catch (err: any) {
      console.error(`[MondayEmail] Error for ${org.name}:`, err.message);
    }
  }

  console.log(`[MondayEmail] Sent ${sent}/${orgs.length} emails`);
  return { sent, total: orgs.length };
}
