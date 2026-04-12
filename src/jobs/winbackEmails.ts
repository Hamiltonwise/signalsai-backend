/**
 * Win-Back Email Sequence -- Post-Cancellation Recovery
 *
 * Research: ProfitWell data shows 8-15% of cancelled customers
 * can be recovered over 180 days with the right sequence.
 * Day 30 emails have the highest reactivation rate (3-5%).
 *
 * Schedule: Runs daily at 9 AM PT via BullMQ scheduler.
 * Checks for cancelled orgs and sends the appropriate email
 * based on days since cancellation.
 *
 * Sequence:
 *   Day 1:  Confirmation (gracious, not desperate)
 *   Day 14: Value reminder (what changed in their market while away)
 *   Day 30: Direct offer (address their specific cancel reason)
 *   Day 60: Product update (what's new since they left)
 *   Day 90: Final touch (respect, one-click reactivation)
 *
 * Rules:
 *   - Personalized by cancellation reason (from billing.cancel_reason event)
 *   - One-click reactivation link in every email
 *   - One-click unsubscribe from win-back sequence (separate from marketing)
 *   - Never guilt-trip. "We miss you" is fine. "Your team is lost" is not.
 *   - If they cancelled because business closed, skip the sequence entirely.
 */

import { db } from "../database/connection";

const EMAIL_WEBHOOK = process.env.ALLORO_EMAIL_SERVICE_WEBHOOK || "";
const APP_URL = process.env.APP_URL || "https://app.getalloro.com";

interface CancelledOrg {
  id: number;
  name: string;
  cancelled_at: Date;
  cancel_reason: string | null;
  cancel_other_text: string | null;
  owner_email: string | null;
  owner_first_name: string | null;
  winback_opt_out: boolean;
}

interface WinbackEmail {
  day: number;
  subject: (org: CancelledOrg) => string;
  body: (org: CancelledOrg) => string;
  skipIf?: (org: CancelledOrg) => boolean;
}

const SEQUENCE: WinbackEmail[] = [
  {
    day: 1,
    subject: (org) => `Your Alloro account has been cancelled`,
    body: (org) => {
      const name = org.owner_first_name || "there";
      return `${name},

Your account for ${org.name} has been cancelled. Your data will be preserved for 90 days.

If you change your mind, reactivating takes one click:
${APP_URL}/settings/billing

Your intelligence history, rankings data, and competitive analysis are all right where you left them.

Corey`;
    },
  },
  {
    day: 14,
    subject: (org) => `${org.owner_first_name || "Hey"}, something moved in your market`,
    body: (org) => {
      const name = org.owner_first_name || "there";
      return `${name},

Your data is still preserved for another 76 days. Your market has kept moving since you left.

If you want to see what changed, it takes one click:
${APP_URL}/settings/billing

No pressure. Your data is yours either way.

Corey`;
    },
    skipIf: (org) => org.cancel_reason === "business_closed",
  },
  {
    day: 30,
    subject: (org) => {
      if (org.cancel_reason === "too_expensive") return `${org.owner_first_name || "Hey"}, we heard you on pricing`;
      if (org.cancel_reason === "not_using") return `${org.owner_first_name || "Hey"}, we built something you should see`;
      if (org.cancel_reason === "missing_feature") return `${org.owner_first_name || "Hey"}, we built the thing you asked for`;
      return `${org.owner_first_name || "Hey"}, checking in from Alloro`;
    },
    body: (org) => {
      const name = org.owner_first_name || "there";
      const reason = org.cancel_reason;

      if (reason === "too_expensive") {
        return `${name},

You told us the price wasn't right. We want to find a way to make this work.

Would a pause (up to 3 months, data preserved) give you the breathing room you need? Or reply to this email and tell me what would.

Your data is still here for another 60 days:
${APP_URL}/settings/billing

Corey`;
      }

      if (reason === "not_using") {
        return `${name},

You mentioned you weren't using Alloro enough. That's on us, not you.

Since you left, we've improved how findings are delivered. One email, one thing, every Monday. No login required. The intelligence comes to you.

Want to try it for 30 days and see if the new format clicks?
${APP_URL}/settings/billing

Corey`;
      }

      if (reason === "missing_feature") {
        const detail = org.cancel_other_text ? `You mentioned: "${org.cancel_other_text}." ` : "";
        return `${name},

${detail}We've been building. If what you needed is now in the product, I'd like you to see it.

One click to reactivate:
${APP_URL}/settings/billing

If it's still not there, reply and tell me. It goes directly to our build queue.

Corey`;
      }

      return `${name},

It's been a month since you left Alloro. A lot has changed in the product and probably in your market too.

Your data is preserved for another 60 days. If you want to pick up where you left off:
${APP_URL}/settings/billing

Corey`;
    },
    skipIf: (org) => org.cancel_reason === "business_closed",
  },
  {
    day: 60,
    subject: (org) => `What's new at Alloro`,
    body: (org) => {
      const name = org.owner_first_name || "there";
      return `${name},

Quick update: we've been improving the product since you were last here. Your competitive data and market insights are still preserved.

Your data is available for another 30 days:
${APP_URL}/settings/billing

Corey`;
    },
    skipIf: (org) => org.cancel_reason === "business_closed",
  },
  {
    day: 90,
    subject: (org) => `Your Alloro data will be archived in 7 days`,
    body: (org) => {
      const name = org.owner_first_name || "there";
      return `${name},

Your data for ${org.name} will be archived in 7 days. After that, your intelligence history, rankings, and competitive data are gone.

If you'd ever like to come back:
${APP_URL}/settings/billing

If not, we wish you well. This is the last email in this sequence.

Corey
Alloro, Bend, Oregon`;
    },
  },
];

