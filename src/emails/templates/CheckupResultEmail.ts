/**
 * Checkup Result Email
 *
 * Sent immediately after a prospect completes the Free Referral Base Checkup
 * and submits their email at the blur gate.
 *
 * WO7: Must deliver in under 60 seconds.
 * Contains: practice name, composite score, one named competitor,
 * one specific number, one action. Subject uses real competitor name.
 * Signed by Corey.
 */

import { sendEmail } from "../emailService";
import {
  wrapInBaseTemplate,
  createButton,
  createCard,
  createDivider,
  highlight,
  BRAND_COLORS,
  APP_URL,
} from "./base";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckupResultEmailData {
  recipientEmail: string;
  practiceName: string;
  city: string;
  compositeScore: number;
  topCompetitorName: string | null;
  topCompetitorReviews: number | null;
  practiceReviews: number;
  finding: string;
  rank: number;
  totalCompetitors: number;
}

// ---------------------------------------------------------------------------
// Score label (matches frontend)
// ---------------------------------------------------------------------------

function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong Position";
  if (score >= 60) return "Getting There";
  return "Room to Grow";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return BRAND_COLORS.orange;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export function buildCheckupResultContent(
  data: CheckupResultEmailData
): string {
  const scoreLabel = getScoreLabel(data.compositeScore);
  const scoreColor = getScoreColor(data.compositeScore);

  const sections: string[] = [];

  // Score circle + headline
  sections.push(`
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 100px; height: 100px; border-radius: 50%; border: 6px solid ${scoreColor}; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <div>
          <div style="font-size: 32px; font-weight: 700; color: ${BRAND_COLORS.navy}; line-height: 1;">${data.compositeScore}</div>
          <div style="font-size: 12px; font-weight: 600; color: ${scoreColor}; margin-top: 2px;">${scoreLabel}</div>
        </div>
      </div>
      <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 700; color: ${BRAND_COLORS.navy};">
        Your Checkup Results
      </h1>
      <p style="margin: 0; font-size: 14px; color: ${BRAND_COLORS.mediumGray};">
        ${escapeHtml(data.practiceName)} &middot; ${escapeHtml(data.city)}
      </p>
    </div>
  `);

  // Key finding card
  const findingContent = `
    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">
      Key Finding
    </p>
    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.darkGray};">
      ${escapeHtml(data.finding)}
    </p>
  `;
  sections.push(createCard(findingContent, { borderColor: scoreColor }));

  // Market position
  sections.push(`
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0;">
      <tr>
        <td width="50%" style="padding: 12px; text-align: center; background-color: ${BRAND_COLORS.lightGray}; border-radius: 10px 0 0 10px;">
          <p style="margin: 0; font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">Your Rank</p>
          <p style="margin: 4px 0 0 0; font-size: 22px; font-weight: 700; color: ${BRAND_COLORS.navy};">#${data.rank}</p>
          <p style="margin: 2px 0 0 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray};">of ${data.totalCompetitors} in ${escapeHtml(data.city)}</p>
        </td>
        <td width="50%" style="padding: 12px; text-align: center; background-color: ${BRAND_COLORS.lightGray}; border-radius: 0 10px 10px 0; border-left: 2px solid ${BRAND_COLORS.white};">
          <p style="margin: 0; font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">Reviews</p>
          <p style="margin: 4px 0 0 0; font-size: 22px; font-weight: 700; color: ${BRAND_COLORS.navy};">${data.practiceReviews}</p>
          ${data.topCompetitorName && data.topCompetitorReviews
            ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray};">vs ${data.topCompetitorReviews} (${escapeHtml(data.topCompetitorName)})</p>`
            : `<p style="margin: 2px 0 0 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray};">total Google reviews</p>`
          }
        </td>
      </tr>
    </table>
  `);

  // CTA
  sections.push(`
    <div style="text-align: center; margin: 28px 0 24px 0;">
      <p style="margin: 0 0 16px 0; font-size: 15px; color: ${BRAND_COLORS.darkGray};">
        Want to see exactly what's holding your score back — and how to fix it?
      </p>
      ${createButton("Talk to Us", `${APP_URL}/checkup`)}
    </div>
  `);

  sections.push(createDivider());

  // Corey sign-off
  sections.push(`
    <div style="margin-top: 4px;">
      <p style="margin: 0; font-size: 14px; line-height: 1.7; color: ${BRAND_COLORS.darkGray};">
        Your business operates on a deterministic system. Every number in this report is a lever you can pull.
      </p>
      <p style="margin: 16px 0 0 0; font-size: 14px; color: ${BRAND_COLORS.darkGray};">
        — Corey<br>
        <span style="font-size: 12px; color: ${BRAND_COLORS.mediumGray};">Founder, Alloro</span>
      </p>
    </div>
  `);

  return sections.join("");
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export async function sendCheckupResultEmail(data: CheckupResultEmailData) {
  const content = buildCheckupResultContent(data);

  // Subject uses real competitor name per WO7 spec
  const subject = data.topCompetitorName
    ? `Your readings vs ${data.topCompetitorName} in ${data.city}`
    : `Your Google Health Check is ready`;

  const body = wrapInBaseTemplate(content, {
    preheader: `${data.practiceName} -- your Google Health Check is ready. Here's what we found.`,
    showFooterLinks: false,
  });

  return sendEmail({
    subject,
    body,
    recipients: [data.recipientEmail],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}
