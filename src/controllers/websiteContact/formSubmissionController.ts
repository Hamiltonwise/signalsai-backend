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
 * 11. Persist submission
 * 12. Email (only if not flagged)
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
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import { NewsletterSignupModel } from "../../models/website-builder/NewsletterSignupModel";

const FALLBACK_RECIPIENT = "laggy80@gmail.com";

const MAX_FIELDS = 20;
const MAX_KEY_LENGTH = 100;
const MAX_VALUE_LENGTH = 500;
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
const NEWSLETTER_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Extract the first email-like value from form contents.
 */
function extractEmail(contents: Record<string, string>): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const value of Object.values(contents)) {
    if (emailRegex.test(value.trim())) return value.trim().toLowerCase();
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

export async function handleFormSubmission(req: Request, res: Response): Promise<Response> {
  try {
    const { projectId, formName, formType, contents, _hp, _ts, _jsc } = req.body;

    // ── 1. Honeypot ──
    if (_hp) {
      return silentOk(res);
    }

    // ── 2. Timestamp / timing check ──
    const ts = Number(_ts);
    if (!_ts || isNaN(ts)) {
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

    // ── 4. Basic field validation ──
    const senderIp = extractClientIp(req);
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

    // ── 5. Origin validation ──
    const project = await ProjectModel.findById(String(projectId));
    if (!project) {
      return silentOk(res);
    }

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

    // ── 6. Payload caps ──
    const fieldKeys = Object.keys(contents);
    if (fieldKeys.length > MAX_FIELDS) {
      return res.status(400).json({ error: `Too many fields (max ${MAX_FIELDS})` });
    }

    if (String(formName).length > MAX_FORM_NAME_LENGTH) {
      return res.status(400).json({ error: `Form name too long (max ${MAX_FORM_NAME_LENGTH} chars)` });
    }

    for (const [key, value] of Object.entries(contents)) {
      if (String(key).length > MAX_KEY_LENGTH) {
        return res.status(400).json({ error: `Field name too long (max ${MAX_KEY_LENGTH} chars)` });
      }
      if (String(value).length > MAX_VALUE_LENGTH) {
        return res.status(400).json({ error: `Field value too long (max ${MAX_VALUE_LENGTH} chars)` });
      }
    }

    // ── 7. Sanitize all values ──
    const sanitizedFormName = sanitize(String(formName));
    const sanitizedContents: Record<string, string> = {};
    for (const [key, value] of Object.entries(contents)) {
      sanitizedContents[sanitize(String(key))] = sanitize(String(value));
    }

    // ── BRANCH: Newsletter double opt-in ──
    if (formType === "newsletter") {
      return handleNewsletterSignup(res, project, sanitizedContents);
    }

    // ── 8. Content pattern scoring ──
    const patternResult = analyzePatterns(sanitizedContents);
    let flagged = false;
    let flagReason = "";

    if (patternResult.score >= SPAM_THRESHOLD) {
      flagged = true;
      flagReason = `[content_pattern] Score ${patternResult.score}: ${patternResult.reasons.join("; ")}`;
    }

    // ── 9. Flood detection ──
    if (senderIp !== "unknown") {
      const flooding = await isIpFlooding(senderIp);
      if (flooding) {
        return res.status(429).json({ error: "Too many submissions. Please try again later." });
      }
    }

    const contentHash = hashContents(sanitizedContents);
    const duplicate = await isDuplicateContent(String(projectId), contentHash);
    if (duplicate) {
      return silentOk(res);
    }

    // ── 10. AI content analysis (skip if already flagged by patterns) ──
    if (!flagged) {
      const aiResult = await analyzeContent(sanitizedFormName, sanitizedContents);
      if (aiResult.flagged) {
        flagged = true;
        flagReason = `[${aiResult.category}] ${aiResult.reason}`;
      }
    }

    // ── 11. Resolve recipients: project.recipients → org admins → fallback ──
    let recipients: string[] = [];
    try {
      const projectRecipients = (project as any)?.recipients;
      if (Array.isArray(projectRecipients) && projectRecipients.length > 0) {
        recipients = projectRecipients.filter(Boolean);
      }

      if (recipients.length === 0 && project?.organization_id) {
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

    // ── 12. Persist submission ──
    try {
      await FormSubmissionModel.create({
        project_id: String(projectId),
        form_name: sanitizedFormName,
        contents: sanitizedContents,
        recipients_sent_to: recipients,
        sender_ip: senderIp,
        content_hash: contentHash,
        is_flagged: flagged,
        flag_reason: flagged ? flagReason : undefined,
      });
    } catch (saveErr) {
      console.error("[Form Submission] Failed to save submission:", saveErr);
    }

    // ── 13. Email (only if not flagged) ──
    if (!flagged) {
      const rows = Object.entries(sanitizedContents)
        .map(
          ([label, value]) =>
            `<tr>
              <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${label}</td>
              <td style="padding:8px 0;color:#111827;font-weight:600;">${value}</td>
            </tr>`,
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
