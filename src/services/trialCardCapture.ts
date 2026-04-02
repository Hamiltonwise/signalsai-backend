/**
 * Trial Card Capture Service
 *
 * Handles Stripe SetupIntent flow for capturing a card on file
 * during the trial period, and auto-converting trials on day 7
 * when a card is present.
 */

import { db } from "../database/connection";
import { isStripeConfigured, getStripe, getDefaultPriceId } from "../config/stripe";
import { BehavioralEventModel } from "../models/BehavioralEventModel";
import { sendEmail } from "../emails/emailService";
import { wrapInBaseTemplate, APP_URL } from "../emails/templates/base";

// ---- Create SetupIntent ----

export async function createSetupIntent(
  orgId: number
): Promise<{ clientSecret: string } | null> {
  if (!isStripeConfigured()) {
    console.warn("[TrialCard] Stripe not configured, cannot create SetupIntent");
    return null;
  }

  const stripe = getStripe();

  const org = await db("organizations")
    .where({ id: orgId })
    .select("id", "name", "stripe_customer_id")
    .first();

  if (!org) {
    console.error(`[TrialCard] Org ${orgId} not found`);
    return null;
  }

  // Ensure we have a Stripe customer
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { organization_id: String(orgId) },
      name: org.name || undefined,
    });
    customerId = customer.id;
    await db("organizations")
      .where({ id: orgId })
      .update({ stripe_customer_id: customerId });
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    metadata: { organization_id: String(orgId) },
  });

  BehavioralEventModel.create({
    event_type: "trial.setup_intent_created",
    org_id: orgId,
  }).catch(() => {});

  return { clientSecret: setupIntent.client_secret! };
}

// ---- Confirm card on file ----

export async function confirmCardOnFile(
  orgId: number,
  setupIntentId: string
): Promise<boolean> {
  if (!isStripeConfigured()) {
    console.warn("[TrialCard] Stripe not configured, cannot confirm card");
    return false;
  }

  const stripe = getStripe();

  try {
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

    if (setupIntent.status !== "succeeded") {
      console.warn(`[TrialCard] SetupIntent ${setupIntentId} not succeeded: ${setupIntent.status}`);
      return false;
    }

    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!paymentMethodId) {
      console.warn(`[TrialCard] No payment method on SetupIntent ${setupIntentId}`);
      return false;
    }

    // Store customer + payment method on org
    const customerId =
      typeof setupIntent.customer === "string"
        ? setupIntent.customer
        : setupIntent.customer?.id;

    await db("organizations").where({ id: orgId }).update({
      stripe_customer_id: customerId || undefined,
      stripe_payment_method_id: paymentMethodId,
    });

    BehavioralEventModel.create({
      event_type: "trial.card_on_file",
      org_id: orgId,
      properties: { payment_method_id: paymentMethodId },
    }).catch(() => {});

    console.log(`[TrialCard] Card on file confirmed for org ${orgId}`);
    return true;
  } catch (err: any) {
    console.error(`[TrialCard] confirmCardOnFile error for org ${orgId}:`, err.message);
    return false;
  }
}

// ---- Auto-convert trial ----

export async function autoConvertTrial(orgId: number): Promise<boolean> {
  if (!isStripeConfigured()) {
    console.warn("[TrialCard] Stripe not configured, cannot auto-convert");
    return false;
  }

  const stripe = getStripe();

  const org = await db("organizations")
    .where({ id: orgId })
    .select(
      "id",
      "name",
      "stripe_customer_id",
      "stripe_payment_method_id",
      "stripe_subscription_id",
      "stripe_price_id",
      "billing_quantity_override",
      "trial_status",
      "subscription_status"
    )
    .first();

  if (!org) return false;

  // Guard: already converted or active
  if (
    org.trial_status === "converted" ||
    org.subscription_status === "active" ||
    org.stripe_subscription_id
  ) {
    return false;
  }

  if (!org.stripe_customer_id || !org.stripe_payment_method_id) {
    console.log(`[TrialCard] No card on file for org ${orgId}, skipping auto-convert`);
    return false;
  }

  try {
    // Set default payment method on customer
    await stripe.customers.update(org.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: org.stripe_payment_method_id,
      },
    });

    // Determine quantity
    let quantity = 1;
    if (org.billing_quantity_override != null) {
      quantity = org.billing_quantity_override;
    } else {
      const locationCount = await db("locations")
        .where({ organization_id: orgId })
        .count("id as count")
        .first();
      quantity = Math.max(Number(locationCount?.count) || 0, 1);
    }

    const priceId = org.stripe_price_id || getDefaultPriceId();

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: org.stripe_customer_id,
      items: [{ price: priceId, quantity }],
      default_payment_method: org.stripe_payment_method_id,
      metadata: {
        organization_id: String(orgId),
        tier: "DFY",
        source: "trial_auto_convert",
      },
    });

    // Update org
    await db("organizations").where({ id: orgId }).update({
      trial_status: "converted",
      subscription_status: "active",
      stripe_subscription_id: subscription.id,
      subscription_started_at: new Date(),
      subscription_updated_at: new Date(),
      trial_email_sequence_position: 99, // halt trial emails
    });

    BehavioralEventModel.create({
      event_type: "trial.auto_converted",
      org_id: orgId,
      properties: {
        stripe_subscription_id: subscription.id,
        practice_name: org.name,
      },
    }).catch(() => {});

    // Send confirmation email
    try {
      const orgUser = await db("organization_users")
        .where({ organization_id: orgId })
        .first();
      if (orgUser) {
        const user = await db("users").where({ id: orgUser.user_id }).first();
        if (user?.email) {
          const html = `
            <div style="max-width: 560px; margin: 0 auto;">
              <h1 style="color: #1A1D23; font-size: 22px; font-weight: 700; margin-bottom: 8px;">
                Your Business Clarity subscription is active.
              </h1>
              <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
                Your intelligence continues. Competitive tracking, Monday Briefs, and market insights
                are all running for ${org.name || "your practice"}.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${APP_URL}/dashboard" style="display: inline-block; background: #D56753; color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px;">
                  Open your dashboard
                </a>
              </div>
            </div>
          `;
          await sendEmail({
            subject: "Your Business Clarity subscription is active. Your intelligence continues.",
            body: wrapInBaseTemplate(html, {
              preheader: "Welcome to Alloro.",
              showFooterLinks: false,
            }),
            recipients: [user.email],
          });
        }
      }
    } catch {
      // Non-blocking
    }

    console.log(`[TrialCard] Auto-converted org ${orgId}, subscription ${subscription.id}`);
    return true;
  } catch (err: any) {
    console.error(`[TrialCard] autoConvertTrial error for org ${orgId}:`, err.message);
    return false;
  }
}
