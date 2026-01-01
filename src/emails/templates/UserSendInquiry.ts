/**
 * User Inquiry Email Template
 *
 * Sent to admin team when a user submits an inquiry/support request.
 * Contains user information and their message.
 */

import type { UserInquiryData, SendEmailOptions } from "../types";
import { sendToAdmins } from "../emailService";
import {
  wrapInBaseTemplate,
  createButton,
  createCard,
  createTag,
  createDivider,
  BRAND_COLORS,
  APP_URL,
} from "./base";

/**
 * Build the user inquiry email content
 */
export function buildUserInquiryContent(data: UserInquiryData): string {
  const sections: string[] = [];

  // Header
  sections.push(`
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 64px; height: 64px; background-color: ${BRAND_COLORS.orange}15; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">💬</span>
      </div>
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: ${BRAND_COLORS.navy};">
        New User Inquiry
      </h1>
      <p style="margin: 0; font-size: 14px; color: ${BRAND_COLORS.mediumGray};">
        A user has submitted an inquiry that requires your attention.
      </p>
    </div>
  `);

  // User info card
  const userInfo = `
    <div style="margin-bottom: 12px;">
      ${createTag("User Info", "default")}
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid ${
          BRAND_COLORS.border
        };">
          <span style="font-size: 12px; color: ${
            BRAND_COLORS.mediumGray
          }; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Name</span>
          <p style="margin: 4px 0 0 0; font-size: 15px; font-weight: 600; color: ${
            BRAND_COLORS.navy
          };">
            ${escapeHtml(data.userName)}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid ${
          BRAND_COLORS.border
        };">
          <span style="font-size: 12px; color: ${
            BRAND_COLORS.mediumGray
          }; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Email</span>
          <p style="margin: 4px 0 0 0; font-size: 15px; font-weight: 600; color: ${
            BRAND_COLORS.navy
          };">
            <a href="mailto:${escapeHtml(data.userEmail)}" style="color: ${
    BRAND_COLORS.orange
  }; text-decoration: none;">
              ${escapeHtml(data.userEmail)}
            </a>
          </p>
        </td>
      </tr>
      ${
        data.practiceName
          ? `
      <tr>
        <td style="padding: 8px 0;">
          <span style="font-size: 12px; color: ${
            BRAND_COLORS.mediumGray
          }; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Practice</span>
          <p style="margin: 4px 0 0 0; font-size: 15px; font-weight: 600; color: ${
            BRAND_COLORS.navy
          };">
            ${escapeHtml(data.practiceName)}
          </p>
        </td>
      </tr>
      `
          : ""
      }
    </table>
  `;
  sections.push(createCard(userInfo));

  // Inquiry details
  const inquiryDetails = `
    <div style="margin-bottom: 12px;">
      ${createTag("Inquiry", "default")}
    </div>
    <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: ${
      BRAND_COLORS.navy
    };">
      ${escapeHtml(data.subject)}
    </h3>
    <div style="background-color: ${
      BRAND_COLORS.lightGray
    }; padding: 16px; border-radius: 8px; margin-top: 12px;">
      <p style="margin: 0; font-size: 14px; line-height: 1.7; color: ${
        BRAND_COLORS.darkGray
      }; white-space: pre-wrap;">
${escapeHtml(data.message)}
      </p>
    </div>
  `;
  sections.push(
    createCard(inquiryDetails, { borderColor: `${BRAND_COLORS.orange}30` })
  );

  // Divider before CTA
  sections.push(createDivider());

  // Quick actions
  sections.push(`
    <div style="text-align: center;">
      <p style="margin: 0 0 20px 0; font-size: 14px; color: ${
        BRAND_COLORS.darkGray
      };">
        Reply directly to this user or manage in admin.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
        <tr>
          <td style="padding-right: 12px;">
            ${createButton(
              "Reply to User",
              `mailto:${data.userEmail}?subject=Re: ${encodeURIComponent(
                data.subject
              )}`
            )}
          </td>
          <td>
            <a href="${APP_URL}/admin" style="display: inline-block; padding: 14px 28px; background-color: transparent; color: ${
    BRAND_COLORS.navy
  }; text-decoration: none; border: 2px solid ${
    BRAND_COLORS.border
  }; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Open Admin
            </a>
          </td>
        </tr>
      </table>
    </div>
  `);

  return sections.join("");
}

/**
 * Escape HTML special characters
 */
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

/**
 * Build the full email payload for user inquiry
 */
export function buildUserInquiryEmail(data: UserInquiryData): SendEmailOptions {
  const content = buildUserInquiryContent(data);
  const body = wrapInBaseTemplate(content, {
    preheader: `Inquiry from ${data.userName}: ${data.subject}`,
    showFooterLinks: false,
  });

  const subject = `[Alloro Inquiry] ${data.subject} - from ${data.userName}`;

  return {
    subject,
    body,
    recipients: [], // Will be populated by sendUserInquiry
    preheader: `New inquiry from ${data.userName}`,
  };
}

/**
 * Send user inquiry to admin team
 */
export async function sendUserInquiry(data: UserInquiryData) {
  const email = buildUserInquiryEmail(data);
  return sendToAdmins(email.subject, email.body);
}

export default sendUserInquiry;
