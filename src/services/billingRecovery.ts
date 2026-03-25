/**
 * Billing Recovery Service — WO-BILLING-RECOVERY
 *
 * Payment failed → 24h retry email → 72h final notice → 7d suspend.
 * Creates dream_team_tasks for Jo (urgent) and Corey (if suspended).
 */

import axios from "axios";
import { db } from "../database/connection";

const N8N_WEBHOOK = process.env.ALLORO_N8N_WEBHOOK_URL || "";

// ─── Main handler ───────────────────────────────────────────────────

export async function handlePaymentFailure(orgId: number): Promise<void> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return;

  const orgUser = await db("organization_users")
    .where({ organization_id: orgId, role: "admin" })
    .first();
  const user = orgUser ? await db("users").where({ id: orgUser.user_id }).first() : null;
  const doctorName = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "Doctor";

  // 1. Log behavioral event
  try {
    await db("behavioral_events").insert({
      event_type: "billing.payment_failed",
      org_id: orgId,
      properties: JSON.stringify({
        practice_name: org.name,
        stripe_customer_id: org.stripe_customer_id,
      }),
    });
  } catch {}

  // 2. Create urgent task for Jo
  try {
    const joNode = await db("dream_team_nodes")
      .where({ display_name: "Jo", node_type: "human" })
      .first();

    await db("dream_team_tasks").insert({
      node_id: joNode?.id || null,
      owner_name: "Jo",
      title: `Payment failed -- ${org.name}`,
      description: `${doctorName}'s payment failed. Check Stripe for details. Reach out if needed.`,
      status: "open",
      priority: "urgent",
      source_type: "billing",
    });
  } catch {}

  // 3. Mark payment_failed_at
  await db("organizations").where({ id: orgId }).update({
    payment_failed_at: new Date(),
  });

  console.log(`[BillingRecovery] Payment failed for ${org.name} (org ${orgId})`);
}

// ─── 24-hour follow-up ──────────────────────────────────────────────

export async function sendPaymentFailedEmail(orgId: number): Promise<void> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org || org.subscription_status === "active") return; // recovered

  const orgUser = await db("organization_users")
    .where({ organization_id: orgId, role: "admin" })
    .first();
  const user = orgUser ? await db("users").where({ id: orgUser.user_id }).first() : null;
  if (!user?.email) return;

  const doctorName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Doctor";

  // Build Stripe portal URL for retry
  let retryUrl = "https://app.getalloro.com/settings/billing";
  if (org.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.billingPortal.sessions.create({
        customer: org.stripe_customer_id,
        return_url: "https://app.getalloro.com/settings/billing",
      });
      retryUrl = session.url;
    } catch {}
  }

  if (N8N_WEBHOOK) {
    try {
      await axios.post(N8N_WEBHOOK, {
        email_type: "payment_failed",
        recipient_email: user.email,
        practice_name: org.name,
        doctor_name: doctorName,
        retry_url: retryUrl,
      }, { timeout: 30000 });
      console.log(`[BillingRecovery] 24h email sent to ${user.email}`);
    } catch (err: any) {
      console.error(`[BillingRecovery] 24h email failed:`, err.message);
    }
  }
}

// ─── 72-hour final notice ───────────────────────────────────────────

export async function sendFinalPaymentNotice(orgId: number): Promise<void> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org || org.subscription_status === "active") return;

  const orgUser = await db("organization_users")
    .where({ organization_id: orgId, role: "admin" })
    .first();
  const user = orgUser ? await db("users").where({ id: orgUser.user_id }).first() : null;
  if (!user?.email) return;

  const doctorName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Doctor";

  if (N8N_WEBHOOK) {
    try {
      await axios.post(N8N_WEBHOOK, {
        email_type: "final_payment_notice",
        recipient_email: user.email,
        practice_name: org.name,
        doctor_name: doctorName,
        retry_url: "https://app.getalloro.com/settings/billing",
      }, { timeout: 30000 });
      console.log(`[BillingRecovery] 72h final notice sent to ${user.email}`);
    } catch (err: any) {
      console.error(`[BillingRecovery] 72h final notice failed:`, err.message);
    }
  }
}

// ─── 7-day suspension ───────────────────────────────────────────────

export async function suspendAccount(orgId: number): Promise<void> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org || org.subscription_status === "active") return;

  await db("organizations").where({ id: orgId }).update({
    subscription_status: "suspended",
  });

  // Log behavioral event
  try {
    await db("behavioral_events").insert({
      event_type: "billing.account_suspended",
      org_id: orgId,
      properties: JSON.stringify({ practice_name: org.name }),
    });
  } catch {}

  // Create task for Corey — personal outreach
  try {
    const coreyNode = await db("dream_team_nodes")
      .where({ display_name: "Corey", node_type: "human" })
      .first();

    await db("dream_team_tasks").insert({
      node_id: coreyNode?.id || null,
      owner_name: "Corey",
      title: `Account suspended -- ${org.name} -- needs personal outreach`,
      description: `Payment failed for 7 days. Account suspended. This needs a personal call from Corey.`,
      status: "open",
      priority: "urgent",
      source_type: "billing",
    });
  } catch {}

  console.log(`[BillingRecovery] Account suspended: ${org.name} (org ${orgId})`);
}
