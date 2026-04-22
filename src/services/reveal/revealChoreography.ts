import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { getMindsQueue } from "../../workers/queues";
import { calculateImpact, type ImpactEstimate } from "../economic/economicCalc";
import { composeRevealEmail } from "./emailTemplate";
import { composeRevealPostcard } from "./lobPostcardTemplate";
import { composeRevealTiles, renderRevealTiles } from "./revealDashboardCards";
import { sendRevealEmail } from "./revealEmail";
import { sendRevealPostcard } from "./revealLob";
import type {
  ComposedDashboardTiles,
  ComposedEmail,
  ComposedLobPostcard,
  OrgRevealContext,
  PracticeAddress,
  RevealInput,
  RevealMode,
  RevealResult,
} from "./types";

/**
 * Card 4: Reveal Choreography orchestrator.
 *
 * Subscribes to site.published. Fans out three operations in parallel:
 *   (a) Mailgun reveal email (target <60s)
 *   (b) Lob physical postcard
 *   (c) Dashboard reveal cards for next login
 *
 * Idempotency: (org_id + site_published_event_id) → one reveal. Second
 * trigger is a no-op with idempotent=true in the result.
 *
 * Gate Path: Shadow on arrival. When organizations.reveal_choreography_enabled
 * is false (default), the run is "dry_run": everything is composed, the voice
 * check runs, reveal_log archives the composed payload, but Mailgun and Lob
 * are NOT called. When the flag is true, the run is "live".
 *
 * External mutation boundary: only reached when mode==='live' AND the
 * respective composed artifact is valid (voice check passes, address validates).
 */

export interface LoaderDeps {
  loadOrgContext?: (orgId: number) => Promise<OrgRevealContext | null>;
  emailSender?: typeof sendRevealEmail;
  lobSender?: typeof sendRevealPostcard;
  tileRenderer?: typeof renderRevealTiles;
  impactCalculator?: (org: OrgRevealContext) => ImpactEstimate | null;
  // When provided, bypasses DB for idempotency/log. Used by tests.
  logStore?: RevealLogStore;
}

export interface RevealLogStore {
  findByIdempotencyKey(key: string): Promise<RevealLogRow | null>;
  insert(row: Omit<RevealLogRow, "id" | "created_at">): Promise<RevealLogRow>;
}

export interface RevealLogRow {
  id: string;
  org_id: number;
  site_published_event_id: string | null;
  idempotency_key: string;
  mode: RevealMode;
  email_sent_at: Date | null;
  lob_sent_at: Date | null;
  dashboard_rendered_at: Date | null;
  email_message_id: string | null;
  lob_postcard_id: string | null;
  composed_payload: unknown;
  error: string | null;
  created_at: Date;
}

function buildIdempotencyKey(orgId: number, eventId: string | null | undefined): string {
  const evt = eventId ?? "no_event_id";
  return `reveal:${orgId}:${evt}`;
}

async function defaultLoadOrgContext(orgId: number): Promise<OrgRevealContext | null> {
  const org = await db("organizations")
    .where({ id: orgId })
    .first(
      "id",
      "name",
      "patientpath_preview_url",
      "reveal_choreography_enabled",
      "created_at",
      "organization_type",
      "checkup_data"
    );
  if (!org) return null;

  // Primary user email
  const orgUser = await db("organization_users")
    .where({ organization_id: orgId })
    .orderBy("created_at", "asc")
    .first();
  let recipientEmail: string | null = null;
  let recipientName: string | null = null;
  if (orgUser) {
    const user = await db("users").where({ id: orgUser.user_id }).first("email", "first_name", "last_name");
    if (user) {
      recipientEmail = user.email ?? null;
      recipientName = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
    }
  }

  // Primary location address
  const loc = await db("locations")
    .where({ organization_id: orgId })
    .orderBy([{ column: "is_primary", order: "desc" }, { column: "id", order: "asc" }])
    .first("address", "city", "state", "zip");

  const practiceAddress: PracticeAddress | null = loc
    ? {
        line1: loc.address ?? "",
        city: loc.city ?? "",
        state: loc.state ?? "",
        zip: loc.zip ?? "",
        valid: false,
      }
    : null;

  return {
    id: org.id,
    name: org.name,
    siteUrl: org.patientpath_preview_url ?? null,
    shortSiteUrl: org.patientpath_preview_url ?? null,
    recipientEmail,
    recipientName,
    practiceAddress,
    flagEnabled: Boolean(org.reveal_choreography_enabled),
    createdAt: org.created_at ?? null,
    vertical: org.organization_type ?? null,
    hasGbpData: false,
    hasCheckupData: Boolean(org.checkup_data),
  };
}

