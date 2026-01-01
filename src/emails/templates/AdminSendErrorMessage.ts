/**
 * Admin Error Message Email Template
 *
 * Sent to admin team when errors occur in the system.
 * Provides error snapshots for debugging.
 */

import type { AdminErrorData, SendEmailOptions } from "../types";
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
 * Build the admin error email content
 */
export function buildAdminErrorContent(data: AdminErrorData): string {
  const sections: string[] = [];

  // Header with error icon
  sections.push(`
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="width: 64px; height: 64px; background-color: #fee2e2; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">⚠️</span>
      </div>
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #991b1b;">
        System Error Detected
      </h1>
      <p style="margin: 0; font-size: 14px; color: ${BRAND_COLORS.mediumGray};">
        An error occurred that requires attention.
      </p>
    </div>
  `);

  // Error summary card
  const errorSummary = `
    <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
      ${createTag(data.errorType, "error")}
      ${createTag(
        data.environment,
        data.environment === "production" ? "error" : "warning"
      )}
    </div>
    <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: ${
      BRAND_COLORS.navy
    };">
      Error Message
    </h3>
    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #991b1b; font-family: monospace; background-color: #fef2f2; padding: 12px; border-radius: 8px; word-break: break-word;">
      ${escapeHtml(data.errorMessage)}
    </p>
  `;
  sections.push(createCard(errorSummary, { borderColor: "#fca5a5" }));

  // Timestamp
  sections.push(`
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 16px 0;">
      <tr>
        <td style="font-size: 12px; color: ${BRAND_COLORS.mediumGray};">
          <strong>Timestamp:</strong> ${formatTimestamp(data.timestamp)}
        </td>
      </tr>
    </table>
  `);

  // Stack trace (if available)
  if (data.stackTrace) {
    const stackTraceContent = `
      <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: ${
        BRAND_COLORS.navy
      };">
        Stack Trace
      </h3>
      <pre style="margin: 0; font-size: 11px; line-height: 1.5; color: ${
        BRAND_COLORS.darkGray
      }; background-color: ${
      BRAND_COLORS.lightGray
    }; padding: 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 300px;">
${escapeHtml(data.stackTrace)}
      </pre>
    `;
    sections.push(createCard(stackTraceContent));
  }

  // Context data (if available)
  if (data.context && Object.keys(data.context).length > 0) {
    const contextContent = `
      <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: ${
        BRAND_COLORS.navy
      };">
        Context Data
      </h3>
      <pre style="margin: 0; font-size: 11px; line-height: 1.5; color: ${
        BRAND_COLORS.darkGray
      }; background-color: ${
      BRAND_COLORS.lightGray
    }; padding: 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word;">
${escapeHtml(JSON.stringify(data.context, null, 2))}
      </pre>
    `;
    sections.push(createCard(contextContent));
  }

  // Divider before CTA
  sections.push(createDivider());

  // Call to action
  sections.push(`
    <div style="text-align: center;">
      <p style="margin: 0 0 20px 0; font-size: 14px; color: ${
        BRAND_COLORS.darkGray
      };">
        View application logs for more details.
      </p>
      ${createButton("View App Logs", `${APP_URL}/admin/logs`)}
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
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return timestamp;
  }
}

/**
 * Build the full email payload for admin error notification
 */
export function buildAdminErrorEmail(data: AdminErrorData): SendEmailOptions {
  const content = buildAdminErrorContent(data);
  const body = wrapInBaseTemplate(content, {
    preheader: `[${data.environment.toUpperCase()}] ${
      data.errorType
    }: ${data.errorMessage.slice(0, 50)}...`,
    showFooterLinks: false,
  });

  const envPrefix = data.environment === "production" ? "🚨 PROD" : "⚠️ DEV";
  const subject = `[Alloro Error] ${envPrefix} - ${data.errorType}`;

  return {
    subject,
    body,
    recipients: [], // Will be populated by sendAdminError
    preheader: `Error in ${data.environment}: ${data.errorMessage.slice(
      0,
      80
    )}`,
  };
}

/**
 * Send admin error notification email
 */
export async function sendAdminError(data: AdminErrorData) {
  const email = buildAdminErrorEmail(data);
  return sendToAdmins(email.subject, email.body);
}

export default sendAdminError;
