/**
 * Email Analytics Service
 *
 * Processes Mailgun webhook events and provides aggregation functions
 * for email deliverability, open rates, and engagement metrics.
 */

import crypto from "crypto";
import { db } from "../database/connection";

const MAILGUN_WEBHOOK_SIGNING_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || "";

// Valid event types from Mailgun webhooks
type MailgunEventType = "delivered" | "opened" | "clicked" | "bounced" | "complained" | "unsubscribed";

const VALID_EVENTS = new Set<string>(["delivered", "opened", "clicked", "bounced", "complained", "unsubscribed"]);

// Email type detection from tags or subject
type EmailType = "monday_brief" | "trial_day1" | "trial_day3" | "trial_day7" | "welcome" | "checkup_result" | "review_request" | "progress_report" | "other";

function detectEmailType(eventData: Record<string, any>): EmailType {
  const tags: string[] = eventData?.["message"]?.["headers"]?.["x-mailgun-tag"]
    || eventData?.tags
    || [];
  const subject: string = eventData?.["message"]?.["headers"]?.["subject"] || "";

  if (tags.includes("monday_brief") || subject.toLowerCase().includes("monday")) return "monday_brief";
  if (tags.includes("trial_day1") || subject.toLowerCase().includes("welcome")) return "trial_day1";
  if (tags.includes("trial_day3")) return "trial_day3";
  if (tags.includes("trial_day7")) return "trial_day7";
  if (tags.includes("welcome")) return "welcome";
  if (tags.includes("checkup_result") || subject.toLowerCase().includes("checkup")) return "checkup_result";
  if (tags.includes("review_request") || subject.toLowerCase().includes("review")) return "review_request";
  if (tags.includes("progress_report") || subject.toLowerCase().includes("progress")) return "progress_report";
  return "other";
}

// Signature verification for Mailgun webhooks
export function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string
): boolean {
  if (!MAILGUN_WEBHOOK_SIGNING_KEY) {
    console.warn("[EmailAnalytics] MAILGUN_WEBHOOK_SIGNING_KEY not set, skipping verification");
    return true; // allow in dev
  }
  const hmac = crypto.createHmac("sha256", MAILGUN_WEBHOOK_SIGNING_KEY);
  hmac.update(timestamp + token);
  const expected = hmac.digest("hex");
  return expected === signature;
}

// Process a single Mailgun webhook event
export async function processMailgunEvent(payload: Record<string, any>): Promise<void> {
  const eventData = payload["event-data"] || payload;
  const eventType = eventData.event?.toLowerCase();

  if (!eventType || !VALID_EVENTS.has(eventType)) {
    console.log(`[EmailAnalytics] Ignoring event type: ${eventType}`);
    return;
  }

  const recipientEmail = eventData.recipient || eventData.message?.headers?.to || "";
  const emailType = detectEmailType(eventData);
  const timestamp = eventData.timestamp
    ? new Date(eventData.timestamp * 1000).toISOString()
    : new Date().toISOString();

  // Try to resolve org_id from recipient email
  let orgId: number | null = null;
  if (recipientEmail) {
    const user = await db("users")
      .where("email", recipientEmail.toLowerCase())
      .first("org_id");
    orgId = user?.org_id || null;
  }

  await db("email_events").insert({
    org_id: orgId,
    email_type: emailType,
    recipient_email: recipientEmail.toLowerCase(),
    event_type: eventType,
    timestamp,
    metadata: JSON.stringify({
      mailgun_id: eventData["message"]?.["headers"]?.["message-id"] || null,
      tags: eventData.tags || [],
      ip: eventData.ip || null,
      client_type: eventData["client-info"]?.["client-type"] || null,
      device_type: eventData["client-info"]?.["device-type"] || null,
      url: eventData.url || null,  // for click events
      severity: eventData.severity || null,  // for bounce events
      reason: eventData.reason || null,  // for bounce/complaint
    }),
  });
}

// Aggregation: email metrics by type
export async function getEmailMetrics(
  orgId?: number,
  dateRange?: { start: string; end: string }
): Promise<{
  byType: Record<string, {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
  }>;
  totals: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
  };
}> {
  let query = db("email_events")
    .select("email_type", "event_type")
    .count("* as count")
    .groupBy("email_type", "event_type");

  if (orgId) query = query.where("org_id", orgId);
  if (dateRange) {
    query = query.where("timestamp", ">=", dateRange.start)
      .where("timestamp", "<=", dateRange.end);
  }

  const rows = await query as Array<{ email_type: string; event_type: string; count: string }>;

  const byType: Record<string, Record<string, number>> = {};
  const totals = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };

  for (const row of rows) {
    if (!byType[row.email_type]) {
      byType[row.email_type] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
    }
    const count = parseInt(row.count, 10);
    const eventKey = row.event_type as keyof typeof totals;
    if (eventKey in totals) {
      byType[row.email_type][eventKey] = (byType[row.email_type][eventKey] || 0) + count;
      totals[eventKey] += count;
    }
  }

  // Estimate "sent" as delivered + bounced (Mailgun does not send a "sent" event)
  for (const type of Object.keys(byType)) {
    byType[type].sent = (byType[type].delivered || 0) + (byType[type].bounced || 0);
  }
  totals.sent = totals.delivered + totals.bounced;

  return { byType: byType as any, totals };
}

// Aggregation: deliverability health
export async function getDeliverabilityHealth(): Promise<{
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
  totalEmails: number;
  period: string;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const counts = await db("email_events")
    .where("timestamp", ">=", thirtyDaysAgo)
    .select("event_type")
    .count("* as count")
    .groupBy("event_type");

  const countMap: Record<string, number> = {};
  for (const row of counts as Array<{ event_type: string; count: string }>) {
    countMap[row.event_type] = parseInt(row.count, 10);
  }

  const delivered = countMap["delivered"] || 0;
  const bounced = countMap["bounced"] || 0;
  const opened = countMap["opened"] || 0;
  const clicked = countMap["clicked"] || 0;
  const complained = countMap["complained"] || 0;
  const totalEmails = delivered + bounced;

  return {
    deliveryRate: totalEmails > 0 ? Math.round((delivered / totalEmails) * 10000) / 100 : 0,
    openRate: delivered > 0 ? Math.round((opened / delivered) * 10000) / 100 : 0,
    clickRate: delivered > 0 ? Math.round((clicked / delivered) * 10000) / 100 : 0,
    bounceRate: totalEmails > 0 ? Math.round((bounced / totalEmails) * 10000) / 100 : 0,
    complaintRate: totalEmails > 0 ? Math.round((complained / totalEmails) * 10000) / 100 : 0,
    totalEmails,
    period: "last_30_days",
  };
}

export { EmailType, MailgunEventType };