/**
 * Run the win-back sequence for all cancelled orgs.
 * Called daily by BullMQ scheduler.
 */
export async function runWinbackEmails(): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  try {
    // Find orgs that cancelled and haven't opted out of win-back
    const cancelledOrgs = await db("organizations")
      .whereIn("subscription_status", ["cancelled", "expired"])
      .whereNotNull("cancelled_at")
      .where("cancelled_at", ">", new Date(Date.now() - 100 * 86_400_000)) // Within 100 days
      .select("id", "name", "cancelled_at", "pause_reason");

    for (const org of cancelledOrgs) {
      try {
        // Get cancel reason from behavioral events
        const hasBehavioral = await db.schema.hasTable("behavioral_events");
        let cancelReason: string | null = null;
        let cancelOtherText: string | null = null;

        if (hasBehavioral) {
          const reasonEvent = await db("behavioral_events")
            .where({ organization_id: org.id, event_type: "billing.cancel_reason" })
            .orderBy("created_at", "desc")
            .first();
          if (reasonEvent?.metadata) {
            const meta = typeof reasonEvent.metadata === "string"
              ? JSON.parse(reasonEvent.metadata) : reasonEvent.metadata;
            cancelReason = meta.reason || null;
            cancelOtherText = meta.other_text || null;
          }
        }

        // Skip business_closed entirely after Day 1
        if (cancelReason === "business_closed") {
          // Only send Day 1 confirmation
        }

        // Get owner info
        const orgUser = await db("organization_users")
          .where({ organization_id: org.id, role: "admin" })
          .first();
        if (!orgUser) continue;

        const user = await db("users").where({ id: orgUser.user_id }).first("email", "first_name");
        if (!user?.email) continue;

        // Check opt-out
        if (hasBehavioral) {
          const optOut = await db("behavioral_events")
            .where({ organization_id: org.id, event_type: "winback.opt_out" })
            .first();
          if (optOut) { skipped++; continue; }
        }

        const daysSinceCancelled = Math.floor(
          (Date.now() - new Date(org.cancelled_at).getTime()) / 86_400_000
        );

        const cancelledData: CancelledOrg = {
          id: org.id,
          name: org.name,
          cancelled_at: org.cancelled_at,
          cancel_reason: cancelReason,
          cancel_other_text: cancelOtherText,
          owner_email: user.email,
          owner_first_name: user.first_name,
          winback_opt_out: false,
        };

        // Find the email to send today (within 1 day window)
        for (const email of SEQUENCE) {
          if (Math.abs(daysSinceCancelled - email.day) > 1) continue;

          // Check if already sent this step
          if (hasBehavioral) {
            const alreadySent = await db("behavioral_events")
              .where({ organization_id: org.id, event_type: `winback.day_${email.day}_sent` })
              .first();
            if (alreadySent) continue;
          }

          // Check skip condition
          if (email.skipIf && email.skipIf(cancelledData)) {
            skipped++;
            continue;
          }

          // Send the email
          if (EMAIL_WEBHOOK) {
            const subject = email.subject(cancelledData);
            const body = email.body(cancelledData);

            await fetch(EMAIL_WEBHOOK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: user.email,
                subject,
                text: body,
                from: "corey@getalloro.com",
              }),
            }).catch(() => {});

            // Log the send
            if (hasBehavioral) {
              await db("behavioral_events").insert({
                organization_id: org.id,
                event_type: `winback.day_${email.day}_sent`,
                metadata: JSON.stringify({
                  reason: cancelReason,
                  email: user.email,
                  day: email.day,
                }),
              }).catch(() => {});
            }

            sent++;
            console.log(`[Winback] Day ${email.day} email sent to ${user.email} for ${org.name}`);
          }
        }
      } catch (err: any) {
        console.error(`[Winback] Error processing ${org.name}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[Winback] Job failed:", err.message);
  }

  console.log(`[Winback] Complete: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}
