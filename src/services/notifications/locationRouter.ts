/**
 * Card H — Per-Location Notification Routing helper (May 4 2026).
 *
 * One function: resolveNotificationRecipients. Reads
 * location_notification_config for the (location_id, notification_type)
 * pair. When configured, returns those addresses. When not, returns the
 * caller's fallbackRecipients and emits a behavioral_event so the
 * Settings UI can surface "no per-location config" to the practice
 * admin.
 *
 * Three notification types supported (matches Card H spec):
 *   form_submission | referral_received | review_alert
 *
 * The helper is read-only; it never mutates state beyond the
 * behavioral_events insert. Callers handle the actual email send.
 */

import { db } from "../../database/connection";

export type LocationNotificationType =
  | "form_submission"
  | "referral_received"
  | "review_alert";

export interface ResolveRecipientsInput {
  locationId: number | null | undefined;
  notificationType: LocationNotificationType;
  /** Practice-level fallback. Used when no per-location config exists. */
  fallbackRecipients: string[];
  /** Optional org id for behavioral_event scoping when config is missing. */
  practiceId?: number | null;
}

export interface ResolveRecipientsResult {
  recipients: string[];
  /** True when the helper fell back to fallbackRecipients (no per-location config). */
  usedFallback: boolean;
  /** True when location_id was missing entirely (caller passed null/undefined). */
  noLocation: boolean;
}

/**
 * Resolve the recipient list for one notification dispatch.
 */
export async function resolveNotificationRecipients(
  input: ResolveRecipientsInput,
): Promise<ResolveRecipientsResult> {
  const { locationId, notificationType, fallbackRecipients, practiceId } = input;

  // No location → always fall back. We still emit the behavioral event
  // so the Settings UI can surface "form/notification arrived without
  // location context — practice global list used."
  if (locationId == null) {
    await emitFallbackEvent({
      practiceId: practiceId ?? null,
      locationId: null,
      notificationType,
      reason: "no_location_id_on_dispatch",
    });
    return {
      recipients: fallbackRecipients,
      usedFallback: true,
      noLocation: true,
    };
  }

  let row: { email_addresses: string[] | null } | undefined;
  try {
    row = await db("location_notification_config")
      .where({ location_id: locationId, notification_type: notificationType })
      .first("email_addresses");
  } catch (err) {
    // Table may not exist in older sandbox snapshots; treat as fallback.
    console.warn(
      `[locationRouter] config lookup failed for location ${locationId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    row = undefined;
  }

  const configured =
    row && Array.isArray(row.email_addresses)
      ? row.email_addresses.filter((e): e is string => typeof e === "string" && e.length > 0)
      : [];

  if (configured.length === 0) {
    await emitFallbackEvent({
      practiceId: practiceId ?? null,
      locationId,
      notificationType,
      reason: "no_per_location_config",
    });
    return {
      recipients: fallbackRecipients,
      usedFallback: true,
      noLocation: false,
    };
  }

  return {
    recipients: configured,
    usedFallback: false,
    noLocation: false,
  };
}

async function emitFallbackEvent(input: {
  practiceId: number | null;
  locationId: number | null;
  notificationType: LocationNotificationType;
  reason: string;
}): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "notification_fallback_to_global",
      org_id: input.practiceId ?? null,
      properties: db.raw("?::jsonb", [
        JSON.stringify({
          practice_id: input.practiceId,
          location_id: input.locationId,
          notification_type: input.notificationType,
          reason: input.reason,
        }),
      ]),
      created_at: db.fn.now(),
    });
  } catch {
    // best effort — never block the notification dispatch on telemetry
  }
}

// ── Settings UI helpers ─────────────────────────────────────────────

export interface LocationNotificationConfigRow {
  location_id: number;
  notification_type: LocationNotificationType;
  email_addresses: string[];
}

/**
 * Read all three notification_type rows for a location. Missing rows
 * surface as empty arrays so the Settings UI can render an editable
 * placeholder.
 */
export async function getLocationNotificationConfig(
  locationId: number,
): Promise<LocationNotificationConfigRow[]> {
  const types: LocationNotificationType[] = [
    "form_submission",
    "referral_received",
    "review_alert",
  ];
  const rows = await db("location_notification_config")
    .where({ location_id: locationId })
    .select("location_id", "notification_type", "email_addresses");

  const byType = new Map<LocationNotificationType, string[]>();
  for (const r of rows) {
    if (Array.isArray(r.email_addresses)) {
      byType.set(
        r.notification_type as LocationNotificationType,
        r.email_addresses.filter(
          (e: unknown): e is string => typeof e === "string" && e.length > 0,
        ),
      );
    }
  }
  return types.map((t) => ({
    location_id: locationId,
    notification_type: t,
    email_addresses: byType.get(t) ?? [],
  }));
}

/**
 * UPSERT the email_addresses for (location_id, notification_type).
 * Empty array clears the config and forces a fallback on the next
 * dispatch.
 */
export async function setLocationNotificationConfig(input: {
  locationId: number;
  notificationType: LocationNotificationType;
  emailAddresses: string[];
}): Promise<void> {
  // Normalize: trim, lowercase, dedupe, drop empties
  const normalized = Array.from(
    new Set(
      input.emailAddresses
        .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
        .filter((e) => e.length > 0 && /@/.test(e)),
    ),
  );

  await db.raw(
    `INSERT INTO location_notification_config (location_id, notification_type, email_addresses)
     VALUES (?, ?, ?::text[])
     ON CONFLICT (location_id, notification_type)
     DO UPDATE SET email_addresses = EXCLUDED.email_addresses, updated_at = NOW()`,
    [input.locationId, input.notificationType, normalized],
  );
}

/**
 * Bulk-config: copy ALL three notification_type rows from sourceLocationId
 * to targetLocationId. UPSERTs three rows. Returns the rows written.
 */
export async function copyLocationNotificationConfig(input: {
  sourceLocationId: number;
  targetLocationId: number;
}): Promise<LocationNotificationConfigRow[]> {
  const source = await getLocationNotificationConfig(input.sourceLocationId);
  for (const row of source) {
    await setLocationNotificationConfig({
      locationId: input.targetLocationId,
      notificationType: row.notification_type,
      emailAddresses: row.email_addresses,
    });
  }
  return getLocationNotificationConfig(input.targetLocationId);
}
