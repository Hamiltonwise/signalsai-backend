/**
 * HTML email template builder for website contact form.
 * Generates the HTML email body from sanitized contact form data.
 */

export interface EmailData {
  name: string;
  phone: string;
  email: string;
  service: string;
  message: string;
  siteName: string;
}

export function buildEmailBody(data: EmailData): string {
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
