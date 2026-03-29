/**
 * Monday Brief Email
 *
 * Weekly intelligence brief sent every Monday morning.
 * Contains: ranking position, competitor activity, dollar figure,
 * specific findings, one action. Subject uses doctor's name + finding.
 *
 * This is the recurring "how did they know that?" moment.
 * The email that makes them check Alloro before checking anything else.
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

export interface MondayBriefData {
  recipientEmail: string;
  practiceName: string;
  doctorName: string;
  doctorLastName: string;
  subjectLine: string;
  findingHeadline: string;
  findingBody: string;
  dollarFigure: number;
  actionText: string;
  rankingUpdate: string;
  competitorNote: string;
  referralLine: string | null;
}

export async function sendMondayBriefEmail(data: MondayBriefData): Promise<boolean> {
  const {
    recipientEmail,
    practiceName,
    doctorName,
    findingHeadline,
    findingBody,
    dollarFigure,
    actionText,
    rankingUpdate,
    competitorNote,
    referralLine,
  } = data;

  // Split finding body into paragraphs for clean rendering
  const paragraphs = findingBody
    .split("\n\n")
    .filter(Boolean)
    .map((p) => `<p style="margin: 0 0 12px; color: ${BRAND_COLORS.darkGray}; font-size: 15px; line-height: 1.6;">${p}</p>`)
    .join("");

  const dollarSection = dollarFigure > 0
    ? createCard(`
        <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.orange};">Estimated Monthly Impact</p>
        <p style="margin: 0; font-size: 28px; font-weight: 800; color: ${BRAND_COLORS.navy};">$${dollarFigure.toLocaleString()}</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">at risk if this trend continues</p>
      `)
    : "";

  const competitorSection = competitorNote
    ? `<p style="margin: 16px 0 0; padding: 12px 16px; background: ${BRAND_COLORS.lightGray}; border-radius: 8px; font-size: 13px; color: ${BRAND_COLORS.darkGray};">${competitorNote}</p>`
    : "";

  const referralSection = referralLine
    ? `
      ${createDivider()}
      <p style="margin: 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray}; line-height: 1.5;">${referralLine}</p>
    `
    : "";

  const content = `
    <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.orange};">Monday Brief</p>
    <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 800; color: ${BRAND_COLORS.navy};">${findingHeadline}</h1>
    <p style="margin: 0 0 20px; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">${practiceName} &middot; ${rankingUpdate}</p>

    ${createDivider()}

    ${paragraphs}

    ${competitorSection}

    ${dollarSection}

    <div style="margin: 24px 0; text-align: center;">
      ${createButton(actionText, `${APP_URL}/dashboard`)}
    </div>

    ${referralSection}

    <p style="margin: 24px 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray}; line-height: 1.5;">
      If any of this is off, reply. I read every reply personally.
    </p>
    <p style="margin: 8px 0 0; font-size: 13px; color: ${BRAND_COLORS.mediumGray};">
      Corey
    </p>
  `;

  const html = wrapInBaseTemplate(content, {
    preheader: findingHeadline,
  });

  const result = await sendEmail({
    subject: data.subjectLine,
    body: html,
    recipients: [recipientEmail],
  });

  return result.success;
}
