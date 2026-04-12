/**
 * Review Request Email — sent to patients after an appointment.
 *
 * Clean, branded, one-tap CTA to leave a Google review.
 * Tracking: the review link goes through our redirect endpoint
 * which marks the request as "clicked" before forwarding to Google.
 */

import { sendEmail } from "../emailService";
import {
  wrapInBaseTemplate,
  createButton,
  BRAND_COLORS,
} from "./base";

export interface ReviewRequestEmailData {
  recipientEmail: string;
  recipientName: string | null;
  businessName: string;
  ownerName?: string | null;
  trackingUrl: string; // Our redirect URL that marks click, then forwards to Google
}

export async function sendReviewRequestEmail(data: ReviewRequestEmailData) {
  const greeting = data.recipientName
    ? `Hi ${data.recipientName},`
    : "Hi there,";

  const senderName = data.ownerName || data.businessName;

  // Personal note format from the doctor (BrightLocal 2023: specific ask outperforms generic 4x)
  const content = `
    <div style="padding: 40px 0 20px;">
      <p style="font-size: 16px; color: ${BRAND_COLORS.navy}; line-height: 1.6; margin: 0 0 20px;">
        ${greeting}
      </p>
      <p style="font-size: 16px; color: ${BRAND_COLORS.navy}; line-height: 1.6; margin: 0 0 24px;">
        I appreciate you choosing <strong>${data.businessName}</strong>. I wanted to reach out personally because your experience matters to me.
      </p>
      <p style="font-size: 16px; color: ${BRAND_COLORS.navy}; line-height: 1.6; margin: 0 0 32px;">
        If you have a moment, a quick note about your visit would mean a lot. It helps other people in the area find us.
      </p>
      <div style="text-align: center; margin: 0 0 32px;">
        ${createButton("Share Your Experience", data.trackingUrl)}
      </div>
      <p style="font-size: 13px; color: ${BRAND_COLORS.mediumGray}; line-height: 1.5; margin: 0;">
        One tap opens Google Reviews. Takes less than a minute.
      </p>
    </div>
    <div style="padding: 24px 0; border-top: 1px solid ${BRAND_COLORS.border};">
      <p style="font-size: 13px; color: ${BRAND_COLORS.mediumGray}; margin: 0;">
        ${data.ownerName ? `${data.ownerName}, ${data.businessName}` : data.businessName}
      </p>
    </div>
  `;

  const subject = `A quick question from ${senderName}`;
  const preheader = data.recipientName
    ? `${data.recipientName}, your feedback means a lot to us.`
    : `Your feedback means a lot to us.`;

  return sendEmail({
    subject,
    body: wrapInBaseTemplate(content, { preheader, showFooterLinks: false }),
    recipients: [data.recipientEmail],
  });
}
