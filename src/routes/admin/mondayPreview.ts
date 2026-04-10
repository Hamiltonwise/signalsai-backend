/**
 * Monday Email Command Center API (Admin Only)
 *
 * GET  /api/admin/monday-preview           -- All orgs with preview data + hold status
 * POST /api/admin/monday-preview/hold      -- Hold an org's Monday email
 * POST /api/admin/monday-preview/release   -- Release a held email
 * POST /api/admin/monday-preview/global-pause  -- Pause all Monday emails
 * POST /api/admin/monday-preview/global-resume -- Resume all Monday emails
 * GET  /api/admin/monday-preview/global-status -- Check if globally paused
 * POST /api/admin/monday-preview/test-send -- Send test email to admin
 * POST /api/admin/monday-preview/override-hero -- Override Oz hero for next send
 * POST /api/admin/monday-preview/refresh   -- Re-run Oz Engine for an org
 *
 * Hold/release state stored in behavioral_events:
 *   event_type: "monday_email.hold" / "monday_email.release"
 *   org_id: the org (or NULL for global)
 *   metadata: { reason, adminEmail }
 *
 * The Monday email job checks isOrgHeld() before sending.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { getOzEngineResult, type OzEngineResult } from "../../services/ozEngine";
import { cleanCompetitorName } from "../../utils/textCleaning";

const mondayPreviewRoutes = express.Router();

// ── Shared helpers ──────────────────────────────────────────────────

function adminOnly(req: any, res: any): boolean {
  if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
    res.status(403).json({ error: "Admin only" });
    return false;
  }
  return true;
}

/**
 * Check if an org's Monday email is held.
 * Looks for the most recent hold or release event. If the most recent is
 * "monday_email.hold", the org is held.
 *
 * Exported so the email job can import and use it.
 */
export async function isOrgHeld(orgId: number): Promise<{ held: boolean; reason: string | null; heldAt: string | null }> {
  try {
    const latest = await db("behavioral_events")
      .where({ org_id: orgId })
      .whereIn("event_type", ["monday_email.hold", "monday_email.release"])
      .orderBy("created_at", "desc")
      .first();

    if (latest && latest.event_type === "monday_email.hold") {
      const meta = typeof latest.properties === "string" ? JSON.parse(latest.properties) : latest.properties;
      return {
        held: true,
        reason: meta?.reason || "Held by admin",
        heldAt: latest.created_at?.toISOString?.() || latest.created_at || null,
      };
    }
    return { held: false, reason: null, heldAt: null };
  } catch {
    return { held: false, reason: null, heldAt: null };
  }
}

/**
 * Check if Monday emails are globally paused.
 * Uses org_id = NULL as the system-level flag (FK constraint prevents org_id = 0).
 */
export async function isGloballyPaused(): Promise<{ paused: boolean; reason: string | null; pausedAt: string | null }> {
  try {
    const latest = await db("behavioral_events")
      .where({ org_id: null })
      .whereIn("event_type", ["monday_email.global_pause", "monday_email.global_resume"])
      .orderBy("created_at", "desc")
      .first();

    if (latest && latest.event_type === "monday_email.global_pause") {
      const meta = typeof latest.properties === "string" ? JSON.parse(latest.properties) : latest.properties;
      return {
        paused: true,
        reason: meta?.reason || "Paused by admin",
        pausedAt: latest.created_at?.toISOString?.() || latest.created_at || null,
      };
    }
    return { paused: false, reason: null, pausedAt: null };
  } catch {
    return { paused: false, reason: null, pausedAt: null };
  }
}

/**
 * Get hero override for an org (if any). Returns null if none or already consumed.
 */
export async function getHeroOverride(orgId: number): Promise<{ headline: string; context: string } | null> {
  try {
    const override = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "monday_email.hero_override" })
      .orderBy("created_at", "desc")
      .first();

    if (!override) return null;

    const meta = typeof override.properties === "string" ? JSON.parse(override.properties) : override.properties;
    if (meta?.consumed) return null;

    return { headline: meta?.headline || "", context: meta?.context || "" };
  } catch {
    return null;
  }
}

/**
 * Mark a hero override as consumed (called by the email job after using it).
 */
export async function consumeHeroOverride(orgId: number): Promise<void> {
  try {
    const override = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "monday_email.hero_override" })
      .orderBy("created_at", "desc")
      .first();

    if (override) {
      const meta = typeof override.properties === "string" ? JSON.parse(override.properties) : override.properties;
      await db("behavioral_events")
        .where({ id: override.id })
        .update({ properties: JSON.stringify({ ...meta, consumed: true }) });
    }
  } catch { /* non-blocking */ }
}

