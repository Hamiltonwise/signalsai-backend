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
import axios from "axios";
import { db } from "../../database/connection";
import { getStripe, getDefaultPriceId, getWebhookSecret, getTierPriceId, type PricingTier } from "../../config/stripe";
import {
  OrganizationModel,
  IOrganization,
} from "../../models/OrganizationModel";
import { updateTier } from "../admin-organizations/feature-services/TierManagementService";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { sendEmail } from "../../emails/emailService";
import { isStripeConfigured } from "../../config/stripe";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { applyReferralReward } from "../../services/referralReward";

const ALLORO_BRIEF_WEBHOOK = process.env.ALLORO_BRIEF_SLACK_WEBHOOK || "";

// ─── Types ───

export interface BillingStatus {
  tier: string | null;
  subscriptionStatus: string;
  hasStripeSubscription: boolean;
  isAdminGranted: boolean;
  isLockedOut: boolean;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingPaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface BillingInvoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  coupon: string | null;
  hostedInvoiceUrl: string | null;
}

export interface BillingDiscount {
  couponName: string;
  percentOff: number | null;
  amountOff: number | null;
}

export interface BillingDetails {
  paymentMethod: BillingPaymentMethod | null;
  invoices: BillingInvoice[];
  discount: BillingDiscount | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
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
 * Supports legacy tiers (DWY/DFY) and new tiers (growth/full).
 * growth = $997/month, full = $2,497/month.
 *
 * @param orgId - Organization ID
 * @param tier - Pricing tier. Defaults to "full" for backward compatibility
 * @param isOnboarding - Whether this is during onboarding (affects redirect URLs)
 */
export async function createCheckoutSession(
  orgId: number,
  tier: "DWY" | "DFY" | "growth" | "full" = "DFY",
  isOnboarding: boolean = false
): Promise<CheckoutResult> {
  const stripe = getStripe();
  const appUrl = getAppUrl();

  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  // Resolve price: org-specific override > tier-based > default
  let priceId: string;
  if (org.stripe_price_id) {
    priceId = org.stripe_price_id;
  } else if (tier === "growth" || tier === "full") {
    priceId = getTierPriceId(tier as PricingTier);
  } else {
    priceId = getDefaultPriceId();
  }

  // Quantity = override if set (flat-rate clients), otherwise location count
  let locationCount: number;
  if (org.billing_quantity_override != null) {
    locationCount = org.billing_quantity_override;
  } else {
    const locationCountResult = await db("locations")
      .where({ organization_id: orgId })
      .count("id as count")
      .first();
    locationCount = Math.max(Number(locationCountResult?.count) || 0, 1);
  }

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
      tier: tier,
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

  // If we have a Stripe subscription, fetch period end + cancel state from Stripe
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;
  if (org.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id
      ) as any;
      // cancel_at is a timestamp when cancellation is scheduled (via portal)
      // cancel_at_period_end is a boolean (via API direct cancel)
      // current_period_end was removed in Stripe SDK v20 — use cancel_at or billing_cycle_anchor
      const isCancelling = sub.cancel_at_period_end === true || !!sub.cancel_at;
      cancelAtPeriodEnd = isCancelling;

      if (sub.cancel_at) {
        currentPeriodEnd = new Date(sub.cancel_at * 1000).toISOString();
      } else if (sub.current_period_end) {
        currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
      }
    } catch (err: any) {
      console.error(`[Billing] Failed to fetch subscription ${org.stripe_subscription_id}:`, err?.message || err);
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
    cancelAtPeriodEnd,
  };
}

// ─── Billing Details ───

/**
 * Get detailed billing information for an organization.
 * Fetches payment method, invoices, discount, and cancellation state from Stripe.
 * Returns null-safe defaults for orgs without Stripe.
 */
