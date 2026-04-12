/**
 * Checkup Result Email
 *
 * Sent immediately after a prospect completes the Free Referral Base Checkup
 * and submits their email at the blur gate.
 *
 * WO7: Must deliver in under 60 seconds.
 * Contains: practice name, key finding, one named competitor,
 * specific numbers (reviews count), one action. Subject uses real competitor name.
 * Signed by Corey.
 *
 * Known compliance:
 * - Known 3: No position claims, no rank numbers
 * - Known 6: No composite scores, no gauges. Raw readings only.
 * - Known 13: Warm, not clinical
 * - Known 14: Max weight semibold (600). No em-dashes. Min 12px.
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
// Template
// ---------------------------------------------------------------------------

export function buildCheckupResultContent(
  data: CheckupResultEmailData
): string {
  const sections: string[] = [];

  // Headline: practice name + city, warm and personal
  sections.push(`
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 600; color: ${BRAND_COLORS.navy};">
        Your Google Health Check
      </h1>
      <p style="margin: 0; font-size: 14px; color: ${BRAND_COLORS.mediumGray};">
        ${escapeHtml(data.practiceName)} in ${escapeHtml(data.city)}
      </p>
    </div>
  `);

  // Key finding card
  const findingContent = `
    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">
      Key Finding
    </p>
    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.darkGray};">
      ${escapeHtml(data.finding)}
    </p>
  `;
  sections.push(createCard(findingContent, { borderColor: BRAND_COLORS.orange }));

  // Market context: raw numbers, no rank position, no composite score
  // Shows review count and competitor landscape as verifiable readings
  sections.push(`
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 20px 0;">
      <tr>
        <td width="50%" style="padding: 12px; text-align: center; background-color: ${BRAND_COLORS.lightGray}; border-radius: 10px 0 0 10px;">
          <p style="margin: 0; font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">Your Reviews</p>
          <p style="margin: 4px 0 0 0; font-size: 22px; font-weight: 600; color: ${BRAND_COLORS.navy};">${data.practiceReviews}</p>
          <p style="margin: 2px 0 0 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray};">on Google</p>
        </td>
        <td width="50%" style="padding: 12px; text-align: center; background-color: ${BRAND_COLORS.lightGray}; border-radius: 0 10px 10px 0; border-left: 2px solid ${BRAND_COLORS.white};">
          ${data.topCompetitorName && data.topCompetitorReviews
            ? `
              <p style="margin: 0; font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(data.topCompetitorName)}</p>
              <p style="margin: 4px 0 0 0; font-size: 22px; font-weight: 600; color: ${BRAND_COLORS.navy};">${data.topCompetitorReviews}</p>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray};">reviews</p>
            `
            : `
              <p style="margin: 0; font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px;">Your Market</p>
              <p style="margin: 4px 0 0 0; font-size: 22px; font-weight: 600; color: ${BRAND_COLORS.navy};">${data.totalCompetitors}</p>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray};">competitors in ${escapeHtml(data.city)}</p>
            `
          }
        </td>
      </tr>
    </table>
  `);

  // CTA
  sections.push(`
    <div style="text-align: center; margin: 28px 0 24px 0;">
      <p style="margin: 0 0 16px 0; font-size: 15px; color: ${BRAND_COLORS.darkGray};">
        Want to see exactly what your readings mean and what to do about it?
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
        Corey<br>
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