// ── Types ──────────────────────────────────────────────────────────

interface ReadingPreview {
  label: string;
  value: string;
  context: string;
  status: "healthy" | "attention" | "critical";
}

interface EmailPreview {
  orgId: number;
  orgName: string;
  ownerName: string;
  ownerEmail: string;
  ozMoment: OzEngineResult | null;
  readings: ReadingPreview[];
  lastEmailSentAt: string | null;
  subscriptionStatus: string;
  held: boolean;
  holdReason: string | null;
  heldAt: string | null;
  snapshotAge: number | null; // days since last snapshot
  heroOverride: { headline: string; context: string } | null;
}

// ── GET / -- List all orgs with preview data ──────────────────────

mondayPreviewRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;

      const globalStatus = await isGloballyPaused();

      const orgs = await db("organizations")
        .where(function () {
          this.where({ subscription_status: "active" })
            .orWhereNotNull("checkup_score")
            .orWhere("onboarding_completed", true);
        })
        .select("id", "name", "subscription_status", "checkup_data", "created_at");

      const previews: EmailPreview[] = [];

      for (const org of orgs) {
        // Owner info
        const orgUser = await db("organization_users")
          .where({ organization_id: org.id, role: "admin" })
          .first();

        let ownerName = org.name || "Unknown";
        let ownerEmail = "";

        if (orgUser) {
          const user = await db("users").where({ id: orgUser.user_id }).first();
          if (user) {
            ownerName = [user.first_name, user.last_name].filter(Boolean).join(" ") || org.name || "Unknown";
            ownerEmail = user.email || "";
          }
        }

        // Oz Engine
        let ozMoment: OzEngineResult | null = null;
        try {
          ozMoment = await getOzEngineResult(org.id);
        } catch { /* non-blocking */ }

        // Readings from snapshot
        const readings: ReadingPreview[] = [];

        const snapshot = await db("weekly_ranking_snapshots")
          .where({ org_id: org.id })
          .orderBy("week_start", "desc")
          .first();

        // Snapshot age in days
        let snapshotAge: number | null = null;
        if (snapshot?.week_start) {
          const snapshotDate = new Date(snapshot.week_start);
          snapshotAge = Math.floor((Date.now() - snapshotDate.getTime()) / 86_400_000);
        }

        const clientReviews = snapshot?.client_review_count || 0;
        const compReviews = snapshot?.competitor_review_count || 0;
        const compName = cleanCompetitorName(snapshot?.competitor_name || "");

        if (clientReviews > 0) {
          const gap = compReviews - clientReviews;
          readings.push({
            label: "Reviews",
            value: `${clientReviews}`,
            context: gap > 0 && compName
              ? `${compName} has ${compReviews}. Gap: ${gap}.`
              : compName ? `Leading ${compName}.` : `${clientReviews} total.`,
            status: gap > 50 ? "attention" : "healthy",
          });
        }

        const cd = org.checkup_data
          ? (typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data)
          : null;

        const city = cd?.market?.city || null;
        const totalComp = cd?.market?.totalCompetitors || null;
        if (city && totalComp) {
          readings.push({
            label: "Market",
            value: `${totalComp} competitors`,
            context: `In ${city}.`,
            status: "healthy",
          });
        }

        // Last email sent
        let lastEmailSentAt: string | null = null;
        try {
          const lastEvent = await db("behavioral_events")
            .where({ org_id: org.id, event_type: "monday_email.sent" })
            .orderBy("created_at", "desc")
            .first("created_at");
          lastEmailSentAt = lastEvent?.created_at?.toISOString?.() || lastEvent?.created_at || null;
        } catch { /* table may not exist */ }

        // Hold status (from behavioral_events)
        const holdStatus = await isOrgHeld(org.id);

        // Hero override
        const heroOverride = await getHeroOverride(org.id);

        previews.push({
          orgId: org.id,
          orgName: org.name || "Unknown",
          ownerName,
          ownerEmail,
          ozMoment,
          readings,
          lastEmailSentAt,
          subscriptionStatus: org.subscription_status || "unknown",
          held: holdStatus.held,
          holdReason: holdStatus.reason,
          heldAt: holdStatus.heldAt,
          snapshotAge,
          heroOverride,
        });
      }

      // Sort: held first, then by org name
      previews.sort((a, b) => {
        if (a.held && !b.held) return -1;
        if (!a.held && b.held) return 1;
        return (a.orgName || "").localeCompare(b.orgName || "");
      });

      return res.json({
        previews,
        globalPaused: globalStatus.paused,
        globalPauseReason: globalStatus.reason,
        globalPausedAt: globalStatus.pausedAt,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[MondayPreview] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── POST /hold -- Hold an org's email ──────────────────────────────

mondayPreviewRoutes.post(
  "/hold",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;

      const { orgId, reason } = req.body;
      if (!orgId) return res.status(400).json({ error: "orgId required" });

      await db("behavioral_events").insert({
        org_id: orgId,
        event_type: "monday_email.hold",
        properties: JSON.stringify({
          reason: reason || "Held from Monday Email HQ",
          adminEmail: req.user?.email || "unknown",
        }),
      });

      return res.json({ success: true, held: true, orgId });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── POST /release -- Release a held email ──────────────────────────

mondayPreviewRoutes.post(
  "/release",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;

      const { orgId } = req.body;
      if (!orgId) return res.status(400).json({ error: "orgId required" });

      await db("behavioral_events").insert({
        org_id: orgId,
        event_type: "monday_email.release",
        properties: JSON.stringify({
          adminEmail: req.user?.email || "unknown",
        }),
      });

      return res.json({ success: true, held: false, orgId });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── POST /global-pause -- Pause ALL Monday emails ──────────────────

mondayPreviewRoutes.post(
  "/global-pause",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;

      const { reason } = req.body;

      await db("behavioral_events").insert({
        org_id: null,
        event_type: "monday_email.global_pause",
        properties: JSON.stringify({
          reason: reason || "Global pause from Monday Email HQ",
          adminEmail: req.user?.email || "unknown",
        }),
      });

      return res.json({ success: true, paused: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── POST /global-resume -- Resume all Monday emails ────────────────

mondayPreviewRoutes.post(
  "/global-resume",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;

      await db("behavioral_events").insert({
        org_id: null,
        event_type: "monday_email.global_resume",
        properties: JSON.stringify({
          adminEmail: req.user?.email || "unknown",
        }),
      });

      return res.json({ success: true, paused: false });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── GET /global-status -- Check global pause state ─────────────────

mondayPreviewRoutes.get(
  "/global-status",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;
      const status = await isGloballyPaused();
      return res.json(status);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── POST /test-send -- Send test email to admin ────────────────────

mondayPreviewRoutes.post(
  "/test-send",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;

      const { orgId, testEmail } = req.body;
      if (!orgId) return res.status(400).json({ error: "orgId required" });

      // SAFETY: Always default to info@getalloro.com, never to the customer.
      // An explicit testEmail can override (e.g. corey@getalloro.com), but
      // the system will never accidentally send a test to a customer inbox.
      const recipientEmail = testEmail || "info@getalloro.com";
      if (!recipientEmail) return res.status(400).json({ error: "No email to send to" });

      // Use the REAL email pipeline -- identical to what the customer receives,
      // only the recipient and subject prefix change. One code path. One email.
      const { sendMondayEmailForOrg } = await import("../../jobs/mondayEmail");

      const org = await db("organizations").where({ id: orgId }).first();
      if (!org) return res.status(404).json({ error: "Org not found" });

      const success = await sendMondayEmailForOrg(orgId, {
        overrideRecipient: recipientEmail,
        testMode: true,
      });

      return res.json({ success, sentTo: recipientEmail, orgName: org.name });
    } catch (err: any) {
      console.error("[MondayPreview] Test send error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── POST /override-hero -- Set one-time hero override ──────────────

mondayPreviewRoutes.post(
  "/override-hero",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;

      const { orgId, headline, context } = req.body;
      if (!orgId || !headline) return res.status(400).json({ error: "orgId and headline required" });

      await db("behavioral_events").insert({
        org_id: orgId,
        event_type: "monday_email.hero_override",
        properties: JSON.stringify({
          headline,
          context: context || "",
          consumed: false,
          adminEmail: req.user?.email || "unknown",
        }),
      });

      return res.json({ success: true, orgId, headline });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── POST /refresh -- Re-run Oz Engine for an org ──────────────────

mondayPreviewRoutes.post(
  "/refresh",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      if (!adminOnly(req, res)) return;

      const { orgId } = req.body;
      if (!orgId) return res.status(400).json({ error: "orgId required" });

      const ozMoment = await getOzEngineResult(orgId);
      return res.json({ success: true, orgId, ozMoment });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

export default mondayPreviewRoutes;
