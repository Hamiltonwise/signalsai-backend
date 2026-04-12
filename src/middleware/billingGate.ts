/**
 * Billing Gate Middleware
 *
 * Blocks locked-out organizations from accessing protected routes.
 * Returns 402 when subscription_status === 'inactive'.
 *
 * Self-sufficient — parses JWT from Authorization header and does its own
 * user → org lookup. Mounted globally; skips exempt paths.
 *
 * Exempt paths (always pass through):
 *  - /api/auth          — login/register
 *  - /api/billing       — must be accessible to add payment
 *  - /api/admin         — admin panel
 *  - /api/onboarding    — onboarding flow
 *  - /api/profile       — need to load profile/settings
 *  - /api/support       — help form
 *  - /api/websites      — public contact form
 *  - /api/imports       — public file serving
 *  - /api/scraper       — n8n webhooks
 *  - /api/places        — GBP search
 *  - /api/audit         — audit tracking
 *  - /api/minds         — public skill API
 */

import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { db } from "../database/connection";

const EXEMPT_PREFIXES = [
  "/api/auth",
  "/api/billing",
  "/api/admin",
  "/api/onboarding",
  "/api/profile",
  "/api/support",
  "/api/websites",
  "/api/imports",
  "/api/scraper",
  "/api/places",
  "/api/audit",
  "/api/minds",
  "/api/pm",
];

export const billingGateMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check exempt paths
    const path = req.path;
    if (EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return next();
    }

    // Parse JWT from Authorization header (non-blocking — skips if absent or invalid)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.slice(7);
    let userId: number | undefined;

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "secret"
      ) as any;
      userId = decoded.userId;
    } catch {
      // Invalid/expired JWT — let downstream auth middleware handle it
      return next();
    }

    if (!userId) {
      return next();
    }

    // Look up the user's organization
    const orgUser = await db("organization_users")
      .where({ user_id: userId })
      .select("organization_id")
      .first();

    if (!orgUser) {
      // No org yet (pre-onboarding) — pass through
      return next();
    }

    const org = await db("organizations")
      .where({ id: orgUser.organization_id })
      .select("subscription_status", "trial_end_at", "stripe_customer_id", "account_type")
      .first();

    if (!org) {
      return next();
    }

    // Foundation and Heroes accounts bypass all billing gates permanently
    if (org.account_type === "foundation" || org.account_type === "heroes") {
      return next();
    }

    // Active subscription -- pass through
    if (org.subscription_status === "active") {
      return next();
    }

    // Admin-granted access (e.g. demo accounts, internal)
    if (org.subscription_status === "admin_granted") {
      return next();
    }

    // Explicitly locked out (cancelled, failed payment, admin action)
    if (org.subscription_status === "inactive") {
      return res.status(402).json({
        success: false,
        errorCode: "ACCOUNT_LOCKED",
        message:
          "Your account is locked. Please add billing information to continue.",
      });
    }

    // Trial expired: past trial_end_at and not actively subscribed
    if (org.trial_end_at) {
      const trialEnd = new Date(org.trial_end_at);
      const now = new Date();
      if (trialEnd < now && org.subscription_status !== "active") {
        // Grace period: 3 days after trial end before full lockout
        const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
        const isInGrace = (now.getTime() - trialEnd.getTime()) <= gracePeriodMs;
        return res.status(402).json({
          success: false,
          errorCode: isInGrace ? "TRIAL_GRACE" : "TRIAL_EXPIRED",
          message: isInGrace
            ? "Your trial has ended. Subscribe now to keep your intelligence flowing."
            : "Your free trial has ended. Subscribe to continue.",
          trialEndedAt: org.trial_end_at,
        });
      }
    }

    return next();
  } catch (error) {
    console.error("[BillingGate] Error checking billing status:", error);
    // On error, let the request through — don't lock out on middleware failure
    return next();
  }
};
