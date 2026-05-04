/**
 * Generic Form Submission Controller
 *
 * Handles form submissions from rendered sites at *.sites.getalloro.com
 * and verified custom domains.
 *
 * Security layers (in order):
 * 1. Honeypot — reject if hidden field was filled
 * 2. Timestamp — reject if submitted too fast (<2s) or too stale (>1hr)
 * 3. JS challenge — verify LCG computation matches timestamp
 * 4. Basic field validation
 * 5. Origin validation — check request origin against project domains
 * 6. Payload caps — max fields, key/value length
 * 7. Sanitization — sanitize-html strips all HTML
 * 8. Content pattern scoring — reject high-score submissions
 * 9. Flood detection — IP-based + duplicate content hash
 * 10. AI content analysis — classify and flag spam/sales/malicious
 * 11. File uploads (if multipart) — upload to S3, add metadata to contents
 * 12. Persist submission
 * 13. Email (only if not flagged)
 */

import { Request, Response } from "express";
import { sanitize } from "./websiteContact-utils/sanitization";
import { sendEmailWebhook, WebhookError } from "./websiteContact-services/emailWebhookService";
import { isIpFlooding, isDuplicateContent, hashContents } from "./websiteContact-services/floodDetectionService";
import { analyzePatterns, SPAM_THRESHOLD } from "./websiteContact-services/contentPatternService";
import { analyzeContent } from "./websiteContact-services/aiContentAnalysisService";
import { getSiteUrl, sendConfirmationEmail } from "./websiteContact-services/newsletterConfirmationService";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { FormSubmissionModel, type FileValue, type FormSection, type FormContents } from "../../models/website-builder/FormSubmissionModel";
import { NewsletterSignupModel } from "../../models/website-builder/NewsletterSignupModel";
import { uploadToS3 } from "../../utils/core/s3";

const FALLBACK_RECIPIENT = "laggy80@gmail.com";

const MAX_FIELDS = 100; // Raised from 20 to support onboarding forms with many repeater fields
const MAX_KEY_LENGTH = 100;
const MAX_VALUE_LENGTH = 2000; // Raised from 500 to support longer field values
const MAX_FORM_NAME_LENGTH = 200;
const MIN_SUBMIT_TIME_MS = 2000;
const MAX_SUBMIT_TIME_MS = 3_600_000; // 1 hour

/** Silent 200 — don't reveal rejection to bots */
function silentOk(res: Response): Response {
  return res.json({ success: true });
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

/**
 * Compute the expected JS challenge value for a given timestamp.
 * Must match the client-side LCG computation.
 */
function computeJsChallenge(ts: number): number {
  let jsc = ts;
  for (let i = 0; i < 1000; i++) {
    jsc = ((jsc * 1103515245 + 12345) & 0x7fffffff);
  }
  return jsc;
}

const NEWSLETTER_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extract the first email-like value from form contents.
 */
function extractEmail(contents: Record<string, string>): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const value of Object.values(contents)) {
    if (typeof value === "string" && emailRegex.test(value.trim())) return value.trim().toLowerCase();
  }
  return null;
}

/**
 * Get a display name for the business from the project.
 */
function getBusinessName(project: any): string | undefined {
  if (project.step_gbp_scrape && typeof project.step_gbp_scrape === "object") {
    return (project.step_gbp_scrape as { name?: string }).name;
  }
  return undefined;
}

/**
 * Handle newsletter signup: debounce, upsert, send confirmation email.
 */
async function handleNewsletterSignup(
  res: Response,
  project: any,
  contents: Record<string, string>,
): Promise<Response> {
  const email = extractEmail(contents);
  if (!email) {
    return silentOk(res); // No valid email found — silent reject
  }

  // Check if already confirmed
  const existing = await NewsletterSignupModel.findByProjectAndEmail(project.id, email);
  if (existing?.confirmed_at) {
    return res.json({ success: true }); // Already subscribed
  }

  // Debounce: don't re-send if pending signup created less than 5min ago
  if (existing && !existing.confirmed_at) {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age < NEWSLETTER_DEBOUNCE_MS) {
      return res.json({ success: true }); // Recently sent, don't spam
    }
  }

  // Upsert: create or reset token
  const signup = await NewsletterSignupModel.upsert({
    project_id: project.id,
    email,
  });

  // Send branded confirmation email
  const siteUrl = getSiteUrl(project.hostname, project.custom_domain);
  const businessName = getBusinessName(project);

  try {
    await sendConfirmationEmail({
      email,
      token: signup.token,
      primaryColor: project.primary_color || "#0e8988",
      businessName,
      siteUrl,
    });
  } catch (err) {
    console.error("[Newsletter] Failed to send confirmation email:", err);
  }

  return res.json({ success: true });
}

