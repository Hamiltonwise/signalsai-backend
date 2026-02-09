/**
 * Website Contact Form API Route (Public — no auth required)
 *
 * Handles contact form submissions from rendered sites at *.sites.getalloro.com.
 * Verifies reCAPTCHA, sanitizes input, builds HTML email, and forwards to n8n webhook.
 */

import express, { Request, Response } from "express";

const router = express.Router();

// Strip HTML tags from user input
function sanitize(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

// Extract site hostname from Origin or Referer header
// e.g. "http://bright-dental.sites.localhost:7777" → "bright-dental"
function extractHostname(req: Request): string | null {
  const origin = req.headers.origin || req.headers.referer || "";
  const match = origin.match(/\/\/([^.]+)\.sites\./);
  return match ? match[1] : null;
}

// Build the HTML email body
function buildEmailBody(data: {
  name: string;
  phone: string;
  email: string;
  service: string;
  message: string;
  siteName: string;
}): string {
  const { name, phone, email, service, message, siteName } = data;

  const messageRow = message
    ? `<tr><td style="padding:10px 0;color:#6b7280;vertical-align:top;">Message</td><td style="padding:10px 0;color:#111827;">${message}</td></tr>`
    : "";

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#0e8988;color:#fff;padding:24px 32px;border-radius:16px 16px 0 0;">
      <h1 style="margin:0;font-size:22px;">New Appointment Request</h1>
      <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">from ${siteName} landing page</p>
    </div>
    <div style="background:#f9fafb;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:10px 0;color:#6b7280;width:120px;vertical-align:top;">Name</td><td style="padding:10px 0;color:#111827;font-weight:600;">${name}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;vertical-align:top;">Phone</td><td style="padding:10px 0;color:#111827;font-weight:600;">${phone}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;vertical-align:top;">Email</td><td style="padding:10px 0;color:#111827;font-weight:600;"><a href="mailto:${email}" style="color:#0e8988;">${email}</a></td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;vertical-align:top;">Service</td><td style="padding:10px 0;color:#111827;font-weight:600;">${service}</td></tr>
        ${messageRow}
      </table>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center;">Sent via ${siteName} appointment form</p>
  </div>`;
}

/**
 * POST /api/websites/contact
 * Handle contact form submissions from rendered sites
 */
router.post("/contact", async (req: Request, res: Response) => {
  try {
    const { name, phone, email, service, message, captchaToken } = req.body;

    // Validate required fields
    if (!name || !phone || !email) {
      return res
        .status(400)
        .json({ error: "Name, phone, and email are required" });
    }

    if (!captchaToken) {
      return res
        .status(400)
        .json({ error: "reCAPTCHA verification is required" });
    }

    // Verify reCAPTCHA token with Google
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    if (recaptchaSecret) {
      const verifyRes = await fetch(
        "https://www.google.com/recaptcha/api/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `secret=${recaptchaSecret}&response=${captchaToken}`,
        }
      );
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return res
          .status(400)
          .json({ error: "reCAPTCHA verification failed" });
      }
    }

    // Extract hostname to identify the site
    const hostname = extractHostname(req);

    const recipients = (process.env.CONTACT_FORM_RECIPIENTS || "")
      .split(",")
      .filter(Boolean);
    const fromEmail = process.env.CONTACT_FORM_FROM || "";
    const webhookUrl = process.env.ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK || "";

    if (!webhookUrl) {
      console.error("[Website Contact] ALLORO_CUSTOM_WEBSITE_EMAIL_WEBHOOK not configured");
      return res.status(500).json({ error: "Email service not configured" });
    }

    // Sanitize all inputs
    const sanitizedData = {
      name: sanitize(name),
      phone: sanitize(phone),
      email: sanitize(email),
      service: sanitize(service || ""),
      message: sanitize(message || ""),
      siteName: hostname || "Website",
    };

    // Build email body
    const emailBody = buildEmailBody(sanitizedData);

    // Forward to n8n webhook
    const webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cc: [],
        bcc: [],
        body: emailBody,
        from: fromEmail,
        subject: `New Appointment Request — ${sanitizedData.name} (${sanitizedData.service})`,
        fromName: sanitizedData.siteName,
        recipients,
      }),
    });

    if (!webhookRes.ok) {
      console.error(
        "[Website Contact] Webhook failed:",
        webhookRes.status,
        await webhookRes.text()
      );
      return res.status(502).json({ error: "Failed to send email" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("[Website Contact] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