class DbRevealLogStore implements RevealLogStore {
  async findByIdempotencyKey(key: string): Promise<RevealLogRow | null> {
    const row = await db("reveal_log")
      .where({ idempotency_key: key })
      .first();
    return (row as RevealLogRow) ?? null;
  }

  async insert(row: Omit<RevealLogRow, "id" | "created_at">): Promise<RevealLogRow> {
    const [inserted] = await db("reveal_log")
      .insert({
        org_id: row.org_id,
        site_published_event_id: row.site_published_event_id,
        idempotency_key: row.idempotency_key,
        mode: row.mode,
        email_sent_at: row.email_sent_at,
        lob_sent_at: row.lob_sent_at,
        dashboard_rendered_at: row.dashboard_rendered_at,
        email_message_id: row.email_message_id,
        lob_postcard_id: row.lob_postcard_id,
        composed_payload: JSON.stringify(row.composed_payload ?? null),
        error: row.error,
      })
      .returning("*");
    return inserted as RevealLogRow;
  }
}

function defaultImpactCalculator(org: OrgRevealContext): ImpactEstimate {
  return calculateImpact(
    "site.published",
    { eventType: "site.published" },
    {
      id: org.id,
      name: org.name,
      vertical: org.vertical,
      createdAt: org.createdAt,
      hasGbpData: org.hasGbpData,
      hasCheckupData: org.hasCheckupData,
    }
  );
}

/**
 * Main entry point: handle a site.published event for one organization.
 */
