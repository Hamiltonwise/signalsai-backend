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
  practiceName: string;
  trackingUrl: string; // Our redirect URL that marks click, then forwards to Google
}

export async function sendReviewRequestEmail(data: ReviewRequestEmailData) {
  const greeting = data.recipientName
    ? `Hi ${data.recipientName},`
    : "Hi there,";

  const content = `
    <div style="padding: 40px 0 20px;">
      <p style="font-size: 16px; color: ${BRAND_COLORS.navy}; line-height: 1.6; margin: 0 0 20px;">
        ${greeting}
      </p>
      <p style="font-size: 16px; color: ${BRAND_COLORS.navy}; line-height: 1.6; margin: 0 0 24px;">
        Thank you for choosing <strong>${data.practiceName}</strong>. Your feedback helps other patients find quality care.
      </p>
      <p style="font-size: 16px; color: ${BRAND_COLORS.navy}; line-height: 1.6; margin: 0 0 32px;">
        Would you take 30 seconds to share your experience?
      </p>
      <div style="text-align: center; margin: 0 0 32px;">
        ${createButton("Leave a Review", data.trackingUrl)}
      </div>
      <p style="font-size: 13px; color: ${BRAND_COLORS.mediumGray}; line-height: 1.5; margin: 0;">
        One tap opens Google Reviews. It takes less than a minute and makes a real difference.
      </p>
    </div>
    <div style="padding: 24px 0; border-top: 1px solid ${BRAND_COLORS.border};">
      <p style="font-size: 13px; color: ${BRAND_COLORS.mediumGray}; margin: 0;">
        — The team at ${data.practiceName}
      </p>
    </div>
  `;

  const subject = `How was your visit to ${data.practiceName}?`;
  const preheader = `Your feedback helps others find quality care. One tap to leave a review.`;

  return sendEmail({
    subject,
    body: wrapInBaseTemplate(content, { preheader, showFooterLinks: false }),
    recipients: [data.recipientEmail],
  });
}
