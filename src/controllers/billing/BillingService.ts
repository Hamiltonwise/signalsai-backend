/**
 * Billing Service
 *
 * Handles Stripe integration for subscription billing:
 * - Checkout session creation
 * - Customer portal session creation
 * - Webhook event processing
 * - Subscription status queries
 */

import Stripe from "stripe";
import { db } from "../../database/connection";
import { getStripe, getPriceIdByOrgType, getWebhookSecret } from "../../config/stripe";
import {
  OrganizationModel,
  IOrganization,
} from "../../models/OrganizationModel";
import { updateTier } from "../admin-organizations/feature-services/TierManagementService";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { sendEmail } from "../../emails/emailService";
import { isStripeConfigured } from "../../config/stripe";

// ─── Types ───

export interface BillingStatus {
  tier: string | null;
  subscriptionStatus: string;
  hasStripeSubscription: boolean;
  isAdminGranted: boolean;
  isLockedOut: boolean;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
}

export interface CheckoutResult {
  url: string;
}

// ─── App URL for redirects ───

function getAppUrl(): string {
  return process.env.NODE_ENV === "production"
    ? "https://app.getalloro.com"
    : "http://localhost:5174";
}

// ─── Checkout Session ───

/**
 * Create a Stripe Checkout Session for a subscription.
 *
 * Single-product model: always uses the DFY price regardless of tier param.
 *
 * @param orgId - Organization ID
 * @param tier - Kept for API compatibility — always resolves to DFY
 * @param isOnboarding - Whether this is during onboarding (affects redirect URLs)
 */
export async function createCheckoutSession(
  orgId: number,
  tier: "DWY" | "DFY" = "DFY",
  isOnboarding: boolean = false
): Promise<CheckoutResult> {
  const stripe = getStripe();
  const appUrl = getAppUrl();

  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  // Resolve price by organization type (null defaults to health)
  const orgType = org.organization_type || "health";
  const priceId = getPriceIdByOrgType(orgType);

  // Quantity = number of locations for this org (minimum 1)
  const locationCountResult = await db("locations")
    .where({ organization_id: orgId })
    .count("id as count")
    .first();
  const locationCount = Math.max(Number(locationCountResult?.count) || 0, 1);

  // If org already has a Stripe customer, reuse it
  const customerOptions: Stripe.Checkout.SessionCreateParams["customer"] =
    org.stripe_customer_id || undefined;

  const successUrl = isOnboarding
    ? `${appUrl}/onboarding/payment-success?session_id={CHECKOUT_SESSION_ID}`
    : `${appUrl}/settings/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`;

  const cancelUrl = isOnboarding
    ? `${appUrl}/onboarding/payment-cancelled`
    : `${appUrl}/settings/billing?cancelled=true`;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    allow_promotion_codes: true,
    line_items: [
      {
        price: priceId,
        quantity: locationCount,
      },
    ],
    metadata: {
      organization_id: orgId.toString(),
      tier: "DFY",
      organization_type: orgType,
      location_count: locationCount.toString(),
      is_onboarding: isOnboarding ? "true" : "false",
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  };

  // Attach existing customer or let Stripe create one
  if (customerOptions) {
    sessionParams.customer = customerOptions;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    throw { statusCode: 500, message: "Failed to create checkout session URL" };
  }

  return { url: session.url };
}

// ─── Customer Portal ───

/**
 * Create a Stripe Customer Portal session for managing an existing subscription.
 */
export async function createPortalSession(
  orgId: number
): Promise<CheckoutResult> {
  const stripe = getStripe();
  const appUrl = getAppUrl();

  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  const stripeCustomerId = org.stripe_customer_id;
  if (!stripeCustomerId) {
    throw {
      statusCode: 400,
      message:
        "No Stripe subscription found. Use checkout to create a subscription first.",
    };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  });

  return { url: session.url };
}

// ─── Subscription Status ───

/**
 * Get the billing status for an organization.
 */
