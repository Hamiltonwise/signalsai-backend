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

import axios from "axios";
import { db } from "../database/connection";

const N8N_WEBHOOK = process.env.ALLORO_N8N_WEBHOOK_URL || "";

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

  // 7. Referral mechanic
  if (org.ttfv_response === "yes" && org.first_win_attributed_at && org.referral_code) {
    findingBody += `\n\nKnow another doctor flying blind? Share this. You both get one month free.\ngetalloro.com/checkup?ref=${org.referral_code}`;
  }

  // Action text + URL
  const actionText = snapshot.dollar_figure > 0
    ? `Close the $${snapshot.dollar_figure.toLocaleString()} gap`
    : "View your dashboard";
  const actionUrl = "https://app.getalloro.com/dashboard";

  // Ranking update line
  const rankingUpdate = snapshot.position
    ? `#${snapshot.position} in your market`
    : "Ranking data available in your dashboard";

  // 3. Build n8n payload with EXACT field names
  const payload = {
    practice_name: org.name,
    doctor_name: doctorName,
    subject_line: subjectLine,
    finding_headline: findingHeadline,
    finding_body: findingBody,
    dollar_figure: snapshot.dollar_figure || 0,
    action_text: actionText,
    action_url: actionUrl,
    ranking_update: rankingUpdate,
    competitor_note: snapshot.competitor_note || "",
    week_number: weekNumber,
    recipient_email: user.email,
  };

  // POST to n8n
  if (!N8N_WEBHOOK) {
    console.log(`[MondayEmail] N8N_WEBHOOK not set — payload logged for ${org.name}:`, JSON.stringify(payload).slice(0, 200));
    return false;
  }

  try {
    await axios.post(N8N_WEBHOOK, payload, { timeout: 30000 });
    console.log(`[MondayEmail] Sent to ${user.email} for ${org.name}`);
    return true;
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
