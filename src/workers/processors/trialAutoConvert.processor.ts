/**
 * Trial Auto-Convert Processor
 *
 * BullMQ processor that runs daily at 8 AM ET.
 * Finds orgs whose trial has ended and auto-converts
 * those with a card on file. Sends a loss-aversion email
 * to those without.
 */

import { Job } from "bullmq";
import { db } from "../../database/connection";
import { autoConvertTrial } from "../../services/trialCardCapture";
import { sendTrialDay7 } from "../../services/trialEmailService";

export async function processTrialAutoConvert(job: Job): Promise<void> {
  console.log("[TrialAutoConvert] Starting daily trial auto-convert scan...");

  try {
    // Find orgs where trial has ended and trial_status is still 'active'
    const expiredTrials = await db("organizations")
      .where("trial_end_at", "<=", new Date())
      .where("trial_status", "active")
      .whereNot("subscription_status", "active")
      .select("id", "name", "stripe_payment_method_id");

    console.log(`[TrialAutoConvert] Found ${expiredTrials.length} expired trials`);

    let converted = 0;
    let lossEmails = 0;

    for (const org of expiredTrials) {
      if (org.stripe_payment_method_id) {
        // Card on file: auto-convert
        const success = await autoConvertTrial(org.id);
        if (success) {
          converted++;
          console.log(`[TrialAutoConvert] Auto-converted org ${org.id} (${org.name})`);
        }
      } else {
        // No card: send Day 7 loss-aversion email (if not already sent)
        try {
          await sendTrialDay7(org.id);
          lossEmails++;
        } catch (err: any) {
          console.error(
            `[TrialAutoConvert] Failed to send Day 7 email for org ${org.id}:`,
            err.message
          );
        }
      }
    }

    console.log(
      `[TrialAutoConvert] Complete. Converted: ${converted}, Loss emails: ${lossEmails}`
    );
  } catch (err: any) {
    console.error("[TrialAutoConvert] Processor error:", err.message);
    throw err;
  }
}
