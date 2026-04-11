/**
 * Monday Brief Email -- Oz-First Design
 *
 * Structure follows the product's emotional sequence:
 * 1. Greeting (one line, ambient)
 * 2. Oz Moment (HERO -- the thing they didn't know)
 * 3. Readings strip (3-4 compact cards with status dots)
 * 4. Proof of work (what Alloro did this week)
 * 5. Community line + founder sign-off
 *
 * Design system: warm off-white (#F8F6F2), terracotta CTAs (#D56753),
 * status dots (emerald/amber/red), max weight semibold, min 12px.
 *
 * Known compliance:
 * - Known 3: No position claims
 * - Known 4: No fabricated dollar figures
 * - Known 5: Named competitors, specific numbers, plain English
 * - Known 6: No composite scores. Readings with links.
 * - Known 8: Email is self-contained. No "log in to see results."
 * - Known 9: Clean week handled by CleanWeekEmail.ts
 * - Known 13: Warm, not clinical. #F8F6F2 everywhere.
 * - Known 14: Terracotta for CTAs only. No em-dashes.
 */

import { sendEmail } from "../emailService";
import { APP_URL } from "./base";

// ── Design Tokens (matching product design system) ─────────────────

const COLORS = {
  pageBg: "#F8F6F2",
  cardBg: "#FFFFFF",
  cardBorder: "#E7E5E4",
  terracotta: "#D56753",
  terracottaWash: "#FDF4F2",
  navy: "#212D40",
  textPrimary: "#1A1D23",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  statusHealthy: "#10B981",
  statusAttention: "#F59E0B",
  statusCritical: "#EF4444",
  divider: "#E7E5E4",
};

const LOGO_URL = "https://app.getalloro.com/logo.png";

// ── Types ──────────────────────────────────────────────────────────

export interface Reading {
  label: string;
  value: string;
  context: string;
  status: "healthy" | "attention" | "critical";
  verifyUrl: string | null;
}

export interface OzMomentEmail {
  headline: string;
  context: string;
  status: "healthy" | "attention" | "critical";
  verifyUrl: string | null;
  actionText: string | null;
  actionUrl: string | null;
}

export interface MondayBriefData {
  recipientEmail: string;
  businessName: string;
  ownerName: string;
  ownerLastName: string;
  subjectLine: string;
  /** The Oz Moment -- the hero of the email. Null falls back to findingHeadline. */
  ozMoment: OzMomentEmail | null;
  /** Legacy fallback fields (used when Oz Engine returns null) */
  findingHeadline: string;
  findingBody: string;
  dollarFigure: number;
  actionText: string;
  rankingUpdate: string;
  competitorNote: string;
  referralLine: string | null;
  /** Compact readings for the strip */
  readings: Reading[];
  /** What Alloro did this week */
  proofOfWork?: string | null;
  founderLine?: string | null;
  communityCount?: number | null;
  /** One-tap review link for the owner to share with patients */
  reviewLink?: string | null;
  /** Review stats from last week */
  reviewStats?: {
    sent: number;
    clicked: number;
    newReviews: number;
  } | null;
  /** Pending DFY actions awaiting owner approval */
  pendingActions?: Array<{
    previewTitle: string;
    previewBody: string;
    actionType: string;
    approveUrl: string;
    rejectUrl: string;
  }> | null;
}

// ── Status dot color helper ────────────────────────────────────────

function statusColor(status: "healthy" | "attention" | "critical"): string {
  if (status === "healthy") return COLORS.statusHealthy;
  if (status === "attention") return COLORS.statusAttention;
  return COLORS.statusCritical;
}

// ── Reading card (inline table for email compatibility) ────────────

function renderReadingCard(r: Reading): string {
  const dot = statusColor(r.status);
  const verifyLink = r.verifyUrl
    ? `<a href="${r.verifyUrl}" target="_blank" style="color: ${COLORS.terracotta}; font-size: 12px; font-weight: 600; text-decoration: none;">Verify &#8599;</a>`
    : "";

  return `
    <td style="padding: 16px; vertical-align: top; width: 50%;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding-bottom: 6px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${dot}; vertical-align: middle;"></span>
            <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.textTertiary}; vertical-align: middle; padding-left: 6px;">${r.label}</span>
          </td>
        </tr>
        <tr>
          <td>
            <span style="font-size: 22px; font-weight: 600; color: ${COLORS.textPrimary}; line-height: 1.2;">${r.value}</span>
          </td>
        </tr>
        <tr>
          <td style="padding-top: 4px;">
            <span style="font-size: 13px; color: ${COLORS.textSecondary}; line-height: 1.4;">${r.context}</span>
            ${verifyLink ? `<br>${verifyLink}` : ""}
          </td>
        </tr>
      </table>
    </td>
  `;
}

