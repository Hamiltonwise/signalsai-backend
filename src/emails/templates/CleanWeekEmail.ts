/**
 * Clean Week Email
 *
 * Sent on Mondays when nothing significant moved in the customer's market.
 * No ranking changes, no competitor spikes, no referral drift.
 *
 * This is the email that makes someone feel better about their life.
 * Not informed about their business. Better about their LIFE.
 * Will Guidara's unreasonable hospitality. A coffee brought without asking.
 *
 * Zero upsell. Zero action items. Pure relief.
 */

import { sendEmail } from "../emailService";
import {
  wrapInBaseTemplate,
  createButton,
  createDivider,
  BRAND_COLORS,
  APP_URL,
} from "./base";

export interface CleanWeekData {
  recipientEmail: string;
  businessName: string;
  firstName: string;
  position: number | null;
  totalCompetitors: number | null;
  city: string | null;
  archetype?: string | null;
  personalGoal?: string | null;
}

export async function sendCleanWeekEmail(data: CleanWeekData): Promise<boolean> {
  const {
    recipientEmail,
    businessName,
    firstName,
    position,
    totalCompetitors,
    city,
    archetype,
    personalGoal,
  } = data;

  const subjectLine = `${firstName}, clean week. Nothing moved against you.`;

  const rankLine = position && totalCompetitors && city
    ? `You rank #${position} of ${totalCompetitors} in ${city}. Same as last week. That is what consistency looks like.`
    : position && city
      ? `You rank #${position} in ${city}. Same as last week. That is what consistency looks like.`
      : "Your position held. Same as last week. That is what consistency looks like.";

  const content = `
    <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.orange};">Monday Brief</p>
    <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: ${BRAND_COLORS.navy};">Clean week.</h1>
    <p style="margin: 0 0 20px; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">${businessName}</p>

    ${createDivider()}

    <p style="margin: 0 0 16px; color: ${BRAND_COLORS.darkGray}; font-size: 15px; line-height: 1.6;">
      Your market held steady this week. No competitor gained ground. No referral sources went quiet. Your team served your community and your position held.
    </p>

    <p style="margin: 0 0 16px; color: ${BRAND_COLORS.darkGray}; font-size: 15px; line-height: 1.6;">
      ${rankLine}
    </p>

    <p style="margin: 0 0 24px; color: ${BRAND_COLORS.darkGray}; font-size: 15px; line-height: 1.6;">
      ${archetype === "survivor" ? "That stability is yours. You earned it." : archetype === "builder" ? "Use the calm. This is when you make moves." : personalGoal ? `Enjoy the week. Maybe use the quiet for ${personalGoal.toLowerCase().replace(/\.$/, "")}.` : "Enjoy the week."}
    </p>

    <div style="margin: 24px 0; text-align: center;">
      ${createButton("View your dashboard", `${APP_URL}/dashboard`)}
    </div>

    <p style="margin: 24px 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray}; line-height: 1.5;">
      If any of this is off, reply to this email anytime.
    </p>
    <p style="margin: 8px 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">
      Corey
    </p>
  `;

  const html = wrapInBaseTemplate(content, {
    preheader: "Your market held steady. Enjoy the week.",
  });

  const result = await sendEmail({
    subject: subjectLine,
    body: html,
    recipients: [recipientEmail],
  });

  return result.success;
}
