import { APP_URL } from "../../emails/templates/base";
import type { ComposedEmail, OrgRevealContext, VoiceCheckResult } from "./types";
import type { ImpactEstimate } from "../economic/economicCalc";

/**
 * Card 4: reveal email template.
 *
 * Voice-calibrated against the Specialist Sentiment Lattice. Recipe-compliant
 * per the Alloro Recipe (one finding, one dollar or data-gap, one action).
 * Cesar Millan: owner is the hero; Alloro is the translator.
 *
 * The body text seed is fixed per spec. Practice name and site URL substitute
 * in, and one Recipe-complete "dollar-or-gap" sentence is inserted based on
 * the Economic Calc output.
 */

const FORBIDDEN_PHRASES: string[] = [
  "launch",
  "live now",
  "we've done it",
  "weve done it",
  "we have done it",
  "best-in-class",
  "best in class",
  "state-of-the-art",
  "state of the art",
  "cutting-edge",
  "cutting edge",
  "world-class",
  "world class",
  "next-generation",
  "next generation",
  "synergy",
  "revolutionary",
  "game-changer",
  "game changer",
  "unlock your potential",
  "transform your business",
];

const FINDING_MARKER = /ready\b/i;
const ACTION_MARKERS = [/view\s+your\s+site/i, /\bopen\s+your\b/i];

function formatUsd(cents: number | null): string | null {
  if (cents == null) return null;
  const dollars = cents;
  if (dollars >= 1000) {
    return `$${Math.round(dollars / 1000)}k`;
  }
  return `$${Math.round(dollars)}`;
}

/**
 * Build the one Recipe-compliant "dollar or data-gap" sentence. Uses the
 * Economic Calc Service output: when confidence >= 80 we show a dollar
 * figure with a conservative framing; otherwise we emit a data-gap line that
 * invites the upload without fabricating a number.
 */
export function composeDollarLine(impact: ImpactEstimate | null): string {
  if (!impact || impact.dollar365d == null) {
    const gap = impact?.dataGapReason ?? "full signal not connected yet";
    return `Year-one impact will sharpen once your patient and referral data is connected (${gap}). Until then, your site earns the room to breathe.`;
  }
  const usd365 = formatUsd(impact.dollar365d);
  const usd30 = formatUsd(impact.dollar30d);
  if (!usd365 || !usd30) {
    return `Year-one impact pending full signal. Your site earns the room to breathe today.`;
  }
  return `Category-benchmark first-year lift for a practice in your position lands near ${usd365}, with roughly ${usd30} in the first thirty days. Conservative read, not a promise.`;
}

/**
 * Voice check: scans subject and body for forbidden phrases. Also checks
 * Recipe completeness (finding + dollar-or-gap + action).
 */
export function checkVoice(
  subject: string,
  bodyText: string
): VoiceCheckResult {
  const combined = `${subject}\n${bodyText}`.toLowerCase();
  const violations: string[] = [];

  for (const phrase of FORBIDDEN_PHRASES) {
    if (combined.includes(phrase.toLowerCase())) {
      violations.push(phrase);
    }
  }

  const hasFinding = FINDING_MARKER.test(bodyText);
  const hasDollarOrGap =
    /\$\d/.test(bodyText) ||
    /year-one|first-year|first year|data.*connected|signal.*connected/i.test(bodyText);
  const hasAction = ACTION_MARKERS.some((re) => re.test(bodyText));

  const complete = hasFinding && hasDollarOrGap && hasAction;

  return {
    passed: violations.length === 0 && complete,
    violations,
    recipeCompliance: {
      hasFinding,
      hasDollarOrGap,
      hasAction,
      complete,
    },
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Compose the reveal email. Returns both plain-text (Lattice-calibrated
 * canonical body) and HTML (for Mailgun delivery). Runs the voice check and
 * returns the result alongside so the caller can enforce shadow-mode failure.
 */
export function composeRevealEmail(
  org: OrgRevealContext,
  impact: ImpactEstimate | null
): ComposedEmail {
  const siteUrl = org.siteUrl ?? `${APP_URL}/dashboard`;
  const subject = `Your practice home is ready.`;

  const dollarLine = composeDollarLine(impact);

  const bodyText = [
    `Your new practice home is ready. Seven pages, written in your voice, at ${siteUrl}.`,
    `We built it while you worked. Ranked it against the three competitors your patients are actively comparing you to. Blocked the generic phrases every marketing agency uses. Your patients will not land on something that looks like AI wrote it, because it did not.`,
    dollarLine,
    `A card is on its way to your office. You will know it when you see it.`,
    `View your site: ${siteUrl}`,
    `No action required.`,
  ].join("\n\n");

  const bodyHtml = `
    <div style="max-width: 560px; margin: 0 auto; font-family: Georgia, serif; color: #1A1D23;">
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px 0;">Your practice home is ready.</h1>
      <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">
        Seven pages, written in your voice, at
        <a href="${escapeHtml(siteUrl)}" style="color: #D56753; text-decoration: underline;">${escapeHtml(siteUrl)}</a>.
      </p>
      <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">
        We built it while you worked. Ranked it against the three competitors your patients are actively comparing you to. Blocked the generic phrases every marketing agency uses. Your patients will not land on something that looks like AI wrote it, because it did not.
      </p>
      <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px 0; color: #334155;">
        ${escapeHtml(dollarLine)}
      </p>
      <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">
        A card is on its way to your office. You will know it when you see it.
      </p>
      <div style="margin: 32px 0;">
        <a href="${escapeHtml(siteUrl)}" style="display: inline-block; background: #D56753; color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 15px;">
          View your site
        </a>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 32px 0 0 0;">
        No action required.
      </p>
    </div>
  `.trim();

  const voiceCheck = checkVoice(subject, bodyText);

  return { subject, bodyText, bodyHtml, voiceCheck };
}

export const __forbiddenPhrases = FORBIDDEN_PHRASES;
