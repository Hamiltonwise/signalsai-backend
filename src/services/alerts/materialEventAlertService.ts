/**
 * Material Event Alert Service (Manifest v2 Card 5 Run 4).
 *
 * Subscribes to Watcher Agent signals that cross materiality thresholds and
 * triggers immediate owner delivery. This closes the gap where the owner
 * used to find out about a fresh 2-star review only on Monday's digest.
 *
 * Material event types (all thresholds config-driven via Notion page
 * "Material Event Thresholds v1"):
 *   - low_rating_review (<=2 stars in last 24h)
 *   - recognition_regression (>=10pt drop in any dimension)
 *   - competitor_overtake
 *   - gbp_critical_field_change
 *   - gbp_verification_loss
 *
 * Per-event pipeline:
 *   1. Materiality check via threshold config.
 *   2. Compose alert body via narratorService.
 *   3. Freeform Concern Gate in 'runtime' mode. Materiality means the tone
 *      must be calm, specific, action-oriented — not panicky. Threshold 80.
 *   4. Delivery gates: debounce (1 per event_type per practice per 24h),
 *      quiet hours (22:00–07:00 practice-local, configurable), batch (when
 *      multiple material events fire within 1h for the same practice, bundle
 *      into one email with a summary section).
 *   5. Dispatch via the existing reveal email stack (Card 4 infrastructure).
 *   6. Archive to material_event_alerts.
 *
 * Feature flag: material_event_alerts_enabled, per-practice, default false.
 * Shadow (flag off): composes, gates, archives with delivery_status='shadow'.
 * Mailgun is never called when shadow.
 *
 * Every alert contains: what happened, why it matters, what Alloro already
 * did (if anything), and one-click options for the owner (respond / ignore /
 * defer to digest). Respects HIPAA + CAN-SPAM / CASL per Decision Guardrails.
 */

import crypto from "crypto";
import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import {
  loadMaterialEventThresholds,
  type MaterialEventType,
  type MaterialEventThresholdsConfig,
} from "./materialEventThresholds";
import { isMaterialEventAlertsEnabled } from "../rewrite/rewriteFlag";
import {
  runFreeformConcernGate,
  FREEFORM_CONCERN_GATE_MAX_RETRIES,
} from "../siteQa/gates/freeformConcernGate";
import { processNarratorEvent } from "../narrator/narratorService";
import { sendEmail } from "../../emails/emailService";
import { wrapInBaseTemplate } from "../../emails/templates/base";

// ── Types ────────────────────────────────────────────────────────────

export interface MaterialEventPayload {
  orgId: number;
  orgName: string;
  eventType: MaterialEventType;
  occurredAt: string;
  /** Free-form data — specific to the event_type. Keys referenced in summaryTemplate. */
  data: Record<string, unknown>;
  /** Optional: source watcher_signals row IDs so alerts link back to origin. */
  sourceSignalIds?: string[];
  /** Practice IANA timezone, default UTC. */
  timezone?: string;
  /** Practice recipient. Pulled from organization_users if absent. */
  recipientEmail?: string;
}

export interface MaterialAlertResult {
  eventType: MaterialEventType;
  orgId: number;
  composed: boolean;
  sent: boolean;
  held: boolean;
  shadow: boolean;
  debounced: boolean;
  quietHoursDeferred: boolean;
  batched: boolean;
  batchId?: string;
  composite: number;
  passedGate: boolean;
  alertId: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  deliveryStatus: string;
  warnings: string[];
  oneClickActions: Array<{ label: string; action: string; href: string }>;
}

// ── Debounce / batch state ───────────────────────────────────────────

async function lastAlertWithin(
  orgId: number,
  eventType: string,
  hours: number
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const row = await db("material_event_alerts")
      .where({ practice_id: orgId, event_type: eventType })
      .where("composed_at", ">=", cutoff)
      .whereIn("delivery_status", ["sent", "batched"])
      .first("id");
    return Boolean(row);
  } catch {
    return false;
  }
}