// ── Main template ──────────────────────────────────────────────────

export async function sendMondayBriefEmail(data: MondayBriefData): Promise<boolean> {
  const {
    recipientEmail,
    businessName,
    ownerName,
    ozMoment,
    findingHeadline,
    findingBody,
    actionText,
    rankingUpdate,
    competitorNote,
    referralLine,
    readings,
  } = data;

  const firstName = ownerName.split(" ")[0] || ownerName;
  const currentYear = new Date().getFullYear();

  // ── Oz Moment Hero Section ─────────────────────────────────────
  let heroSection: string;

  if (ozMoment) {
    const heroDot = statusColor(ozMoment.status);
    const heroLabel = ozMoment.status === "healthy" ? "ALL CLEAR" : "THIS WEEK";
    const heroAction = ozMoment.actionText && ozMoment.actionUrl
      ? `<a href="${ozMoment.actionUrl.startsWith("http") ? ozMoment.actionUrl : APP_URL + ozMoment.actionUrl}" style="display: inline-block; padding: 12px 24px; background-color: ${COLORS.terracotta}; color: #FFFFFF; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; margin-top: 20px;">${ozMoment.actionText}</a>`
      : "";
    const heroVerify = ozMoment.verifyUrl
      ? `<a href="${ozMoment.verifyUrl}" target="_blank" style="color: ${COLORS.terracotta}; font-size: 12px; font-weight: 600; text-decoration: none; margin-left: 16px; vertical-align: middle;">Verify on Google &#8599;</a>`
      : "";

    heroSection = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.terracottaWash}; border-radius: 16px; margin-bottom: 24px;">
        <tr>
          <td style="padding: 32px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding-bottom: 16px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${heroDot}; vertical-align: middle;"></span>
                  <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.textTertiary}; vertical-align: middle; padding-left: 8px;">${heroLabel}</span>
                </td>
              </tr>
              <tr>
                <td>
                  <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 600; color: ${COLORS.textPrimary}; line-height: 1.3;">${ozMoment.headline}</h1>
                  <p style="margin: 0; font-size: 15px; color: ${COLORS.textSecondary}; line-height: 1.6;">${ozMoment.context}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-top: 8px;">
                  ${heroAction}${heroVerify}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  } else {
    // Legacy fallback: use findingHeadline/findingBody
    const paragraphs = findingBody
      .split("\n\n")
      .filter(Boolean)
      .map((p) => `<p style="margin: 0 0 12px; color: ${COLORS.textSecondary}; font-size: 15px; line-height: 1.6;">${p}</p>`)
      .join("");

    heroSection = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.terracottaWash}; border-radius: 16px; margin-bottom: 24px;">
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.textTertiary};">THIS WEEK</p>
            <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 600; color: ${COLORS.textPrimary}; line-height: 1.3;">${findingHeadline}</h1>
            ${paragraphs}
          </td>
        </tr>
      </table>
    `;
  }

  // ── Readings Strip ─────────────────────────────────────────────
  let readingsSection = "";
  if (readings.length > 0) {
    // Render in rows of 2
    const rows: string[] = [];
    for (let i = 0; i < readings.length; i += 2) {
      const left = renderReadingCard(readings[i]);
      const right = i + 1 < readings.length ? renderReadingCard(readings[i + 1]) : "<td></td>";
      rows.push(`<tr>${left}${right}</tr>`);
    }

    readingsSection = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.cardBg}; border: 1px solid ${COLORS.cardBorder}; border-radius: 16px; margin-bottom: 24px;">
        ${rows.join("")}
      </table>
    `;
  }

  // ── Proof of Work ──────────────────────────────────────────────
  const proofSection = data.proofOfWork
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; border-left: 2px solid ${COLORS.divider};">
        <tr>
          <td style="padding-left: 16px;">
            <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.terracotta};">Your Receipt</p>
            <p style="margin: 0; font-size: 13px; color: ${COLORS.textSecondary}; line-height: 1.6;">${data.proofOfWork}</p>
          </td>
        </tr>
      </table>
    `
    : "";

  // ── Competitor Note ────────────────────────────────────────────
  const competitorSection = competitorNote
    ? `<p style="margin: 0 0 16px; padding: 12px 16px; background: ${COLORS.pageBg}; border-radius: 12px; font-size: 13px; color: ${COLORS.textSecondary};">${competitorNote}</p>`
    : "";

  // ── Referral Line ──────────────────────────────────────────────
  const referralSection = referralLine
    ? `<p style="margin: 0 0 16px; font-size: 13px; color: ${COLORS.textSecondary}; line-height: 1.5;">${referralLine}</p>`
    : "";

  // ── Review Link (the one action that compounds) ────────────────
  let reviewSection = "";
  if (data.reviewLink) {
    const statsLine = data.reviewStats && data.reviewStats.sent > 0
      ? `Last week: ${data.reviewStats.sent} sent, ${data.reviewStats.clicked} clicked, ${data.reviewStats.newReviews} new review${data.reviewStats.newReviews !== 1 ? "s" : ""}.`
      : "Share it after every appointment. Alloro tracks every click and review.";

    reviewSection = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.cardBg}; border: 1px solid ${COLORS.cardBorder}; border-radius: 16px; margin-bottom: 24px;">
        <tr>
          <td style="padding: 24px;">
            <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.terracotta};">Your Review Link</p>
            <p style="margin: 0 0 12px; font-size: 14px; color: ${COLORS.textPrimary}; line-height: 1.5;">
              Text this to your last 3 patients. One tap, straight to Google reviews.
            </p>
            <div style="margin: 0 0 12px; padding: 12px 16px; background: ${COLORS.pageBg}; border-radius: 8px; text-align: center;">
              <a href="${data.reviewLink}" style="font-size: 15px; font-weight: 600; color: ${COLORS.terracotta}; text-decoration: none; word-break: break-all;">
                ${data.reviewLink}
              </a>
            </div>
            <p style="margin: 0; font-size: 13px; color: ${COLORS.textSecondary}; line-height: 1.5;">
              ${statsLine}
            </p>
          </td>
        </tr>
      </table>
    `;
  }

  // ── Pending Actions (Drafts for You) ────────────────────────────
  let pendingActionsSection = "";
  if (data.pendingActions && data.pendingActions.length > 0) {
    const actionCards = data.pendingActions.map((action) => {
      const typeLabel = action.actionType === "gbp_post"
        ? "GBP Post"
        : action.actionType === "cro_title"
          ? "SEO Title"
          : action.actionType === "cro_meta"
            ? "Meta Description"
            : "Action";

      // Truncate preview body for email (first 200 chars)
      const preview = action.previewBody.length > 200
        ? action.previewBody.slice(0, 200) + "..."
        : action.previewBody;

      return `
        <tr>
          <td style="padding: 16px; border-bottom: 1px solid ${COLORS.divider};">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td>
                  <span style="display: inline-block; padding: 2px 8px; background: ${COLORS.terracottaWash}; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.terracotta};">${typeLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top: 8px;">
                  <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: ${COLORS.textPrimary}; line-height: 1.4;">${action.previewTitle}</p>
                  <p style="margin: 0 0 12px; font-size: 13px; color: ${COLORS.textSecondary}; line-height: 1.5; white-space: pre-line;">${preview}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${action.approveUrl}" style="display: inline-block; padding: 8px 20px; background-color: ${COLORS.terracotta}; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px;">Approve</a>
                  <a href="${action.rejectUrl}" style="display: inline-block; padding: 8px 20px; color: ${COLORS.textTertiary}; text-decoration: none; font-size: 13px; margin-left: 8px;">Skip</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    }).join("");

    const actionCount = data.pendingActions.length;
    const actionLabel = actionCount === 1 ? "1 draft" : `${actionCount} drafts`;

    pendingActionsSection = `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.cardBg}; border: 1px solid ${COLORS.cardBorder}; border-radius: 16px; margin-bottom: 24px;">
        <tr>
          <td style="padding: 20px 16px 8px;">
            <p style="margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.terracotta};">Drafts for You</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: ${COLORS.textSecondary};">Alloro prepared ${actionLabel}. One tap to approve.</p>
          </td>
        </tr>
        ${actionCards}
      </table>
    `;
  }

  // ── CTA Button ─────────────────────────────────────────────────
  const ctaButton = `
    <div style="margin: 8px 0 24px; text-align: center;">
      <a href="${APP_URL}/home" style="display: inline-block; padding: 14px 28px; background-color: ${COLORS.terracotta}; color: #FFFFFF; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        ${actionText || "Open your dashboard"}
      </a>
    </div>
  `;

  // ── Community + Sign-off ───────────────────────────────────────
  const communityLine = data.communityCount && data.communityCount >= 50
    ? `You and ${data.communityCount - 1} other business owners received this brief today.`
    : "Business owners across the country received this brief today.";

  // ── Assemble Full Email ────────────────────────────────────────
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your Monday Brief</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 12px !important; }
      .content { padding: 24px 16px !important; }
      .reading-cell { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.pageBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${ozMoment ? ozMoment.headline : findingHeadline}
  </div>
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.pageBg};">
    <tr>
      <td align="center" style="padding: 40px 20px 24px;">
        <a href="${APP_URL}" target="_blank">
          <img src="${LOGO_URL}" alt="Alloro" width="120" style="display: block; height: auto;" />
        </a>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 0 20px 40px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" class="container" style="max-width: 560px; width: 100%;">

          <!-- Greeting -->
          <tr>
            <td style="padding-bottom: 20px;">
              <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.terracotta};">Monday Brief</p>
              <p style="margin: 0; font-size: 16px; color: ${COLORS.textSecondary}; line-height: 1.5;">
                Good morning, ${firstName}. Here's what moved in your market.
              </p>
            </td>
          </tr>

          <!-- Proof of Work (the receipt comes first) -->
          <tr>
            <td>${proofSection}</td>
          </tr>

          <!-- Oz Moment Hero -->
          <tr>
            <td>${heroSection}</td>
          </tr>

          <!-- Readings Strip -->
          <tr>
            <td>${readingsSection}</td>
          </tr>

          <!-- Review Link -->
          <tr>
            <td>${reviewSection}</td>
          </tr>

          <!-- Pending Actions (Drafts for You) -->
          <tr>
            <td>${pendingActionsSection}</td>
          </tr>

          <!-- Competitor Note -->
          <tr>
            <td>${competitorSection}</td>
          </tr>

          <!-- Referral Line -->
          <tr>
            <td>${referralSection}</td>
          </tr>

          <!-- CTA -->
          <tr>
            <td>${ctaButton}</td>
          </tr>

          <!-- Community + Sign-off -->
          <tr>
            <td style="padding-top: 16px; border-top: 1px solid ${COLORS.divider};">
              <p style="margin: 0 0 16px; font-size: 13px; color: ${COLORS.textTertiary}; line-height: 1.5;">
                ${communityLine}
              </p>
              <p style="margin: 0; font-size: 13px; color: ${COLORS.textSecondary}; line-height: 1.5;">
                ${data.founderLine || "If any of this is off, reply. I read every one."}
              </p>
              <p style="margin: 8px 0 0; font-size: 13px; font-weight: 600; color: ${COLORS.textPrimary};">
                Corey
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0 0 12px; font-size: 12px; color: ${COLORS.textTertiary};">
                <a href="${APP_URL}/home" style="color: ${COLORS.textTertiary}; text-decoration: none;">Dashboard</a>
                &nbsp;&nbsp;&#183;&nbsp;&nbsp;
                <a href="${APP_URL}/settings" style="color: ${COLORS.textTertiary}; text-decoration: none;">Settings</a>
                &nbsp;&nbsp;&#183;&nbsp;&nbsp;
                <a href="${APP_URL}/help" style="color: ${COLORS.textTertiary}; text-decoration: none;">Help</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: ${COLORS.textTertiary};">
                &copy; ${currentYear} Alloro. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const result = await sendEmail({
    subject: data.subjectLine,
    body: html,
    recipients: [recipientEmail],
  });

  return result.success;
}