export async function getBillingDetails(
  orgId: number
): Promise<BillingDetails> {
  const org = (await db("organizations")
    .where({ id: orgId })
    .select("stripe_customer_id", "stripe_subscription_id")
    .first()) as any;

  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  const result: BillingDetails = {
    paymentMethod: null,
    invoices: [],
    discount: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  };

  if (!org.stripe_customer_id) {
    return result;
  }

  const stripe = getStripe();

  // Fetch payment method, invoices, and subscription in parallel
  const [invoicesResult, subscriptionResult] = await Promise.allSettled([
    stripe.invoices.list({
      customer: org.stripe_customer_id,
      limit: 12,
      expand: ["data.discount"],
    }),
    org.stripe_subscription_id
      ? stripe.subscriptions.retrieve(org.stripe_subscription_id, {
          expand: ["default_payment_method", "discount"],
        })
      : Promise.resolve(null),
  ]);

  // Extract invoices
  if (invoicesResult.status === "fulfilled" && invoicesResult.value) {
    result.invoices = invoicesResult.value.data.map((inv) => {
      let coupon: string | null = null;
      const discount = (inv as any).discount;
      if (discount?.coupon) {
        coupon = discount.coupon.name || discount.coupon.id;
      }
      return {
        id: inv.id,
        date: new Date((inv.created ?? 0) * 1000).toISOString(),
        amount: (inv.amount_paid ?? 0) / 100,
        currency: inv.currency ?? "usd",
        status: inv.status ?? "unknown",
        coupon,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      };
    });
  }

  // Extract subscription details (payment method, discount, cancel state)
  if (subscriptionResult.status === "fulfilled" && subscriptionResult.value) {
    const sub = subscriptionResult.value as any;

    // Payment method
    const pm = sub.default_payment_method;
    if (pm && typeof pm === "object" && pm.card) {
      result.paymentMethod = {
        brand: pm.card.brand ?? "unknown",
        last4: pm.card.last4 ?? "????",
        expMonth: pm.card.exp_month ?? 0,
        expYear: pm.card.exp_year ?? 0,
      };
    }

    // Active discount/coupon
    if (sub.discount?.coupon) {
      result.discount = {
        couponName: sub.discount.coupon.name || sub.discount.coupon.id,
        percentOff: sub.discount.coupon.percent_off ?? null,
        amountOff: sub.discount.coupon.amount_off
          ? sub.discount.coupon.amount_off / 100
          : null,
      };
    }

    // Cancellation state — cancel_at (timestamp) or cancel_at_period_end (boolean)
    result.cancelAtPeriodEnd = sub.cancel_at_period_end === true || !!sub.cancel_at;
    result.canceledAt = sub.canceled_at
      ? new Date(sub.canceled_at * 1000).toISOString()
      : null;
  }

  return result;
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

    case "customer.subscription.created":
      await handleSubscriptionCreated(
        event.data.object as Stripe.Subscription
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
 * Handle customer.subscription.created — new subscription activated.
 * Sets billing_status active, halts trial email chain, logs event, posts to Slack.
 */
async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return;

  const org = await db("organizations")
    .where({ stripe_customer_id: customerId })
    .first();

  if (!org) {
    console.warn(`[Stripe Webhook] subscription.created: no org for customer ${customerId}`);
    return;
  }

  await db("organizations")
    .where({ id: org.id })
    .update({
      subscription_status: "active",
      subscription_started_at: new Date(),
      subscription_updated_at: new Date(),
      trial_email_sequence_position: 99, // halt trial email chain
    });

  // Log behavioral event
  BehavioralEventModel.create({
    event_type: "billing.subscription_created",
    org_id: org.id,
    properties: {
      practice_name: org.name,
      stripe_customer_id: customerId,
    },
  }).catch(() => {});

  // ─── Referral reward: "Split the check. We all rise together." ───
  // When a referred friend subscribes, both get one free month.
  if (org.referred_by_org_id) {
    try {
      const stripe = getStripe();
      const referrerOrg = await db("organizations")
        .where({ id: org.referred_by_org_id })
        .select("id", "name", "stripe_customer_id")
        .first();

      if (referrerOrg?.stripe_customer_id) {
        // Create a one-time 100% off coupon for the referrer's next invoice
        const coupon = await stripe.coupons.create({
          percent_off: 100,
          duration: "once",
          name: `Referral reward: ${org.name} joined`,
          metadata: { referrer_org_id: String(referrerOrg.id), referred_org_id: String(org.id) },
        });

        // Apply to referrer's subscription
        const referrerSubs = await stripe.subscriptions.list({
          customer: referrerOrg.stripe_customer_id,
          status: "active",
          limit: 1,
        });
        if (referrerSubs.data.length > 0) {
          // Apply coupon to next invoice via invoice item credit
          await stripe.invoiceItems.create({
            customer: referrerOrg.stripe_customer_id,
            amount: -200000, // -$2,000 credit (one month free)
            currency: "usd",
            description: `Referral reward: ${org.name} joined Alloro. We all rise together.`,
          });
        }

        // Notify referrer via notification bell
        await db("notifications").insert({
          organization_id: referrerOrg.id,
          title: "Your referral paid off",
          message: `${org.name} just joined Alloro. Your free month starts on your next billing cycle. We all rise together.`,
          type: "system",
          read: false,
          metadata: JSON.stringify({ source: "referral_reward", referred_org: org.name }),
          created_at: new Date(),
          updated_at: new Date(),
        }).catch(() => {});

        // Track the reward
        BehavioralEventModel.create({
          event_type: "referral.reward_applied",
          org_id: referrerOrg.id,
          properties: {
            referred_org_name: org.name,
            referred_org_id: org.id,
            coupon_id: coupon.id,
          },
        }).catch(() => {});

        console.log(`[Referral] Reward applied: ${referrerOrg.name} gets free month for referring ${org.name}`);
      }
    } catch (err: any) {
      console.error("[Referral] Reward application failed (non-blocking):", err.message);
    }
  }

  // Apply referral reward via referrals table (tracks both orgs, applies coupons)
  try {
    await applyReferralReward(org.id);
  } catch (err: any) {
    console.error("[Referral] applyReferralReward in webhook (non-blocking):", err.message);
  }

  // Post to #alloro-brief
  if (ALLORO_BRIEF_WEBHOOK) {
    axios
      .post(ALLORO_BRIEF_WEBHOOK, {
        text: `New subscriber: ${org.name} $2,000/mo${org.referred_by_org_id ? " (referral)" : ""}`,
      })
      .catch(() => {});
  }

  console.log(
    `[Stripe Webhook] Subscription created for ${org.name} (org ${org.id})`
  );
}

/**
 * Handle invoice.payment_succeeded — recurring payment confirmation.
 * Sets last_payment_at, ensures subscription_status stays active.
 */
async function handlePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  const org = await db("organizations")
    .where({ stripe_customer_id: customerId })
    .first();

  await db("organizations")
    .where({ stripe_customer_id: customerId })
    .update({
      subscription_status: "active",
      subscription_updated_at: new Date(),
      last_payment_at: new Date(),
    });

  // Log behavioral event
  if (org) {
    BehavioralEventModel.create({
      event_type: "billing.payment_succeeded",
      org_id: org.id,
      properties: {
        practice_name: org.name,
        amount: (invoice as any).amount_paid,
      },
    }).catch(() => {});
  }

  console.log(
    `[Stripe Webhook] Payment succeeded for customer ${customerId}`
  );
}