export async function getSubscriptionStatus(
  orgId: number
): Promise<BillingStatus> {
  const org = (await db("organizations")
    .where({ id: orgId })
    .select(
      "subscription_tier",
      "subscription_status",
      "stripe_customer_id",
      "stripe_subscription_id"
    )
    .first()) as any;

  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  const hasStripe = !!org.stripe_customer_id;
  const isLockedOut = org.subscription_status === "inactive";
  const isAdminGranted =
    !hasStripe && org.subscription_status === "active";

  // If we have a Stripe subscription, fetch period end from Stripe
  let currentPeriodEnd: string | null = null;
  if (org.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id
      ) as any;
      if (sub.current_period_end) {
        currentPeriodEnd = new Date(
          sub.current_period_end * 1000
        ).toISOString();
      }
    } catch {
      // Stripe fetch failed — return what we have
    }
  }

  return {
    tier: org.subscription_tier,
    subscriptionStatus: org.subscription_status,
    hasStripeSubscription: hasStripe,
    isAdminGranted,
    isLockedOut,
    stripeCustomerId: org.stripe_customer_id,
    currentPeriodEnd,
  };
}

// ─── Webhook Event Processing ───

/**
 * Verify and construct a Stripe webhook event from raw body and signature.
 */
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = getWebhookSecret();
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * Process a verified Stripe webhook event.
 * Handles subscription lifecycle events.
 */
export async function handleWebhookEvent(
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      break;

    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription
      );
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription
      );
      break;

    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }
}

// ─── Webhook Event Handlers ───

/**
 * Handle checkout.session.completed — first-time subscription creation.
 * Saves Stripe customer/subscription IDs and updates tier.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const orgId = session.metadata?.organization_id;
  const tier = session.metadata?.tier as "DWY" | "DFY" | undefined;

  if (!orgId) {
    console.error(
      "[Stripe Webhook] checkout.session.completed missing organization_id in metadata"
    );
    return;
  }

  const organizationId = parseInt(orgId, 10);
  if (isNaN(organizationId)) {
    console.error(
      `[Stripe Webhook] Invalid organization_id: ${orgId}`
    );
    return;
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  console.log(
    `[Stripe Webhook] Checkout completed for org ${organizationId}, tier: ${tier}`
  );

  const trx = await db.transaction();
  try {
    // Save Stripe customer and subscription IDs
    await trx("organizations")
      .where({ id: organizationId })
      .update({
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        subscription_status: "active",
        subscription_started_at: new Date(),
        subscription_updated_at: new Date(),
      });

    // Update tier if specified (triggers DFY upgrade logic if applicable)
    if (tier && ["DWY", "DFY"].includes(tier)) {
      await updateTier(organizationId, tier, trx);
    }

    await trx.commit();
    console.log(
      `[Stripe Webhook] Successfully processed checkout for org ${organizationId}`
    );
  } catch (error) {
    await trx.rollback();
    console.error(
      `[Stripe Webhook] Error processing checkout for org ${organizationId}:`,
      error
    );
    throw error;
  }
}

/**
 * Handle invoice.payment_succeeded — recurring payment confirmation.
 * Ensures subscription_status stays active.
 */
async function handlePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  await db("organizations")
    .where({ stripe_customer_id: customerId })
    .update({
      subscription_status: "active",
      subscription_updated_at: new Date(),
    });

  console.log(
    `[Stripe Webhook] Payment succeeded for customer ${customerId}`
  );
}

/**
 * Handle invoice.payment_failed — mark subscription as potentially inactive.
 */
async function handlePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  // Don't immediately lock out — Stripe will retry. Just log it.
  // If subscription is eventually cancelled, handleSubscriptionDeleted will fire.
  console.warn(
    `[Stripe Webhook] Payment failed for customer ${customerId}`
  );
}

/**
 * Handle customer.subscription.deleted — subscription cancelled.
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return;

  await db("organizations")
    .where({ stripe_customer_id: customerId })
    .update({
      subscription_status: "cancelled",
      subscription_updated_at: new Date(),
    });

  console.log(
    `[Stripe Webhook] Subscription deleted for customer ${customerId}`
  );
}

// ─── Subscription Quantity Sync ───

/**
 * Sync Stripe subscription quantity to match the org's current location count.
 * Called after location add/remove. Best-effort — never throws.
 */