async function findBatchCandidate(
  orgId: number,
  batchWindowMinutes: number
): Promise<string | null> {
  try {
    const cutoff = new Date(Date.now() - batchWindowMinutes * 60 * 1000);
    const row = await db("material_event_alerts")
      .where({ practice_id: orgId, delivery_status: "sent" })
      .where("composed_at", ">=", cutoff)
      .orderBy("composed_at", "desc")
      .first("id");
    return (row?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// ── Quiet hours ──────────────────────────────────────────────────────

function isInQuietHours(
  timezone: string,
  quietHoursLocal: { startHour: number; endHour: number },
  nowMs: number = Date.now()
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  });
  const parts = formatter.formatToParts(new Date(nowMs));
  const hourPart = parts.find((p) => p.type === "hour");
  const hour = hourPart ? parseInt(hourPart.value, 10) : 0;
  const { startHour, endHour } = quietHoursLocal;
  if (startHour > endHour) {
    // e.g. 22–07 → active when hour >= 22 OR hour < 7
    return hour >= startHour || hour < endHour;
  }
  return hour >= startHour && hour < endHour;
}

// ── Template substitution ────────────────────────────────────────────

function interpolate(template: string, values: Record<string, unknown>): string {
  let out = template;
  for (const [key, val] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(String(val ?? ""));
  }
  return out;
}

function buildRelativeTime(occurredIso: string): string {
  const then = new Date(occurredIso).getTime();
  const diffMs = Date.now() - then;
  if (diffMs < 60 * 60 * 1000) return "within the last hour";
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

// ── One-click action URLs ────────────────────────────────────────────

function buildOneClickActions(
  alertId: string,
  allowed: string[]
): MaterialAlertResult["oneClickActions"] {
  const base = process.env.ALLORO_ALERT_ACTION_BASE_URL ?? "https://app.getalloro.com/alerts";
  const map: Record<string, { label: string; href: string }> = {
    respond: { label: "Respond now", href: `${base}/${alertId}/respond` },
    ignore: { label: "Ignore", href: `${base}/${alertId}/ignore` },
    defer_to_digest: { label: "Defer to Monday digest", href: `${base}/${alertId}/defer` },
  };
  return allowed
    .map((a) => ({ action: a, ...map[a] }))
    .filter((a): a is { action: string; label: string; href: string } => Boolean(a.label));
}

// ── HTML body ────────────────────────────────────────────────────────

function composeAlertHtml(
  subject: string,
  whatHappened: string,
  whyItMatters: string,
  whatAlloroDid: string,
  oneClickActions: MaterialAlertResult["oneClickActions"],
  signature: string
): string {
  const actionsHtml = oneClickActions
    .map(
      (a) =>
        `<a href="${a.href}" style="display:inline-block;margin-right:8px;padding:8px 16px;background:#0b2545;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">${a.label}</a>`
    )
    .join("");

  return wrapInBaseTemplate(
    `
    <h2 style="margin:0 0 12px 0;font-size:20px;color:#0b2545;">${subject}</h2>
    <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#333;">${whatHappened}</p>
    <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#333;"><strong>Why it matters:</strong> ${whyItMatters}</p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#333;"><strong>What Alloro already did:</strong> ${whatAlloroDid}</p>
    <div style="margin:0 0 24px 0;">${actionsHtml}</div>
    <p style="margin:24px 0 0 0;font-size:13px;color:#888;">${signature}</p>
    `,
    {
      preheader: subject,
      showFooterLinks: true,
    }
  );
}

function composeAlertText(
  subject: string,
  whatHappened: string,
  whyItMatters: string,
  whatAlloroDid: string,
  oneClickActions: MaterialAlertResult["oneClickActions"],
  signature: string
): string {
  const actionList = oneClickActions.map((a) => `  • ${a.label}: ${a.href}`).join("\n");
  return [
    subject,
    "",
    whatHappened,
    "",
    `Why it matters: ${whyItMatters}`,
    `What Alloro already did: ${whatAlloroDid}`,
    "",
    "One-click options:",
    actionList,
    "",
    signature,
  ].join("\n");
}

// ── Recipient resolution ─────────────────────────────────────────────

async function resolveRecipient(
  orgId: number,
  override?: string
): Promise<string | null> {
  if (override) return override;
  try {
    const orgUser = await db("organization_users")
      .where({ organization_id: orgId })
      .orderBy("created_at", "asc")
      .first("user_id");
    if (!orgUser) return null;
    const user = await db("users").where({ id: orgUser.user_id }).first("email");
    return user?.email ?? null;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

export interface ComposeAlertOptions {
  /** Force dry-run regardless of flag; composes + archives, never sends. */
  forceDryRun?: boolean;
  /** Injected time for tests. */
  nowMs?: number;
}

export async function runMaterialEventAlert(
  payload: MaterialEventPayload,
  options: ComposeAlertOptions = {}
): Promise<MaterialAlertResult> {
  const warnings: string[] = [];
  const config = await loadMaterialEventThresholds();
  if (config.source === "fallback") {
    warnings.push("Thresholds loaded from local fallback — Notion unavailable.");
  }

  const spec = config.thresholds[payload.eventType];
  const nowMs = options.nowMs ?? Date.now();

  const baseResult: MaterialAlertResult = {
    eventType: payload.eventType,
    orgId: payload.orgId,
    composed: false,
    sent: false,
    held: false,
    shadow: false,
    debounced: false,
    quietHoursDeferred: false,
    batched: false,
    composite: 0,
    passedGate: false,
    alertId: null,
    subject: null,
    bodyText: null,
    bodyHtml: null,
    deliveryStatus: "skipped_disabled",
    warnings,
    oneClickActions: [],
  };

  if (!spec || !spec.enabled) {
    return { ...baseResult, deliveryStatus: "skipped_disabled" };
  }

  // Materiality double-check for low_rating_review (can also filter here).
  if (payload.eventType === "low_rating_review") {
    const stars = Number(payload.data?.stars ?? 0);
    const maxStars = Number(spec.maxStars ?? 2);
    if (stars > maxStars) {
      return { ...baseResult, deliveryStatus: "skipped_not_material" };
    }
  }

  const flagOn = await isMaterialEventAlertsEnabled(payload.orgId);
  const dryRun = options.forceDryRun || !flagOn;

  // Debounce
  const debounced = await lastAlertWithin(
    payload.orgId,
    payload.eventType,
    config.debounceHours
  );
  if (debounced) {
    const debouncedId = crypto.randomUUID();
    await archiveAlert(
      payload,
      spec.severity,
      null,
      null,
      null,
      null,
      [],
      "debounced",
      debouncedId
    );
    return {
      ...baseResult,
      debounced: true,
      alertId: debouncedId,
      deliveryStatus: "debounced",
    };
  }

  // Compose subject + body from template
  const relativeTime = buildRelativeTime(payload.occurredAt);
  const subjectValues: Record<string, unknown> = {
    orgName: payload.orgName,
    relativeTime,
    ...payload.data,
  };
  const subject = interpolate(spec.subjectTemplate, subjectValues);
  const whatHappened = interpolate(spec.summaryTemplate, subjectValues);

  // Run the narrator so the "why it matters" / "what Alloro did" paragraphs
  // are voice-calibrated and recipe-compliant. Failure falls back to
  // deterministic defaults so the alert still ships with tolerable tone.
  let whyItMatters = "This change affects how new patients find you right now.";
  let whatAlloroDid = "Alloro is holding your response templates ready.";
  try {
    const narratorEvent = {
      eventType: `material_event.${payload.eventType}`,
      orgId: payload.orgId,
      properties: {
        subject,
        what_happened: whatHappened,
        data: payload.data,
        severity: spec.severity,
      },
    };
    const narratorResult = await processNarratorEvent(narratorEvent);
    if (narratorResult?.output?.finding) {
      whyItMatters = narratorResult.output.finding;
    }
    if (narratorResult?.output?.action) {
      whatAlloroDid = narratorResult.output.action;
    }
  } catch {
    warnings.push("Narrator compose failed; using deterministic alert body.");
  }

  // Alert-level freeform gate. Retry with narrator until pass or blocked.
  // Because the narrator is deterministic for a given event shape, we
  // compose a single candidate and gate it; on block we downgrade to a
  // calmer template variant.
  let composite = 0;
  let passed = false;
  let blocked = false;
  const fullContent = `${subject}\n\n${whatHappened}\n\n${whyItMatters}\n\n${whatAlloroDid}`;

  const gate = await runFreeformConcernGate({
    content: fullContent,
    orgId: payload.orgId,
    surface: "revealEmail",
    metadata: {
      practice: payload.orgName,
    },
  });
  composite = gate.score.composite;
  passed = gate.passed;
  blocked = gate.blocked;

  if (blocked) {
    // Swap in a strictly factual template so the tone stays calm
    // regardless of narrator drift. The alert still ships — silence is
    // worse than a plain, accurate note.
    whyItMatters = `This is one signal worth your attention. No action required yet.`;
    whatAlloroDid = `Alloro is watching this and will roll it into Monday's digest if nothing else changes.`;
  }

  // Quiet hours: queue for 07:05 next day if inside window.
  const timezone = payload.timezone ?? "UTC";
  const quiet = isInQuietHours(timezone, config.quietHoursLocal, nowMs);

  // Alert ID is stable and used in one-click action URLs.
  const alertId = crypto.randomUUID();
  const oneClickActions = buildOneClickActions(alertId, config.emailStyle.allowedActionTypes);
  const bodyHtml = composeAlertHtml(
    subject,
    whatHappened,
    whyItMatters,
    whatAlloroDid,
    oneClickActions,
    config.emailStyle.signatureLine
  );
  const bodyText = composeAlertText(
    subject,
    whatHappened,
    whyItMatters,
    whatAlloroDid,
    oneClickActions,
    config.emailStyle.signatureLine
  );
  const contentHash = crypto.createHash("sha256").update(bodyText).digest("hex").slice(0, 16);

  // Batch: if there is a recent sent alert within the batch window, record
  // this as batched (same practice, combine semantic — the batching mail
  // runner should pick these up and send one combined email). For now we
  // archive the batching intent.
  let batched = false;
  let batchId: string | undefined;
  if (!dryRun && !quiet && passed) {
    const candidate = await findBatchCandidate(
      payload.orgId,
      config.batchWindowMinutes
    );
    if (candidate) {
      batched = true;
      batchId = candidate;
    }
  }

  const recipient = await resolveRecipient(payload.orgId, payload.recipientEmail);
  if (!recipient) {
    warnings.push("No recipient email resolved — alert composed and archived without send.");
  }

  // Decide delivery status
  let deliveryStatus: string;
  let sent = false;
  let messageId: string | null = null;
  let sentAt: Date | null = null;
  let held = false;

  if (dryRun) {
    deliveryStatus = "shadow";
  } else if (!passed && blocked) {
    deliveryStatus = "held";
    held = true;
  } else if (quiet) {
    deliveryStatus = "quiet_hours";
  } else if (batched) {
    deliveryStatus = "batched";
  } else if (!recipient) {
    deliveryStatus = "send_failed";
  } else {
    try {
      const result = await sendEmail({
        subject,
        body: bodyHtml,
        recipients: [recipient],
      });
      if (result?.success) {
        sent = true;
        messageId = result.messageId ?? null;
        sentAt = new Date();
        deliveryStatus = "sent";
      } else {
        deliveryStatus = "send_failed";
        warnings.push(`Email send failed: ${result?.error ?? "unknown"}`);
      }
    } catch (err: any) {
      deliveryStatus = "send_failed";
      warnings.push(`Email send threw: ${err?.message ?? "unknown"}`);
    }
  }

  // Archive
  const archivedId = await archiveAlert(
    payload,
    spec.severity,
    {
      composedAt: new Date().toISOString(),
      sentAt: sentAt?.toISOString() ?? null,
      messageId,
      subject,
      bodyText,
      bodyHtml,
      whatHappened,
      whyItMatters,
      whatAlloroDid,
    },
    { composite, passed, blocked, attempts: 1 },
    contentHash,
    null,
    payload.sourceSignalIds ?? [],
    deliveryStatus,
    alertId
  );

  await BehavioralEventModel.create({
    event_type: "material_event_alert.processed",
    org_id: payload.orgId,
    properties: {
      alert_id: alertId,
      event_type: payload.eventType,
      delivery_status: deliveryStatus,
      composite,
      passed_gate: passed,
      quiet_hours_deferred: quiet,
      shadow: dryRun,
      debounced: false,
      batched,
    },
  }).catch(() => {});

  return {
    eventType: payload.eventType,
    orgId: payload.orgId,
    composed: true,
    sent,
    held,
    shadow: dryRun,
    debounced: false,
    quietHoursDeferred: quiet,
    batched,
    batchId,
    composite,
    passedGate: passed,
    alertId: archivedId ?? alertId,
    subject,
    bodyText,
    bodyHtml,
    deliveryStatus,
    warnings,
    oneClickActions,
  };
}

async function archiveAlert(
  payload: MaterialEventPayload,
  severity: string,
  composed: {
    composedAt: string;
    sentAt: string | null;
    messageId: string | null;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    whatHappened: string;
    whyItMatters: string;
    whatAlloroDid: string;
  } | null,
  gateResult: {
    composite: number;
    passed: boolean;
    blocked: boolean;
    attempts: number;
  } | null,
  contentHash: string | null,
  narratorVersionId: string | null,
  sourceSignalIds: string[],
  deliveryStatus: string,
  alertId: string
): Promise<string | null> {
  try {
    const [row] = await db("material_event_alerts")
      .insert({
        id: alertId,
        practice_id: payload.orgId,
        event_type: payload.eventType,
        severity,
        composed_at: composed?.composedAt ?? new Date().toISOString(),
        sent_at: composed?.sentAt ?? null,
        gate_result: gateResult ? JSON.stringify(gateResult) : null,
        narrator_version_id: narratorVersionId,
        content_hash: contentHash,
        content_json: composed ? JSON.stringify(composed) : null,
        delivery_status: deliveryStatus,
        message_id: composed?.messageId ?? null,
        source_signals: JSON.stringify(sourceSignalIds),
      })
      .returning("id");
    return (row?.id as string | undefined) ?? alertId;
  } catch {
    return alertId;
  }
}

// ── Watcher signal → alert bridge ────────────────────────────────────

/**
 * Consume a watcher_signal row and, when it corresponds to a material
 * event, dispatch an alert. Returns null when the signal is non-material.
 * Wire into the watcher_signal.detected event stream (downstream queue
 * subscription will call this).
 */
export async function bridgeWatcherSignalToAlert(signal: {
  org_id: number;
  org_name?: string;
  signal_type: string;
  data?: Record<string, unknown>;
  detected_at?: string;
  id?: string;
}): Promise<MaterialAlertResult | null> {
  const mapped = mapSignalToEventType(signal.signal_type, signal.data ?? {});
  if (!mapped) return null;

  return runMaterialEventAlert({
    orgId: signal.org_id,
    orgName: signal.org_name ?? `Org ${signal.org_id}`,
    eventType: mapped.eventType,
    occurredAt: signal.detected_at ?? new Date().toISOString(),
    data: { ...signal.data, ...mapped.extraData },
    sourceSignalIds: signal.id ? [signal.id] : [],
  });
}

function mapSignalToEventType(
  signalType: string,
  data: Record<string, unknown>
): { eventType: MaterialEventType; extraData: Record<string, unknown> } | null {
  if (signalType === "recognition_score_regression") {
    return {
      eventType: "recognition_regression",
      extraData: {
        dimension: data.dimension ?? "composite",
        prior: data.prior ?? "(unknown)",
        current: data.current ?? "(unknown)",
        dropPoints: typeof data.delta === "number" ? Math.abs(data.delta) : "(unknown)",
        drivers: data.drivers ?? "your Watcher signals this week",
      },
    };
  }
  if (signalType === "competitor_activity" && data.overtake) {
    return {
      eventType: "competitor_overtake",
      extraData: {
        competitorName: data.competitorName ?? "A competitor",
        ranking: data.ranking ?? "local pack",
      },
    };
  }
  // Watcher doesn't currently emit gbp_critical_field_change or verification
  // loss as signal_type — those need direct dispatch via runMaterialEventAlert.
  return null;
}

export type { MaterialEventType };
