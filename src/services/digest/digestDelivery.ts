/**
 * Manifest v2 Card 5 Run 3 — Digest Delivery Infrastructure.
 *
 * Reuses Card 4 reveal email stack. Does NOT rebuild.
 * - HIPAA-safe envelope (no PHI)
 * - CAN-SPAM: physical address, unsubscribe, sender ID
 * - Scheduled: Monday 7:00 AM Pacific per practice timezone
 * - First-send eligibility: practice needs 7+ days of Watcher data
 * - Staged rollout: internal team first, then Corey enables explicitly
 *
 * Feature flag: weekly_digest_enabled (per-practice scope)
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { isEnabled } from "../featureFlags";
import { sendEmail } from "../../emails/emailService";
import { wrapInBaseTemplate, BRAND_COLORS, createCard, createDivider, createTag, highlight } from "../../emails/templates/base";
import type { DigestContent, DigestComposeResult } from "./weeklyDigestService";
import { composeWeeklyDigest } from "./weeklyDigestService";

// ── Types ────────────────────────────────────────────────────────────

export interface DigestDeliveryResult {
  orgId: number;
  orgName: string;
  composed: boolean;
  sent: boolean;
  held: boolean;
  messageId: string | null;
  error?: string;
  digestSendId: string | null;
  eligibility: "eligible" | "insufficient_data" | "flag_disabled" | "no_recipient";
}

// ── Eligibility check ────────────────────────────────────────────────

async function checkEligibility(orgId: number): Promise<{
  eligible: boolean;
  reason: DigestDeliveryResult["eligibility"];
}> {
  // Check feature flag
  const flagEnabled = await isEnabled("weekly_digest_enabled", orgId);
  if (!flagEnabled) {
    return { eligible: false, reason: "flag_disabled" };
  }

  // Check for 7+ days of Watcher data
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [signalCount] = await db("watcher_signals")
    .where({ org_id: orgId })
    .where("detected_at", "<=", sevenDaysAgo)
    .count("id as count");

  const hasEnoughData = Number(signalCount?.count ?? 0) > 0;

  // Also check if there's a recognition baseline
  const baseline = await db("recognition_baselines")
    .where({ org_id: orgId })
    .first();

  if (!hasEnoughData && !baseline) {
    return { eligible: false, reason: "insufficient_data" };
  }

  return { eligible: true, reason: "eligible" };
}

// ── Get practice recipient email ─────────────────────────────────────

async function getRecipientEmail(orgId: number): Promise<string | null> {
  try {
    // Find the admin user for this org
    const orgUser = await db("organization_users")
      .where({ organization_id: orgId, role: "admin" })
      .first("user_id");

    if (!orgUser) return null;

    const user = await db("users")
      .where({ id: orgUser.user_id })
      .first("email");

    return user?.email ?? null;
  } catch {
    return null;
  }
}

// ── Compose digest HTML ──────────────────────────────────────────────

function composeDigestHtml(content: DigestContent): string {
  const { triScore, sections, patientQuote } = content;

  // Score display
  const scoreSection = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: ${BRAND_COLORS.navy};">
      ${sections.find(s => s.id === "tri_score")?.title ?? "Your Recognition Score"}
    </h2>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td width="33%" align="center" style="padding: 8px;">
          <div style="font-size: 32px; font-weight: 700; color: ${BRAND_COLORS.navy};">
            ${triScore.seo ?? "—"}
          </div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">
            SEO ${formatChangeHtml(triScore.seoChange)}
          </div>
        </td>
        <td width="33%" align="center" style="padding: 8px;">
          <div style="font-size: 32px; font-weight: 700; color: ${BRAND_COLORS.navy};">
            ${triScore.aeo ?? "—"}
          </div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">
            AEO ${formatChangeHtml(triScore.aeoChange)}
          </div>
        </td>
        <td width="33%" align="center" style="padding: 8px;">
          <div style="font-size: 32px; font-weight: 700; color: ${BRAND_COLORS.navy};">
            ${triScore.cro ?? "—"}
          </div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">
            CRO ${formatChangeHtml(triScore.croChange)}
          </div>
        </td>
      </tr>
    </table>
    ${triScore.composite != null ? `
    <div style="margin-top: 16px; text-align: center;">
      ${createTag(`Composite: ${triScore.composite}`, triScore.composite >= 70 ? "success" : triScore.composite >= 40 ? "warning" : "error")}
    </div>` : ""}
  `;

  // Build section HTML (skip tri_score since we rendered it above)
  const sectionHtml = sections
    .filter(s => s.id !== "tri_score")
    .map(section => {
      const bodyHtml = section.body
        .split("\n")
        .map(line => {
          if (line.startsWith("• ")) {
            return `<li style="margin-bottom: 6px; font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.darkGray};">${line.slice(2)}</li>`;
          }
          return `<p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.darkGray};">${line}</p>`;
        })
        .join("");

      const hasListItems = section.body.includes("• ");
      const bodyWrapped = hasListItems
        ? `<ul style="margin: 0; padding-left: 20px;">${bodyHtml}</ul>`
        : bodyHtml;

      return `
        ${createDivider()}
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: ${BRAND_COLORS.navy};">
          ${section.title}
        </h3>
        ${section.id === "patient_quote" && patientQuote
          ? createCard(`
              <p style="margin: 0; font-size: 15px; font-style: italic; color: ${BRAND_COLORS.darkGray}; line-height: 1.6;">
                "${patientQuote.text}"
              </p>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">
                — ${patientQuote.firstName}, ${patientQuote.rating}★
              </p>
            `)
          : bodyWrapped
        }
      `;
    })
    .join("");

  const innerHtml = `
    <p style="margin: 0 0 8px 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">
      Weekly update for ${highlight(content.orgName)}
    </p>
    ${scoreSection}
    ${sectionHtml}
    ${createDivider()}
    <p style="margin: 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray}; text-align: center;">
      This report was composed by Alloro and reviewed against The Standard.
      <br>No PHI is included. ${content.orgName} · <a href="mailto:info@getalloro.com" style="color: ${BRAND_COLORS.mediumGray};">Unsubscribe</a>
      <br>Alloro Inc · 123 Main St · Suite 100 · Austin, TX 78701
    </p>
  `;

  return wrapInBaseTemplate(innerHtml, {
    preheader: content.preheader,
    showFooterLinks: true,
  });
}

function formatChangeHtml(delta: number | null): string {
  if (delta == null) return "";
  if (delta > 0) return `<span style="color: #16a34a; font-weight: 600;">+${delta}</span>`;
  if (delta < 0) return `<span style="color: #dc2626; font-weight: 600;">${delta}</span>`;
  return `<span style="color: ${BRAND_COLORS.mediumGray};">=</span>`;
}

// ── Archive to digest_sends ──────────────────────────────────────────

async function archiveDigestSend(
  orgId: number,
  content: DigestContent | null,
  composeResult: DigestComposeResult,
  messageId: string | null,
  deliveryStatus: string
): Promise<string | null> {
  try {
    const [row] = await db("digest_sends")
      .insert({
        practice_id: orgId,
        composed_at: content?.composedAt ?? new Date().toISOString(),
        sent_at: deliveryStatus === "sent" ? new Date().toISOString() : null,
        rubric_score: composeResult.rubricScore,
        freeform_gate_result: JSON.stringify(composeResult.freeformGateResult),
        narrator_version_id: content?.narratorVersion ?? null,
        content_hash: content?.contentHash ?? null,
        content_json: content ? JSON.stringify(content) : null,
        delivery_status: deliveryStatus,
        message_id: messageId,
      })
      .returning("id");
    return typeof row === "string" ? row : row?.id ?? null;
  } catch {
    console.warn(`[DIGEST-DELIVERY] Failed to archive digest send for org ${orgId}`);
    return null;
  }
}

// ── Deliver single digest ────────────────────────────────────────────

export async function deliverDigest(
  orgId: number,
  overrideRecipient?: string
): Promise<DigestDeliveryResult> {
  const org = await db("organizations").where({ id: orgId }).first();
  const orgName = org?.name ?? `Practice ${orgId}`;

  // Check eligibility
  const { eligible, reason } = await checkEligibility(orgId);
  if (!eligible) {
    return {
      orgId,
      orgName,
      composed: false,
      sent: false,
      held: false,
      messageId: null,
      digestSendId: null,
      eligibility: reason,
    };
  }

  // Get recipient
  const recipient = overrideRecipient ?? (await getRecipientEmail(orgId));
  if (!recipient) {
    return {
      orgId,
      orgName,
      composed: false,
      sent: false,
      held: false,
      messageId: null,
      digestSendId: null,
      eligibility: "no_recipient",
    };
  }

  // Compose
  const composeResult = await composeWeeklyDigest(orgId);

  if (!composeResult.content) {
    const id = await archiveDigestSend(orgId, null, composeResult, null, "compose_failed");
    return {
      orgId,
      orgName,
      composed: false,
      sent: false,
      held: false,
      messageId: null,
      digestSendId: id,
      eligibility: "eligible",
      error: composeResult.error,
    };
  }

  // Held by gate
  if (composeResult.held) {
    const id = await archiveDigestSend(
      orgId,
      composeResult.content,
      composeResult,
      null,
      "held"
    );
    return {
      orgId,
      orgName,
      composed: true,
      sent: false,
      held: true,
      messageId: null,
      digestSendId: id,
      eligibility: "eligible",
      error: composeResult.error,
    };
  }

  // Compose HTML and send
  const html = composeDigestHtml(composeResult.content);
  const emailResult = await sendEmail({
    subject: composeResult.content.subject,
    body: html,
    recipients: [recipient],
  });

  const deliveryStatus = emailResult.success ? "sent" : "send_failed";
  const digestSendId = await archiveDigestSend(
    orgId,
    composeResult.content,
    composeResult,
    emailResult.messageId ?? null,
    deliveryStatus
  );

  await BehavioralEventModel.create({
    event_type: "digest.weekly_sent",
    org_id: orgId,
    properties: {
      message_id: emailResult.messageId,
      recipient,
      composite: composeResult.content.triScore.composite,
      content_hash: composeResult.content.contentHash,
      delivery_status: deliveryStatus,
    },
  }).catch(() => {});

  return {
    orgId,
    orgName,
    composed: true,
    sent: emailResult.success,
    held: false,
    messageId: emailResult.messageId ?? null,
    digestSendId,
    eligibility: "eligible",
    error: emailResult.success ? undefined : emailResult.error,
  };
}

// ── Deliver all eligible digests ─────────────────────────────────────

export async function deliverAllDigests(): Promise<{
  total: number;
  sent: number;
  held: number;
  skipped: number;
  failed: number;
  results: DigestDeliveryResult[];
}> {
  const orgs = await db("organizations")
    .where(function () {
      this.where("subscription_status", "active")
        .orWhere("subscription_status", "trial")
        .orWhere("account_type", "paying")
        .orWhere("account_type", "internal");
    })
    .whereNull("deleted_at")
    .select("id", "name");

  const results: DigestDeliveryResult[] = [];

  for (const org of orgs) {
    const result = await deliverDigest(org.id);
    results.push(result);
    console.log(
      `[DIGEST-DELIVERY] ${org.name} (${org.id}): ${result.sent ? "sent" : result.held ? "held" : result.eligibility}`
    );
  }

  return {
    total: results.length,
    sent: results.filter((r) => r.sent).length,
    held: results.filter((r) => r.held).length,
    skipped: results.filter((r) => !r.composed && !r.sent).length,
    failed: results.filter((r) => r.composed && !r.sent && !r.held).length,
    results,
  };
}