export async function runRevealChoreography(
  input: RevealInput,
  deps: LoaderDeps = {}
): Promise<RevealResult> {
  const loadOrgContext = deps.loadOrgContext ?? defaultLoadOrgContext;
  const emailSender = deps.emailSender ?? sendRevealEmail;
  const lobSender = deps.lobSender ?? sendRevealPostcard;
  const tileRenderer = deps.tileRenderer ?? renderRevealTiles;
  const impactCalculator = deps.impactCalculator ?? defaultImpactCalculator;
  const logStore = deps.logStore ?? new DbRevealLogStore();

  const idempotencyKey = buildIdempotencyKey(input.orgId, input.sitePublishedEventId ?? null);

  // Idempotency check
  const existing = await logStore.findByIdempotencyKey(idempotencyKey).catch(() => null);
  if (existing) {
    return {
      mode: existing.mode,
      idempotent: true,
      logId: existing.id,
      composed: null,
      fanOut: {
        emailSentAt: existing.email_sent_at,
        emailMessageId: existing.email_message_id,
        lobSentAt: existing.lob_sent_at,
        lobPostcardId: existing.lob_postcard_id,
        dashboardRenderedAt: existing.dashboard_rendered_at,
      },
    };
  }

  const org = await loadOrgContext(input.orgId);
  if (!org) {
    return {
      mode: "dry_run",
      idempotent: false,
      logId: null,
      composed: null,
      fanOut: emptyFanOut(),
      error: `org_not_found:${input.orgId}`,
    };
  }

  const mode: RevealMode = input.forceDryRun
    ? "dry_run"
    : org.flagEnabled
      ? "live"
      : "dry_run";

  // Impact estimate from Economic Calc Service (Card 3 dependency)
  let impact: ImpactEstimate | null = null;
  try {
    impact = impactCalculator(org);
  } catch {
    impact = null;
  }

  // Compose everything up-front (both modes share the composition path)
  const composedEmail: ComposedEmail = composeRevealEmail(org, impact);
  const composedLob: ComposedLobPostcard = composeRevealPostcard(org);
  const composedTiles: ComposedDashboardTiles = composeRevealTiles(org, impact);

  // Freeform Concern Gate — score the composed email + postcard against The
  // Standard BEFORE send. Shadow mode (flag off) records the score but never
  // alters dispatch. Live mode force-skips dispatch when the gate blocks.
  const concernOutcome = await scoreRevealWithFreeformConcernGate(
    org.id,
    composedEmail,
    composedLob
  );
  const concernBlocksEmail = concernOutcome.email?.blocked ?? false;
  const concernBlocksLob = concernOutcome.lob?.blocked ?? false;
  const emailDispatchMode: RevealMode = concernBlocksEmail ? "dry_run" : mode;
  const lobDispatchMode: RevealMode = concernBlocksLob ? "dry_run" : mode;

  // Fan-out in parallel
  const [emailResult, lobResult, dashboardResult] = await Promise.all([
    emailSender(org, composedEmail, emailDispatchMode),
    lobSender(composedLob, lobDispatchMode),
    tileRenderer(org, composedTiles, mode),
  ]);

  const errors: string[] = [];
  if (emailResult.error && !emailResult.skipped) errors.push(`email:${emailResult.error}`);
  if (lobResult.error && !lobResult.skipped) errors.push(`lob:${lobResult.error}`);

  const payload = {
    email: {
      subject: composedEmail.subject,
      bodyText: composedEmail.bodyText,
      voiceCheck: composedEmail.voiceCheck,
    },
    lob: {
      to: composedLob.to,
      description: composedLob.description,
      addressValid: composedLob.addressValid,
    },
    tiles: composedTiles,
    impact,
  };

  // Archive to reveal_log
  let logId: string | null = null;
  try {
    const inserted = await logStore.insert({
      org_id: org.id,
      site_published_event_id: input.sitePublishedEventId ?? null,
      idempotency_key: idempotencyKey,
      mode,
      email_sent_at: emailResult.sentAt,
      lob_sent_at: lobResult.sentAt,
      dashboard_rendered_at: dashboardResult.renderedAt,
      email_message_id: emailResult.messageId,
      lob_postcard_id: lobResult.postcardId,
      composed_payload: payload,
      error: errors.length > 0 ? errors.join(" | ") : null,
    });
    logId = inserted.id;
  } catch (err: any) {
    errors.push(`log_insert:${err?.message ?? "unknown"}`);
  }

  // Emit a behavioral_event so the Narrator (Card 3) can observe the reveal.
  BehavioralEventModel.create({
    event_type: "reveal.choreography_run",
    org_id: org.id,
    properties: {
      mode,
      site_published_event_id: input.sitePublishedEventId ?? null,
      idempotency_key: idempotencyKey,
      email_sent: emailResult.sent,
      email_skipped: emailResult.skipped ?? null,
      lob_sent: lobResult.sent,
      lob_skipped: lobResult.skipped ?? null,
      dashboard_rendered: dashboardResult.rendered,
      address_valid: composedLob.addressValid,
      voice_check_passed: composedEmail.voiceCheck.passed,
      voice_violations: composedEmail.voiceCheck.violations,
      concern_gate_email_composite: concernOutcome.email?.composite ?? null,
      concern_gate_email_blocked: concernBlocksEmail,
      concern_gate_lob_composite: concernOutcome.lob?.composite ?? null,
      concern_gate_lob_blocked: concernBlocksLob,
    },
  }).catch(() => {});

  return {
    mode,
    idempotent: false,
    logId,
    composed: {
      email: composedEmail,
      lob: composedLob,
      dashboard: composedTiles,
    },
    fanOut: {
      emailSentAt: emailResult.sentAt,
      emailMessageId: emailResult.messageId,
      lobSentAt: lobResult.sentAt,
      lobPostcardId: lobResult.postcardId,
      dashboardRenderedAt: dashboardResult.renderedAt,
    },
    error: errors.length > 0 ? errors.join(" | ") : undefined,
  };
}

