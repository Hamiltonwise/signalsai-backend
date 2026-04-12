/**
 * Welcome Checkup Email
 *
 * Fires synchronously at account creation. No Redis, no BullMQ.
 * This is the very first email the customer receives. It must feel
 * personal, specific, and surprising. Three paragraphs max.
 *
 * Subject uses their name + business name to create curiosity.
 * Body: one finding, one number, one action.
 * Signed by Corey, matching the Monday Brief pattern.
 */

import { sendEmail } from "../emailService";
import {
  wrapInBaseTemplate,
  createButton,
  createCard,
  highlight,
  BRAND_COLORS,
  APP_URL,
} from "./base";

export interface WelcomeCheckupData {
  recipientEmail: string;
  firstName: string;
  practiceName: string;
  checkupScore: number | null;
  topFinding: string | null;
  topCompetitorName: string | null;
}

export async function sendWelcomeCheckupEmail(data: WelcomeCheckupData): Promise<boolean> {
  const {
    recipientEmail,
    firstName,
    practiceName,
    checkupScore,
    topFinding,
    topCompetitorName,
  } = data;

  const displayName = firstName || "there";
  const displayPractice = practiceName || "your business";

  // Build subject line: curiosity, not sales
  const subject = topCompetitorName
    ? `${displayName}, here's what we found about ${displayPractice}`
    : `${displayName}, your results are ready`;

  // Build the finding section
  const findingText = topFinding || "We analyzed your competitive landscape and found areas where you can stand out.";

  const scoreSection = checkupScore != null
    ? createCard(`
        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.orange};">Your Google Health Check</p>
        <p style="margin: 0; font-size: 14px; font-weight: 600; color: ${BRAND_COLORS.navy};">Your readings are ready. Log in to see how you compare.</p>
      `)
    : "";

  const competitorLine = topCompetitorName
    ? `<p style="margin: 12px 0 0; padding: 10px 14px; background: ${BRAND_COLORS.lightGray}; border-radius: 8px; font-size: 13px; color: ${BRAND_COLORS.darkGray};">Your top competitor right now: ${highlight(topCompetitorName)}</p>`
    : "";

  const content = `
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.darkGray};">
      ${displayName}, we just finished analyzing ${displayPractice}. Here is the most important thing we found:
    </p>

    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.darkGray}; font-weight: 600;">
      ${findingText}
    </p>

    ${scoreSection}
    ${competitorLine}

    <div style="margin: 24px 0; text-align: center;">
      ${createButton("See your full report", `${APP_URL}/dashboard`)}
    </div>

    <p style="margin: 16px 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray}; line-height: 1.5;">
      Your dashboard is live. Every Monday, you will get a brief with new findings, competitor moves, and one thing to act on. If anything looks off, just reply to this email.
    </p>
    <p style="margin: 8px 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">
      Corey at Alloro
    </p>
  `;

  const preheader = topCompetitorName
    ? `We found something about ${topCompetitorName} you should see.`
    : `Your competitive analysis is ready.`;

  const html = wrapInBaseTemplate(content, { preheader });

  const result = await sendEmail({
    subject,
    body: html,
    recipients: [recipientEmail],
  });

  return result.success;
}