/**
 * Upload files from multipart request to S3 and return file metadata entries
 * to merge into the contents object.
 */
async function uploadFormFiles(
  files: Express.Multer.File[],
  organizationId: number | null,
): Promise<Record<string, { url: string; name: string; type: string; s3Key: string }>> {
  const fileEntries: Record<string, { url: string; name: string; type: string; s3Key: string }> = {};

  for (const file of files) {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const orgFolder = organizationId ? String(organizationId) : "unknown";
    const s3Key = `form-uploads/${orgFolder}/${timestamp}-${safeName}`;

    await uploadToS3(s3Key, file.buffer, file.mimetype);

    // Use the original filename as the content key (e.g., "practice_logo.png")
    const label = `File: ${file.originalname}`;
    fileEntries[label] = {
      url: "", // Will be resolved via pre-signed URL at read time
      name: file.originalname,
      type: file.mimetype,
      s3Key,
    };
  }

  return fileEntries;
}

export async function handleFormSubmission(req: Request, res: Response): Promise<Response> {
  try {
    const { hostname, formName, formType, _hp, _ts, _jsc } = req.body;
    let { projectId, contents } = req.body;

    // ── Multipart support: contents may be a JSON string ──
    if (typeof contents === "string") {
      try {
        contents = JSON.parse(contents);
      } catch {
        return res.status(400).json({ error: "contents must be valid JSON" });
      }
    }

    // ── 1. Honeypot ──
    if (_hp) {
      return silentOk(res);
    }

    // ── 2. Timestamp / timing check (skip if not provided — multipart onboarding forms) ──
    if (_ts) {
      const ts = Number(_ts);
      if (isNaN(ts)) {
        return res.status(400).json({ error: "Invalid request" });
      }
      const elapsed = Date.now() - ts;
      if (elapsed < MIN_SUBMIT_TIME_MS || elapsed > MAX_SUBMIT_TIME_MS) {
        return silentOk(res);
      }

      // ── 3. JS challenge verification ──
      const jsc = Number(_jsc);
      if (!_jsc || isNaN(jsc) || jsc !== computeJsChallenge(ts)) {
        return silentOk(res);
      }
    }

    // ── 4. Resolve project: by projectId or hostname ──
    const senderIp = extractClientIp(req);

    let project;
    if (projectId) {
      project = await ProjectModel.findById(String(projectId));
    } else if (hostname) {
      project = await ProjectModel.findByHostnameOrDomain(String(hostname));
      if (project) {
        projectId = project.id;
      }
    }

    if (!projectId || !formName || !contents) {
      return res
        .status(400)
        .json({ error: "projectId (or hostname), formName, and contents are required" });
    }

    if (!project) {
      return silentOk(res);
    }

    // Contents can be a flat object (legacy contact forms) or sections array (onboarding)
    const isSectionsFormat = Array.isArray(contents);

    if (typeof contents !== "object") {
      return res
        .status(400)
        .json({ error: "contents must be a JSON object or sections array" });
    }

    // ── 5. Origin validation ──
    const origin = req.headers.origin || req.headers.referer;
    if (origin) {
      const allowedOrigins: string[] = [];
      if (project.hostname) {
        allowedOrigins.push(`https://${project.hostname}.sites.getalloro.com`);
      }
      if (project.custom_domain) {
        allowedOrigins.push(`https://${project.custom_domain}`);
        allowedOrigins.push(`http://${project.custom_domain}`);
      }
      // Allow localhost in development
      if (process.env.NODE_ENV !== "production") {
        allowedOrigins.push("http://localhost");
        allowedOrigins.push("http://sites.localhost");
      }

      const originLower = origin.toLowerCase();
      const matched = allowedOrigins.some((allowed) =>
        originLower.startsWith(allowed.toLowerCase()),
      );
      if (!matched) {
        return silentOk(res);
      }
    }
    // If no origin/referer header, skip check (privacy tools strip them)

    // ── 6. Sanitize form name ──
    const sanitizedFormName = sanitize(String(formName));
    if (sanitizedFormName.length > MAX_FORM_NAME_LENGTH) {
      return res.status(400).json({ error: `Form name too long (max ${MAX_FORM_NAME_LENGTH} chars)` });
    }

    // Trusted form types skip spam scoring and AI analysis
    const isTrustedFormType = formType === "onboarding";

    // ── 7. Process contents based on format ──
    let finalContents: FormContents;
    let textContents: Record<string, string> = {}; // Flat text for spam scoring / email (legacy only)

    if (isSectionsFormat) {
      // Sections array format — sanitize all text values within sections
      const sanitizedSections: FormSection[] = (contents as FormSection[]).map((section: FormSection) => ({
        title: sanitize(section.title || ""),
        fields: section.fields.map(([key, value]) => [
          sanitize(String(key)),
          typeof value === "string" ? sanitize(value) : value,
        ] as [string, string | FileValue]),
      }));
      finalContents = sanitizedSections;

      // Extract flat text for duplicate detection hash
      for (const section of sanitizedSections) {
        for (const [key, value] of section.fields) {
          if (typeof value === "string") {
            textContents[`${section.title} - ${key}`] = value;
          }
        }
      }
    } else {
      // Legacy flat object format — payload caps + sanitize
      const fieldKeys = Object.keys(contents);
      if (fieldKeys.length > MAX_FIELDS) {
        return res.status(400).json({ error: `Too many fields (max ${MAX_FIELDS})` });
      }

      for (const [key, value] of Object.entries(contents)) {
        if (String(key).length > MAX_KEY_LENGTH) {
          return res.status(400).json({ error: `Field name too long (max ${MAX_KEY_LENGTH} chars)` });
        }
        if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
          return res.status(400).json({ error: `Field value too long (max ${MAX_VALUE_LENGTH} chars)` });
        }
      }

      const sanitizedFlat: Record<string, string | FileValue> = {};
      for (const [key, value] of Object.entries(contents)) {
        if (typeof value === "string") {
          const sKey = sanitize(String(key));
          const sVal = sanitize(value);
          sanitizedFlat[sKey] = sVal;
          textContents[sKey] = sVal;
        }
      }
      finalContents = sanitizedFlat;
    }

    // ── BRANCH: Newsletter double opt-in ──
    if (formType === "newsletter") {
      return handleNewsletterSignup(res, project, textContents);
    }

    // ── 8. Content pattern scoring (skip for trusted form types) ──
    let flagged = false;
    let flagReason = "";

    if (!isTrustedFormType) {
      const patternResult = analyzePatterns(textContents);
      if (patternResult.score >= SPAM_THRESHOLD) {
        flagged = true;
        flagReason = `[content_pattern] Score ${patternResult.score}: ${patternResult.reasons.join("; ")}`;
      }
    }

    // ── 9. Flood detection ──
    if (senderIp !== "unknown") {
      const flooding = await isIpFlooding(senderIp);
      if (flooding) {
        return res.status(429).json({ error: "Too many submissions. Please try again later." });
      }
    }

    const contentHash = hashContents(textContents);
    const duplicate = await isDuplicateContent(String(projectId), contentHash);
    if (duplicate) {
      return silentOk(res);
    }

    // ── 10. AI content analysis (skip for trusted form types) ──
    if (!flagged && !isTrustedFormType) {
      const aiResult = await analyzeContent(sanitizedFormName, textContents);
      if (aiResult.flagged) {
        flagged = true;
        flagReason = `[${aiResult.category}] ${aiResult.reason}`;
      }
    }

    // ── 11. File uploads — upload to S3 ──
    const uploadedFiles = req.files as Express.Multer.File[] | undefined;
    if (uploadedFiles && uploadedFiles.length > 0) {
      const fileEntries = await uploadFormFiles(uploadedFiles, project.organization_id);

      if (isSectionsFormat) {
        // Append files as their own section
        const fileFields: [string, FileValue][] = Object.entries(fileEntries).map(
          ([, fv]) => [fv.name, fv] as [string, FileValue],
        );
        (finalContents as FormSection[]).push({
          title: "Uploaded Files",
          fields: fileFields,
        });
      } else {
        Object.assign(finalContents, fileEntries);
      }
    }

    // ── 12. Resolve recipients: per-location config → project.recipients → org admins → fallback ──
    // Card H (May 4 2026): if the form is associated with a location_id,
    // route to the location's per-type config first. Falls back to the
    // existing project.recipients chain when no per-location config or
    // no location_id is present.
    let recipients: string[] = [];
    let practiceFallback: string[] = [];
    try {
      const projectRecipients = (project as any)?.recipients;
      if (Array.isArray(projectRecipients) && projectRecipients.length > 0) {
        practiceFallback = projectRecipients.filter(Boolean);
      }

      if (practiceFallback.length === 0 && project?.organization_id) {
        const orgUsers = await OrganizationUserModel.listByOrgWithUsers(project.organization_id);
        const adminEmails = orgUsers
          .filter((u) => u.role === "admin")
          .map((u) => u.email)
          .filter(Boolean);
        if (adminEmails.length > 0) {
          practiceFallback = adminEmails;
        }
      }
      if (practiceFallback.length === 0) {
        practiceFallback = [FALLBACK_RECIPIENT];
      }

      // Resolve per-location config first when a location is bound to
      // this form submission. The submission's location_id (Card H scope
      // addition) is set when the form's project has been associated
      // with a location; pre-association forms fall through with
      // location_id null, which the helper handles by emitting the
      // 'notification_fallback_to_global' behavioral_event.
      const submissionLocationId =
        typeof (req as any).body?.location_id === "number"
          ? (req as any).body.location_id
          : (project as any)?.location_id ?? null;
      const { resolveNotificationRecipients } = await import(
        "../../services/notifications/locationRouter"
      );
      const routed = await resolveNotificationRecipients({
        locationId: submissionLocationId,
        notificationType: "form_submission",
        fallbackRecipients: practiceFallback,
        practiceId: project?.organization_id ?? null,
      });
      recipients = routed.recipients;
    } catch (lookupErr) {
      console.error("[Form Submission] Recipient lookup failed:", lookupErr);
      recipients = practiceFallback.length > 0 ? practiceFallback : [FALLBACK_RECIPIENT];
    }

    if (recipients.length === 0) {
      recipients = [FALLBACK_RECIPIENT];
    }

    // ── 13. Persist submission ──
    try {
      await FormSubmissionModel.create({
        project_id: String(projectId),
        form_name: sanitizedFormName,
        contents: finalContents,
        recipients_sent_to: recipients,
        sender_ip: senderIp,
        content_hash: contentHash,
        is_flagged: flagged,
        flag_reason: flagged ? flagReason : undefined,
      });
    } catch (saveErr) {
      console.error("[Form Submission] Failed to save submission:", saveErr);
    }

    // ── 14. Email (only if not flagged) ──
    if (!flagged) {
      let emailTableHtml: string;

      if (isSectionsFormat) {
        // Sections-aware email: grouped with headers
        emailTableHtml = (finalContents as FormSection[])
          .map((section) => {
            const sectionHeader = `<tr><td colspan="2" style="padding:16px 0 8px 0;font-size:16px;font-weight:700;color:#007693;border-bottom:1px solid #e5e7eb;">${section.title}</td></tr>`;
            const fieldRows = section.fields
              .filter(([, value]) => typeof value === "string") // skip file values in email
              .map(
                ([label, value]) =>
                  `<tr>
                    <td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;width:40%;">${label}</td>
                    <td style="padding:6px 0;color:#111827;font-weight:600;">${value}</td>
                  </tr>`,
              )
              .join("");
            // File names listed separately
            const fileFieldRows = section.fields
              .filter(([, value]) => typeof value === "object" && value !== null)
              .map(
                ([, value]) => {
                  const fv = value as FileValue;
                  return `<tr>
                    <td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">Attached File</td>
                    <td style="padding:6px 0;color:#111827;font-weight:600;">${fv.name}</td>
                  </tr>`;
                },
              )
              .join("");
            return sectionHeader + fieldRows + fileFieldRows;
          })
          .join("");
      } else {
        // Legacy flat format email
        const rows = Object.entries(textContents)
          .map(
            ([label, value]) =>
              `<tr>
                <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${label}</td>
                <td style="padding:8px 0;color:#111827;font-weight:600;">${value}</td>
              </tr>`,
          )
          .join("");

        const fileRows = uploadedFiles && uploadedFiles.length > 0
          ? uploadedFiles.map(
              (f) =>
                `<tr>
                  <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">Attached File</td>
                  <td style="padding:8px 0;color:#111827;font-weight:600;">${f.originalname} (${(f.size / 1024).toFixed(0)} KB)</td>
                </tr>`,
            ).join("")
          : "";

        emailTableHtml = rows + fileRows;
      }

      const emailBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:#0e8988;color:#fff;padding:24px 32px;border-radius:16px 16px 0 0;">
        <h1 style="margin:0;font-size:22px;">New Entry From ${sanitizedFormName}</h1>
      </div>
      <div style="background:#f9fafb;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${emailTableHtml}
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
    }

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