export async function syncSubscriptionQuantity(
  organizationId: number
): Promise<void> {
  try {
    if (!isStripeConfigured()) return;

    const org = await OrganizationModel.findById(organizationId);
    if (!org?.stripe_subscription_id) return;

    // Count current locations
    const result = await db("locations")
      .where({ organization_id: organizationId })
      .count("id as count")
      .first();
    const newQuantity = Math.max(Number(result?.count) || 0, 1);

    // Get subscription from Stripe
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(
      org.stripe_subscription_id
    );

    const item = subscription.items.data[0];
    if (!item) {
      console.warn(
        `[Billing] No subscription items found for org ${organizationId}`
      );
      return;
    }

    const oldQuantity = item.quantity || 1;
    if (oldQuantity === newQuantity) return;

    // Update subscription item quantity (Stripe prorates automatically)
    await stripe.subscriptionItems.update(item.id, {
      quantity: newQuantity,
    });

    console.log(
      `[Billing] Subscription quantity updated for org ${organizationId}: ${oldQuantity} → ${newQuantity}`
    );

    // Notify org admins via email
    try {
      const orgUsers = await OrganizationUserModel.listByOrgWithUsers(
        organizationId
      );
      const adminEmails = orgUsers
        .filter((u) => u.role === "admin")
        .map((u) => u.email)
        .filter(Boolean);

      if (adminEmails.length === 0) return;

      const unitPrice = item.price?.unit_amount
        ? (item.price.unit_amount / 100).toFixed(0)
        : "—";
      const newTotal = item.price?.unit_amount
        ? ((item.price.unit_amount / 100) * newQuantity).toLocaleString()
        : "—";
      const direction = newQuantity > oldQuantity ? "added" : "removed";
      const locationLabel =
        org.organization_type === "saas" ? "team" : "location";
      const locationLabelPlural =
        org.organization_type === "saas" ? "teams" : "locations";

      await sendEmail({
        subject: `Your Alloro subscription has been updated`,
        body: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #1a1a1a;">Subscription Updated</h2>
            <p style="color: #4a5568; font-size: 16px;">
              A ${locationLabel} was ${direction} for <strong>${org.name}</strong>, and your subscription has been automatically adjusted.
            </p>
            <div style="background: #f7f7f7; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0; color: #4a5568;">Previous: <strong>${oldQuantity}</strong> ${oldQuantity === 1 ? locationLabel : locationLabelPlural} × $${unitPrice}/mo</p>
              <p style="margin: 4px 0; color: #4a5568;">Updated: <strong>${newQuantity}</strong> ${newQuantity === 1 ? locationLabel : locationLabelPlural} × $${unitPrice}/mo</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
              <p style="margin: 4px 0; color: #1a1a1a; font-weight: bold;">New monthly total: $${newTotal}/mo</p>
            </div>
            <p style="color: #718096; font-size: 14px;">
              Any price difference for the current billing period will be prorated on your next invoice.
            </p>
          </div>
        `,
        recipients: adminEmails,
      });
    } catch (emailErr) {
      console.warn(
        `[Billing] Failed to send quantity update email for org ${organizationId}:`,
        emailErr
      );
    }
  } catch (error) {
    console.error(
      `[Billing] Failed to sync subscription quantity for org ${organizationId}:`,
      error
    );
  }
}

/**
 * Handle customer.subscription.updated — plan change or status update.
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return;

  // Sync status
  const status =
    subscription.status === "active" ? "active" : "inactive";

  await db("organizations")
    .where({ stripe_customer_id: customerId })
    .update({
      subscription_status: status,
      subscription_updated_at: new Date(),
    });

  console.log(
    `[Stripe Webhook] Subscription updated for customer ${customerId}, status: ${status}`
  );
}
