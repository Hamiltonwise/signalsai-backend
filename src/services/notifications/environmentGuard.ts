/**
 * Card I — Environment-gated notification router (May 4 2026).
 *
 * Wraps notification dispatches so non-production traffic always lands
 * at test-notifications@getalloro.com regardless of caller-provided
 * addresses. Production traffic passes through unchanged. Every
 * non-production routing logs a behavioral_event so the
 * #alloro-dev hygiene scan can reconcile.
 *
 * The guard is environment-aware via process.env.NODE_ENV:
 *   'production'   → original addresses
 *   anything else  → ['test-notifications@getalloro.com']
 *
 * Callers wrap their existing email-send pattern by calling
 *   const safe = await guardRecipients(originalAddresses, { practiceId, notificationType, channel });
 * and dispatching to safe.recipients with safe.footerToAppend.
 */

import { db } from "../../database/connection";

export interface GuardInput {
  /** Practice id for telemetry. Optional. */
  practiceId?: number | null;
  /** Free-form notification kind (form_submission, review_alert, etc.). */
  notificationType?: string;
  /** Free-form channel name (mailgun, slack, etc.). */
  channel?: string;
}

export interface GuardResult {
  recipients: string[];
  /** Append this to the email body when set (non-production only). */
  footerToAppend: string | null;
  /** True if guard rerouted the dispatch. */
  redirected: boolean;
  /** The environment that resolved. */
  environment: string;
}

const TEST_INBOX = "test-notifications@getalloro.com";

/**
 * Approved Card I footer copy. Inlined here so the strings test can
 * import and validate.
 */
export const TEST_NOTIFICATION_FOOTER =
  "This is a test notification from Alloro sandbox environment. If you received this in error, contact support@getalloro.com. No customer data was affected.";

/**
 * Resolve the safe recipient list and any required footer for a
 * notification dispatch. Always returns a non-empty recipients array
 * so callers never have to special-case the redirect path.
 */
export async function guardRecipients(
  originalAddresses: string[],
  input: GuardInput = {},
): Promise<GuardResult> {
  const env = (process.env.NODE_ENV || "development").toLowerCase();
  if (env === "production") {
    return {
      recipients: originalAddresses,
      footerToAppend: null,
      redirected: false,
      environment: env,
    };
  }

  // Best-effort telemetry. Never block a dispatch on a failed insert.
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "notification_routed_to_test_inbox",
      org_id: input.practiceId ?? null,
      properties: db.raw("?::jsonb", [
        JSON.stringify({
          practice_id: input.practiceId ?? null,
          notification_type: input.notificationType ?? null,
          channel: input.channel ?? null,
          environment: env,
          original_addresses: originalAddresses,
        }),
      ]),
      created_at: db.fn.now(),
    });
  } catch {
    // best effort — never fail a dispatch on telemetry
  }

  return {
    recipients: [TEST_INBOX],
    footerToAppend: TEST_NOTIFICATION_FOOTER,
    redirected: true,
    environment: env,
  };
}

/**
 * Convenience: append the footer to an HTML body when present.
 */
export function applyFooterToHtml(htmlBody: string, footer: string | null): string {
  if (!footer) return htmlBody;
  const block = `<p style="margin-top:24px;padding:12px;border:1px dashed #d1d5db;color:#6b7280;font-size:12px;">${footer}</p>`;
  return htmlBody + block;
}
