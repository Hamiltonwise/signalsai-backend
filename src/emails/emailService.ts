/**
 * Email Service
 *
 * Central email service. Sends via Mailgun API directly when MAILGUN_API_KEY
 * is set. Falls back to n8n webhook if not.
 * All email operations are logged to src/logs/email.log
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import dotenv from "dotenv";
import type { EmailPayload, EmailResult, SendEmailOptions } from "./types";

dotenv.config();

// Configuration
const WEBHOOK_URL = process.env.ALLORO_EMAIL_SERVICE_WEBHOOK || "";
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || "";
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || "info@getalloro.com";
const FROM_NAME = process.env.MAILGUN_FROM_NAME || "Alloro";

// Log file path
const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "email.log");

/**
 * Ensure log directory exists
 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log email operation to file
 */
function logEmail(
  level: "INFO" | "ERROR" | "WARN",
  message: string,
  data?: Record<string, any>
): void {
  ensureLogDir();

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };

  const logLine = `[${timestamp}] [${level}] ${message} ${
    data ? JSON.stringify(data) : ""
  }\n`;

  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (error) {
    console.error("[EMAIL SERVICE] Failed to write to log file:", error);
  }

  // Also log to console in development
  if (process.env.NODE_ENV !== "production") {
    if (level === "ERROR") {
      console.error(`[EMAIL] ${message}`, data || "");
    } else {
      console.log(`[EMAIL] ${message}`, data || "");
    }
  }
}

/**
 * Get admin email addresses from environment
 */
export function getAdminEmails(): string[] {
  if (ADMIN_EMAILS.length === 0) {
    logEmail(
      "WARN",
      "No admin emails configured in ADMIN_EMAILS environment variable"
    );
  }
  return ADMIN_EMAILS;
}

/**
 * Validate email payload
 */
function validatePayload(payload: SendEmailOptions): string[] {
  const errors: string[] = [];

  if (!payload.subject || payload.subject.trim() === "") {
    errors.push("Subject is required");
  }

  if (!payload.body || payload.body.trim() === "") {
    errors.push("Body is required");
  }

  if (!payload.recipients || payload.recipients.length === 0) {
    errors.push("At least one recipient is required");
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  payload.recipients?.forEach((email, index) => {
    if (!emailRegex.test(email)) {
      errors.push(
        `Invalid email format for recipient at index ${index}: ${email}`
      );
    }
  });

  return errors;
}

/**
 * Send email via Mailgun API directly
 */
async function sendViaMailgun(options: SendEmailOptions): Promise<EmailResult> {
  const timestamp = new Date().toISOString();
  const form = new FormData();
  form.append("from", `${FROM_NAME} <${FROM_EMAIL}>`);
  form.append("to", options.recipients.join(","));
  if (options.cc?.length) form.append("cc", options.cc.join(","));
  if (options.bcc?.length) form.append("bcc", options.bcc.join(","));
  form.append("subject", options.subject);
  form.append("html", options.body);

  try {
    const response = await axios.post(
      `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
      form,
      {
        auth: { username: "api", password: MAILGUN_API_KEY },
        headers: form.getHeaders(),
        timeout: 15000,
      }
    );

    const messageId = response.data?.id || `mg_${Date.now()}`;
    logEmail("INFO", "Email sent via Mailgun", {
      messageId,
      subject: options.subject,
      recipients: options.recipients,
    });

    return { success: true, messageId, timestamp };
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Mailgun error";
    logEmail("ERROR", "Mailgun send failed", {
      error: errorMessage,
      subject: options.subject,
      recipients: options.recipients,
      status: error.response?.status,
    });
    return { success: false, error: errorMessage, timestamp };
  }
}

/**
 * Send email via n8n webhook (legacy fallback)
 */
async function sendViaWebhook(options: SendEmailOptions): Promise<EmailResult> {
  const timestamp = new Date().toISOString();
  const payload: EmailPayload & { from: string; fromName: string } = {
    subject: options.subject,
    body: options.body,
    recipients: options.recipients,
    cc: options.cc || [],
    bcc: options.bcc || [],
    from: FROM_EMAIL,
    fromName: FROM_NAME,
  };

  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });
    const messageId = response.data?.messageId || response.data?.id || `msg_${Date.now()}`;
    logEmail("INFO", "Email sent via n8n webhook", { messageId, subject: options.subject, recipients: options.recipients });
    return { success: true, messageId, timestamp };
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Unknown error";
    logEmail("ERROR", "n8n webhook send failed", { error: errorMessage, subject: options.subject, recipients: options.recipients });
    return { success: false, error: errorMessage, timestamp };
  }
}

/**
 * Send email -- Mailgun direct if configured, n8n webhook fallback
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<EmailResult> {
  const timestamp = new Date().toISOString();

  // Validate payload
  const validationErrors = validatePayload(options);
  if (validationErrors.length > 0) {
    const error = `Validation failed: ${validationErrors.join(", ")}`;
    logEmail("ERROR", error, { subject: options.subject, recipients: options.recipients });
    return { success: false, error, timestamp };
  }

  logEmail("INFO", `Sending email via ${MAILGUN_API_KEY ? "Mailgun" : "n8n webhook"}`, {
    subject: options.subject,
    recipientCount: options.recipients.length,
  });

  // Mailgun direct (preferred)
  if (MAILGUN_API_KEY && MAILGUN_DOMAIN) {
    return sendViaMailgun(options);
  }

  // n8n webhook fallback
  if (WEBHOOK_URL) {
    return sendViaWebhook(options);
  }

  const error = "No email transport configured. Set MAILGUN_API_KEY + MAILGUN_DOMAIN or ALLORO_EMAIL_SERVICE_WEBHOOK.";
  logEmail("ERROR", error);
  return { success: false, error, timestamp };
}

/**
 * Send email to all admin addresses
 */
export async function sendToAdmins(
  subject: string,
  body: string,
  options?: { cc?: string[]; bcc?: string[] }
): Promise<EmailResult> {
  const adminEmails = getAdminEmails();

  if (adminEmails.length === 0) {
    return {
      success: false,
      error: "No admin emails configured",
      timestamp: new Date().toISOString(),
    };
  }

  return sendEmail({
    subject,
    body,
    recipients: adminEmails,
    cc: options?.cc,
    bcc: options?.bcc,
  });
}

/**
 * Get email log entries (for debugging/monitoring)
 */
export function getEmailLogs(limit: number = 100): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    return lines.slice(-limit);
  } catch (error) {
    console.error("[EMAIL SERVICE] Failed to read log file:", error);
    return [];
  }
}

/**
 * Clear email logs (for maintenance)
 */
export function clearEmailLogs(): boolean {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "");
      logEmail("INFO", "Email logs cleared");
    }
    return true;
  } catch (error) {
    console.error("[EMAIL SERVICE] Failed to clear log file:", error);
    return false;
  }
}

// Export configuration for testing
export const config = {
  webhookUrl: WEBHOOK_URL,
  adminEmails: ADMIN_EMAILS,
  fromEmail: FROM_EMAIL,
  fromName: FROM_NAME,
  logFile: LOG_FILE,
};