function emptyFanOut() {
  return {
    emailSentAt: null,
    emailMessageId: null,
    lobSentAt: null,
    lobPostcardId: null,
    dashboardRenderedAt: null,
  };
}

interface ConcernGateOutcome {
  composite: number | null;
  blocked: boolean;
}

interface RevealConcernOutcome {
  email: ConcernGateOutcome | null;
  lob: ConcernGateOutcome | null;
}

/**
 * Score the composed email body and postcard description against The
 * Standard BEFORE dispatch. Shadow (flag off) records composite but never
 * blocks. Live mode returns blocked=true so the caller downgrades that
 * channel to dry_run.
 */
async function scoreRevealWithFreeformConcernGate(
  orgId: number,
  email: ComposedEmail,
  lob: ComposedLobPostcard
): Promise<RevealConcernOutcome> {
  try {
    const { runFreeformConcernGate } = await import(
      "../siteQa/gates/freeformConcernGate"
    );
    const emailText = `${email.subject}\n\n${email.bodyText}`;
    const lobText = lob.description ?? "";

    const [emailResult, lobResult] = await Promise.all([
      emailText.trim().length > 0
        ? runFreeformConcernGate({
            content: emailText,
            orgId,
            surface: "revealEmail",
          })
        : null,
      lobText.trim().length > 0
        ? runFreeformConcernGate({
            content: lobText,
            orgId,
            surface: "revealLob",
          })
        : null,
    ]);

    return {
      email: emailResult
        ? { composite: emailResult.score.composite, blocked: emailResult.blocked }
        : null,
      lob: lobResult
        ? { composite: lobResult.score.composite, blocked: lobResult.blocked }
        : null,
    };
  } catch {
    return { email: null, lob: null };
  }
}

// Re-export for convenience
export { buildIdempotencyKey };

export const REVEAL_QUEUE_NAME = "reveal-choreography";

/**
 * Enqueue a reveal job onto the `minds-reveal-choreography` queue.
 * Upstream callers (e.g. the PatientPath adapter after emitting site.published)
 * call this to dispatch the reveal. Safe to call many times for the same
 * (orgId, eventId) — the worker enforces idempotency via reveal_log.
 */
export async function enqueueReveal(
  orgId: number,
  sitePublishedEventId?: string | null,
  opts: { forceDryRun?: boolean } = {}
): Promise<void> {
  const queue = getMindsQueue(REVEAL_QUEUE_NAME);
  await queue.add(
    "reveal",
    { orgId, sitePublishedEventId: sitePublishedEventId ?? null, forceDryRun: opts.forceDryRun ?? false },
    {
      jobId: `reveal:${orgId}:${sitePublishedEventId ?? "no_event_id"}`,
      removeOnComplete: 500,
      removeOnFail: 100,
    }
  );
}

/**
 * Sweep for any site.published events in the last `lookbackMinutes` that do
 * not have a matching reveal_log row, and enqueue a reveal for each. Used as
 * a backfill/recovery mechanism so a missed enqueue from the upstream
 * publisher does not permanently skip the reveal moment.
 */
export async function sweepPendingSitePublished(
  lookbackMinutes = 60
): Promise<{ enqueued: number; skipped: number }> {
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const events = await db("behavioral_events")
    .where({ event_type: "site.published" })
    .andWhere("created_at", ">=", since)
    .select("id", "org_id", "properties");

  let enqueued = 0;
  let skipped = 0;

  for (const row of events) {
    if (!row.org_id) {
      skipped += 1;
      continue;
    }
    const key = buildIdempotencyKey(row.org_id, row.id);
    const existing = await db("reveal_log")
      .where({ idempotency_key: key })
      .first("id");
    if (existing) {
      skipped += 1;
      continue;
    }
    await enqueueReveal(row.org_id, row.id);
    enqueued += 1;
  }

  return { enqueued, skipped };
}
