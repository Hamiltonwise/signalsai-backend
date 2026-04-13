/**
 * Email Preview Route (Admin Only)
 *
 * GET /api/admin/email-preview/monday-brief/:orgId
 * GET /api/admin/email-preview/clean-week/:orgId
 *
 * Renders the email HTML in the browser without sending.
 * Used for design QA and Known compliance testing.
 *
 * Admin-only. Never exposed to customers.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { getOzEngineResult } from "../../services/ozEngine";
import { cleanCompetitorName } from "../../utils/textCleaning";
import type { Reading, OzMomentEmail, MondayBriefData } from "../../emails/templates/MondayBriefEmail";

const emailPreviewRoutes = express.Router();

/** Strip em-dashes */
function stripEmDashes(text: string): string {
  return text.replace(/\u2014/g, ", ").replace(/\u2013/g, "-");
}

emailPreviewRoutes.get(
  "/monday-brief/:orgId",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      // Admin check
      if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
        return res.status(403).json({ success: false, error: "Admin only" });
      }

      const orgId = parseInt(req.params.orgId, 10);
      if (!orgId) return res.status(400).json({ success: false, error: "Invalid orgId" });

      const org = await db("organizations").where({ id: orgId }).first();
      if (!org) return res.status(404).json({ success: false, error: "Org not found" });

      const orgUser = await db("organization_users")
        .where({ organization_id: orgId, role: "admin" })
        .first();
      const user = orgUser ? await db("users").where({ id: orgUser.user_id }).first() : null;

      const ownerName = user
        ? [user.first_name, user.last_name].filter(Boolean).join(" ") || org.name
        : org.name || "Business Owner";
      const ownerLastName = user?.last_name || ownerName;

      // Oz Engine
      let ozMoment: OzMomentEmail | null = null;
      try {
        const result = await getOzEngineResult(orgId);
        if (result) {
          ozMoment = {
            headline: stripEmDashes(result.headline),
            context: stripEmDashes(result.context),
            status: result.status,
            verifyUrl: result.verifyUrl,
            actionText: result.actionText,
            actionUrl: result.actionUrl,
          };
        }
      } catch { /* non-blocking */ }

      // Snapshot data
      const snapshot = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "desc")
        .first();

      const clientReviews = snapshot?.client_review_count || 0;
      const compReviews = snapshot?.competitor_review_count || 0;
      const compName = cleanCompetitorName(snapshot?.competitor_name || "");

      // Build readings
      const readings: Reading[] = [];

      if (clientReviews > 0) {
        const gap = compReviews - clientReviews;
        readings.push({
          label: "Reviews",
          value: `${clientReviews}`,
          context: gap > 0 && compName
            ? `${compName} has ${compReviews}. Gap: ${gap}.`
            : compName
              ? `Leading ${compName} (${compReviews}).`
              : `${clientReviews} on Google.`,
          status: gap > 50 ? "attention" : "healthy",
          verifyUrl: org.name ? `https://www.google.com/search?q=${encodeURIComponent(org.name)}` : null,
        });
      }

      const cd = org.checkup_data
        ? (typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data)
        : null;

      const city = cd?.market?.city || null;
      const totalComp = cd?.market?.totalCompetitors || null;
      if (city && totalComp) {
        readings.push({
          label: "Your Market",
          value: `${totalComp} competitors`,
          context: `Tracked in ${city}.`,
          status: "healthy",
          verifyUrl: null,
        });
      }

      const place = cd?.place || {};
      const gbpFields = [
        !!(place.hasPhone || place.phone || place.nationalPhoneNumber),
        !!(place.hasHours || place.hours || place.regularOpeningHours),
        !!(place.hasWebsite || place.websiteUri || place.website),
        (place.photosCount || place.photoCount || 0) > 0,
        !!(place.hasEditorialSummary || place.editorialSummary),
      ];
      const gbpComplete = gbpFields.filter(Boolean).length;
      if (gbpComplete > 0) {
        const missing = 5 - gbpComplete;
        readings.push({
          label: "GBP Profile",
          value: `${gbpComplete}/5`,
          context: missing > 0 ? `${missing} field${missing !== 1 ? "s" : ""} incomplete.` : "All complete.",
          status: gbpComplete >= 5 ? "healthy" : gbpComplete >= 3 ? "attention" : "critical",
          verifyUrl: org.name ? `https://www.google.com/search?q=${encodeURIComponent(org.name)}` : null,
        });
      }

      // Build the template data without sending
      const findingHeadline = snapshot?.finding_headline || "Your market this week";
      const findingBody = snapshot?.bullets
        ? (typeof snapshot.bullets === "string" ? JSON.parse(snapshot.bullets) : snapshot.bullets).join("\n\n")
        : "Your market data is being collected.";

      // Render the HTML directly (import the template internals)
      // For preview, we construct the full data object and call the template
      // But since sendMondayBriefEmail actually sends, we need to render without sending.
      // We'll inline the template rendering here for preview purposes.

      const { BRAND_COLORS, APP_URL } = await import("../../emails/templates/base");

      // Use the same design tokens as MondayBriefEmail
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

      function statusColor(status: string): string {
        if (status === "healthy") return COLORS.statusHealthy;
        if (status === "attention") return COLORS.statusAttention;
        return COLORS.statusCritical;
      }

      // Build hero
      let heroHtml = "";
      if (ozMoment) {
        const dot = statusColor(ozMoment.status);
        const label = ozMoment.status === "healthy" ? "ALL CLEAR" : "THIS WEEK";
        heroHtml = `
          <div style="background: ${COLORS.terracottaWash}; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
            <div style="margin-bottom: 16px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${dot}; vertical-align: middle;"></span>
              <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.textTertiary}; padding-left: 8px;">${label}</span>
            </div>
            <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 600; color: ${COLORS.textPrimary}; line-height: 1.3;">${ozMoment.headline}</h1>
            <p style="margin: 0; font-size: 15px; color: ${COLORS.textSecondary}; line-height: 1.6;">${ozMoment.context}</p>
            ${ozMoment.actionText && ozMoment.actionUrl ? `<a href="${APP_URL}${ozMoment.actionUrl}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: ${COLORS.terracotta}; color: #FFF; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">${ozMoment.actionText}</a>` : ""}
            ${ozMoment.verifyUrl ? `<a href="${ozMoment.verifyUrl}" style="color: ${COLORS.terracotta}; font-size: 12px; font-weight: 600; text-decoration: none; margin-left: 16px;">Verify on Google &#8599;</a>` : ""}
          </div>
        `;
      } else {
        heroHtml = `
          <div style="background: ${COLORS.terracottaWash}; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.textTertiary};">THIS WEEK</p>
            <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 600; color: ${COLORS.textPrimary}; line-height: 1.3;">${stripEmDashes(findingHeadline)}</h1>
            <p style="margin: 0; font-size: 15px; color: ${COLORS.textSecondary}; line-height: 1.6;">${stripEmDashes(findingBody)}</p>
          </div>
        `;
      }

      // Build readings
      let readingsHtml = "";
      if (readings.length > 0) {
        const cards = readings.map(r => {
          const dot = statusColor(r.status);
          return `
            <div style="display: inline-block; width: 48%; vertical-align: top; padding: 16px; box-sizing: border-box;">
              <div style="margin-bottom: 6px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${dot}; vertical-align: middle;"></span>
                <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.textTertiary}; padding-left: 6px;">${r.label}</span>
              </div>
              <div style="font-size: 22px; font-weight: 600; color: ${COLORS.textPrimary}; line-height: 1.2;">${r.value}</div>
              <div style="font-size: 13px; color: ${COLORS.textSecondary}; margin-top: 4px;">${r.context}</div>
              ${r.verifyUrl ? `<a href="${r.verifyUrl}" style="color: ${COLORS.terracotta}; font-size: 12px; font-weight: 600; text-decoration: none;">Verify &#8599;</a>` : ""}
            </div>
          `;
        }).join("");

        readingsHtml = `
          <div style="background: ${COLORS.cardBg}; border: 1px solid ${COLORS.cardBorder}; border-radius: 16px; margin-bottom: 24px; padding: 8px;">
            ${cards}
          </div>
        `;
      }

      const firstName = ownerName.split(" ")[0] || ownerName;

      const fullHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Monday Brief Preview -- ${org.name}</title></head>
<body style="margin: 0; padding: 0; background: ${COLORS.pageBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 560px; margin: 40px auto; padding: 0 20px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://app.getalloro.com/logo.png" alt="Alloro" width="120" />
    </div>
    <div style="margin-bottom: 20px;">
      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.terracotta};">Monday Brief</p>
      <p style="margin: 0; font-size: 16px; color: ${COLORS.textSecondary};">Good morning, ${firstName}. Here's what moved in your market.</p>
    </div>
    ${heroHtml}
    ${readingsHtml}
    <div style="text-align: center; margin: 24px 0;">
      <a href="${APP_URL}/home" style="display: inline-block; padding: 14px 28px; background: ${COLORS.terracotta}; color: #FFF; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">Open your dashboard</a>
    </div>
    <div style="border-top: 1px solid ${COLORS.divider}; padding-top: 16px; margin-top: 24px;">
      <p style="font-size: 13px; color: ${COLORS.textSecondary};">If any of this is off, reply. I read every one.</p>
      <p style="font-size: 13px; font-weight: 600; color: ${COLORS.textPrimary}; margin-top: 8px;">Corey</p>
    </div>
    <div style="text-align: center; margin-top: 32px;">
      <p style="font-size: 12px; color: ${COLORS.textTertiary};">&copy; ${new Date().getFullYear()} Alloro</p>
    </div>
    <div style="margin-top: 24px; padding: 16px; background: #FEF3C7; border-radius: 8px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #92400E; font-weight: 600;">PREVIEW MODE -- This email was not sent</p>
      <p style="margin: 4px 0 0; font-size: 12px; color: #92400E;">Org: ${org.name} (ID: ${orgId}) | Oz signal: ${ozMoment ? ozMoment.status : "null"} | Readings: ${readings.length}</p>
    </div>
  </div>
</body>
</html>
      `.trim();

      res.setHeader("Content-Type", "text/html");
      return res.send(fullHtml);
    } catch (err: any) {
      console.error("[EmailPreview] Error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

export default emailPreviewRoutes;
