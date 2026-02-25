/**
 * Generic Form Submission Controller
 *
 * Handles form submissions from rendered sites at *.sites.getalloro.com.
 * Accepts dynamic field contents, resolves the project owner's email,
 * and dispatches a plain-text-style HTML email via the n8n webhook.
 */

import { Request, Response } from "express";
import { sanitize } from "./websiteContact-utils/sanitization";
import { sendEmailWebhook, WebhookError } from "./websiteContact-services/emailWebhookService";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";

const FALLBACK_RECIPIENT = "laggy80@gmail.com";

export async function handleFormSubmission(req: Request, res: Response): Promise<Response> {
  try {
    const { projectId, formName, contents } = req.body;

    if (!projectId || !formName || !contents) {
      return res
        .status(400)
        .json({ error: "projectId, formName, and contents are required" });
    }

    if (typeof contents !== "object" || Array.isArray(contents)) {
      return res
        .status(400)
        .json({ error: "contents must be a JSON object of field label/value pairs" });
    }

    // Sanitize all values
    const sanitizedFormName = sanitize(String(formName));
    const sanitizedContents: Record<string, string> = {};
    for (const [key, value] of Object.entries(contents)) {
      sanitizedContents[sanitize(String(key))] = sanitize(String(value));
    }

    // Resolve recipients from project → organization → admin users
    let recipients: string[] = [];
    try {
      const project = await ProjectModel.findById(String(projectId));
      if (project?.organization_id) {
        const orgUsers = await OrganizationUserModel.listByOrgWithUsers(project.organization_id);
        const adminEmails = orgUsers
          .filter((u) => u.role === "admin")
          .map((u) => u.email)
          .filter(Boolean);
        if (adminEmails.length > 0) {
          recipients = adminEmails;
        }
      }
    } catch (lookupErr) {
      console.error("[Form Submission] Recipient lookup failed:", lookupErr);
    }

    if (recipients.length === 0) {
      recipients = [FALLBACK_RECIPIENT];
    }

    // Build plain-text-style HTML email body
    const rows = Object.entries(sanitizedContents)
      .map(
        ([label, value]) =>
          `<tr>
            <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${label}</td>
            <td style="padding:8px 0;color:#111827;font-weight:600;">${value}</td>
          </tr>`
      )
      .join("");

    const emailBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#0e8988;color:#fff;padding:24px 32px;border-radius:16px 16px 0 0;">
      <h1 style="margin:0;font-size:22px;">New Entry From ${sanitizedFormName}</h1>
    </div>
    <div style="background:#f9fafb;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        ${rows}
      </table>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center;">Sent via ${sanitizedFormName} form</p>
  </div>`;

    const fromEmail = process.env.CONTACT_FORM_FROM || "info@getalloro.com";

    await sendEmailWebhook({
      cc: [],
      bcc: [],
      body: emailBody,
      from: fromEmail,
      subject: `New Entry From ${sanitizedFormName}`,
      fromName: "Alloro Sites",
      recipients,
    });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof WebhookError) {
      return res.status(502).json({ error: "Failed to send email" });
    }

    if (error instanceof Error && error.message === "Email service not configured") {
      return res.status(500).json({ error: "Email service not configured" });
    }

    console.error("[Form Submission] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