/**
 * Handle invoice.payment_failed — log event + create dream_team_task for Jo.
 * Don't lock out -- Stripe will retry. If subscription is eventually cancelled,
 * handleSubscriptionDeleted will fire.
 */
async function handlePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  const org = await db("organizations")
    .where({ stripe_customer_id: customerId })
    .first();

  // Log behavioral event
  if (org) {
    BehavioralEventModel.create({
      event_type: "billing.payment_failed",
      org_id: org.id,
      properties: {
        practice_name: org.name,
        stripe_customer_id: customerId,
      },
    }).catch(() => {});

    // Create urgent dream_team_task for Jo (deduped)
    const existing = await db("dream_team_tasks")
      .where({ owner_name: "Jo", status: "open", source_type: "billing" })
      .whereRaw("title LIKE ?", [`%${org.name}%`])
      .first();

    if (!existing) {
      await db("dream_team_tasks")
        .insert({
          owner_name: "Jo",
          title: `Payment failed -- ${org.name}`,
          description: `Stripe payment failed for ${org.name} (org ${org.id}). Customer ID: ${customerId}. Stripe will retry automatically but Jo should reach out proactively.`,
          status: "open",
          priority: "urgent",
          source_type: "billing",
        })
        .catch((err: any) => {
          console.error("[Stripe Webhook] Failed to create dream_team_task:", err.message);
        });
    }
  }

  console.warn(
    `[Stripe Webhook] Payment failed for customer ${customerId}${org ? ` (${org.name})` : ""}`
  );
}

/**
 * Handle customer.subscription.deleted — subscription cancelled.
 * Sets status cancelled, logs event, posts to Slack.
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return;

  const org = await db("organizations")
    .where({ stripe_customer_id: customerId })
    .first();

  await db("organizations")
    .where({ stripe_customer_id: customerId })
    .update({
      subscription_status: "cancelled",
      subscription_cancelled_at: new Date(),
      subscription_updated_at: new Date(),
    });

  // Log behavioral event
  if (org) {
    BehavioralEventModel.create({
      event_type: "billing.subscription_cancelled",
      org_id: org.id,
      properties: {
        practice_name: org.name,
        stripe_customer_id: customerId,
      },
    }).catch(() => {});

    // Post to #alloro-brief
    if (ALLORO_BRIEF_WEBHOOK) {
      axios
        .post(ALLORO_BRIEF_WEBHOOK, {
          text: `Cancellation: ${org.name}`,
        })
        .catch(() => {});
    }
  }

  console.log(
    `[Stripe Webhook] Subscription deleted for customer ${customerId}${org ? ` (${org.name})` : ""}`
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

    // Use override if set (flat-rate clients), otherwise count locations
    let newQuantity: number;
    if (org.billing_quantity_override != null) {
      newQuantity = org.billing_quantity_override;
    } else {
      const result = await db("locations")
        .where({ organization_id: organizationId })
        .count("id as count")
        .first();
      newQuantity = Math.max(Number(result?.count) || 0, 1);
    }

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

      await sendEmail({
        subject: `Your Alloro subscription has been updated`,
        body: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #1a1a1a;">Subscription Updated</h2>
            <p style="color: #4a5568; font-size: 16px;">
              A location was ${direction} for <strong>${org.name}</strong>, and your subscription has been automatically adjusted.
            </p>
            <div style="background: #f7f7f7; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0; color: #4a5568;">Previous: <strong>${oldQuantity}</strong> ${oldQuantity === 1 ? "location" : "locations"} × $${unitPrice}/mo</p>
              <p style="margin: 4px 0; color: #4a5568;">Updated: <strong>${newQuantity}</strong> ${newQuantity === 1 ? "location" : "locations"} × $${unitPrice}/mo</p>
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
