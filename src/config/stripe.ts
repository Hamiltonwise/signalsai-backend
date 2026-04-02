/**
 * Stripe Configuration
 *
 * Initializes the Stripe SDK with the secret key from environment variables.
 * Exports the configured client and price ID constants.
 *
 * Fails fast if required env vars are missing — no silent fallback.
 */

import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_DEFAULT_PRICE_ID = process.env.STRIPE_HEALTH_PRICE_ID;

if (!STRIPE_SECRET_KEY) {
  console.warn(
    "[Stripe] STRIPE_SECRET_KEY is not set. Billing features will be unavailable."
  );
}

// Initialize Stripe client (lazy — only fails when actually used if key is missing)
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY)
  : null;

/**
 * Get the Stripe client instance.
 * Throws if Stripe is not configured.
 */
export function getStripe(): Stripe {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables."
    );
  }
  return stripe;
}

/**
 * Get the webhook secret for signature verification.
 * Logs a warning if missing (does not crash the server).
 */
export function getWebhookSecret(): string {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn(
      "[Stripe] STRIPE_WEBHOOK_SECRET is not set. Webhook signature verification will fail for incoming events."
    );
    return "";
  }
  return STRIPE_WEBHOOK_SECRET;
}

/**
 * Get the default Stripe price ID ($2,000/location for new clients).
 */
export function getDefaultPriceId(): string {
  if (!STRIPE_DEFAULT_PRICE_ID) {
    throw new Error(
      "Stripe default price ID is not configured. Set STRIPE_HEALTH_PRICE_ID in environment variables."
    );
  }
  return STRIPE_DEFAULT_PRICE_ID;
}

// ─── Tier Pricing ───
// Growth: $997/month -- score, improvement plan, Monday email. No PatientPath or competitor tracking.
// Full: $2,497/month -- everything.
const STRIPE_GROWTH_PRICE_ID = process.env.STRIPE_GROWTH_PRICE_ID;
const STRIPE_FULL_PRICE_ID = process.env.STRIPE_FULL_PRICE_ID;

export type PricingTier = "growth" | "full";

const TIER_PRICE_MAP: Record<PricingTier, string | undefined> = {
  growth: STRIPE_GROWTH_PRICE_ID,
  full: STRIPE_FULL_PRICE_ID,
};

/**
 * Get the Stripe price ID for a given tier.
 * Falls back to the default price ID if the tier-specific env var is not set.
 */
export function getTierPriceId(tier: PricingTier = "full"): string {
  const tierPrice = TIER_PRICE_MAP[tier];
  if (tierPrice) return tierPrice;
  // Fallback: use default price ID
  return getDefaultPriceId();
}

/**
 * Check if Stripe is configured (for graceful degradation).
 */
export function isStripeConfigured(): boolean {
  return !!stripe;
}
