/**
 * Card H — Per-Location Notification Routing settings API.
 *
 * Read + UPSERT endpoints for location_notification_config plus the
 * bulk-config affordance (copy from one location to another).
 *
 * Routes registered under /api/admin/locations/:locationId/notifications.
 * Authenticated as the location's org admin (rbacMiddleware).
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { checkVoice } from "../../services/narrator/voiceConstraints";
import {
  copyLocationNotificationConfig,
  getLocationNotificationConfig,
  setLocationNotificationConfig,
  type LocationNotificationType,
} from "../../services/notifications/locationRouter";
import { getVocab } from "../../services/vocabulary/vocabLoader";

const router = express.Router();

const VALID_TYPES: LocationNotificationType[] = [
  "form_submission",
  "referral_received",
  "review_alert",
];

function isValidType(t: string): t is LocationNotificationType {
  return (VALID_TYPES as string[]).includes(t);
}

/**
 * GET /api/admin/locations/:locationId/notifications
 *
 * Returns the three notification_type rows for a location plus the
 * vocabulary-aware location_term so the UI label respects the practice's
 * vertical (office vs clinic vs branch vs firm).
 */
router.get(
  "/:locationId/notifications",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const locationId = Number(req.params.locationId);
      if (!Number.isFinite(locationId)) {
        return res.status(400).json({ success: false, error: "invalid location id" });
      }

      // Confirm the caller owns this location
      const location = await db("locations").where({ id: locationId }).first();
      if (!location) {
        return res.status(404).json({ success: false, error: "location not found" });
      }
      const callerOrg = req.effectiveOrgId || req.organizationId;
      if (callerOrg && location.organization_id !== callerOrg) {
        return res.status(403).json({ success: false, error: "forbidden" });
      }

      const config = await getLocationNotificationConfig(locationId);
      const vocab = await getVocab(location.organization_id).catch(() => null);
      // vocab.locationTerm is the per-vertical noun ("office", "clinic", "firm").
      // vocabLoader.ts exposes only providerTerm/customerTerm/etc. by default;
      // this card relies on the L-001 plumbing that maps via vocabulary_configs.
      const locationTerm =
        (vocab as any)?.locationTerm ||
        (vocab as any)?.location_term ||
        "location";

      return res.json({
        success: true,
        location: {
          id: location.id,
          name: location.name,
          organization_id: location.organization_id,
        },
        location_term: locationTerm,
        config,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[LocationNotificationConfig] GET failed: ${message}`,
      );
      return res.status(500).json({ success: false, error: "internal error" });
    }
  },
);

/**
 * PUT /api/admin/locations/:locationId/notifications/:notificationType
 * Body: { email_addresses: string[] }
 */
router.put(
  "/:locationId/notifications/:notificationType",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const locationId = Number(req.params.locationId);
      const notificationType = String(req.params.notificationType);
      if (!Number.isFinite(locationId) || !isValidType(notificationType)) {
        return res.status(400).json({ success: false, error: "invalid params" });
      }
      const emailAddresses: string[] = Array.isArray(req.body?.email_addresses)
        ? req.body.email_addresses
            .filter((e: unknown) => typeof e === "string")
            .map((e: string) => e.trim())
        : [];

      const location = await db("locations").where({ id: locationId }).first();
      if (!location) {
        return res.status(404).json({ success: false, error: "location not found" });
      }
      const callerOrg = req.effectiveOrgId || req.organizationId;
      if (callerOrg && location.organization_id !== callerOrg) {
        return res.status(403).json({ success: false, error: "forbidden" });
      }

      await setLocationNotificationConfig({
        locationId,
        notificationType,
        emailAddresses,
      });

      const config = await getLocationNotificationConfig(locationId);
      return res.json({ success: true, config });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[LocationNotificationConfig] PUT failed: ${message}`,
      );
      return res.status(500).json({ success: false, error: "internal error" });
    }
  },
);

/**
 * POST /api/admin/locations/:targetLocationId/notifications/copy
 * Body: { source_location_id: number }
 * Copies all three notification_type rows from source to target.
 */
router.post(
  "/:locationId/notifications/copy",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const targetLocationId = Number(req.params.locationId);
      const sourceLocationId = Number(req.body?.source_location_id);
      if (!Number.isFinite(targetLocationId) || !Number.isFinite(sourceLocationId)) {
        return res.status(400).json({ success: false, error: "invalid params" });
      }

      // Both locations must belong to the caller's org
      const locs = await db("locations")
        .whereIn("id", [sourceLocationId, targetLocationId])
        .select("id", "organization_id");
      const callerOrg = req.effectiveOrgId || req.organizationId;
      if (locs.length !== 2) {
        return res.status(404).json({ success: false, error: "locations not found" });
      }
      if (
        callerOrg &&
        locs.some((l: any) => l.organization_id !== callerOrg)
      ) {
        return res.status(403).json({ success: false, error: "forbidden" });
      }

      const config = await copyLocationNotificationConfig({
        sourceLocationId,
        targetLocationId,
      });
      return res.json({ success: true, config });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[LocationNotificationConfig] copy failed: ${message}`,
      );
      return res.status(500).json({ success: false, error: "internal error" });
    }
  },
);

// ── Voice Constraints validation on shipped UI strings ────────────

/**
 * GET /api/admin/locations/notifications/strings
 *
 * Returns the customer-visible UI strings the frontend renders so a
 * test runner can verify checkVoice PASS on each. The settings page
 * itself does NOT render these via this endpoint — the strings are
 * inline in the React component. This endpoint exists so a single
 * backend test can iterate the entire approved string set.
 */
router.get("/notifications/strings", authenticateToken, async (_req, res) => {
  const STRINGS = await import("../../services/notifications/locationRouterStrings");
  const out: Array<{
    key: string;
    text: string;
    voice: { passed: boolean; violations: string[] };
  }> = [];
  for (const [key, text] of Object.entries(STRINGS.CARD_H_STRINGS)) {
    const v = checkVoice(text);
    out.push({
      key,
      text,
      voice: { passed: v.passed, violations: v.violations },
    });
  }
  return res.json({ success: true, strings: out });
});

export default router;
