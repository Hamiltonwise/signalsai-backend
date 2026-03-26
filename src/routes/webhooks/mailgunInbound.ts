/**
 * Mailgun Inbound Webhook — Monday Email Response Tracking
 *
 * POST /api/webhooks/mailgun/inbound
 * Receives inbound email from Mailgun when a doctor replies to a Monday email.
 *
 * Parses: from (doctor email), subject, body text.
 * Logs to behavioral_events as 'monday_email.replied'.
 * Posts to #alloro-brief.
 * Creates dream_team_task for Corey.
 *
 * // T2 registers POST /api/webhooks/mailgun/inbound
 */

import express from "express";
import crypto from "crypto";
import axios from "axios";
import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";

const mailgunInboundRoutes = express.Router();

const SIGNING_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || "";
const SLACK_WEBHOOK = process.env.ALLORO_BRIEF_SLACK_WEBHOOK || "";

// ─── Signature Verification ─────────────────────────────────────────

function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
): boolean {
  if (!SIGNING_KEY) {
    console.warn("[MailgunInbound] MAILGUN_WEBHOOK_SIGNING_KEY not set, skipping verification");
    return true; // allow in dev
  }

  const hmac = crypto.createHmac("sha256", SIGNING_KEY);
  hmac.update(timestamp + token);
  const expected = hmac.digest("hex");
  return expected === signature;
}

// ─── POST /api/webhooks/mailgun/inbound ─────────────────────────────

mailgunInboundRoutes.post("/inbound", async (req, res) => {
  try {
    // Verify signature if key is configured
    const { timestamp, token, signature } = req.body || {};
    if (SIGNING_KEY && !verifyMailgunSignature(timestamp, token, signature)) {
      console.warn("[MailgunInbound] Invalid signature, rejecting");
      return res.status(403).json({ error: "Invalid signature" });
    }

    // Parse inbound email fields
    const senderEmail = (req.body.sender || req.body.from || "").toLowerCase().trim();
    const subject = req.body.subject || "(no subject)";
    const bodyText = req.body["stripped-text"] || req.body["body-plain"] || "";
    const bodyPreview = bodyText.slice(0, 200);

    if (!senderEmail) {
      console.warn("[MailgunInbound] No sender email, ignoring");
      return res.status(200).json({ received: true });
    }

    console.log(`[MailgunInbound] Reply from ${senderEmail}: "${subject}"`);

    // Look up org by sender email
    const user = await db("users")
      .whereRaw("LOWER(email) = ?", [senderEmail])
      .first();

    let orgId: number | null = null;
    let orgName = "Unknown Practice";

    if (user) {
      const orgUser = await db("organization_users")
        .where({ user_id: user.id })
        .first();
      if (orgUser) {
        orgId = orgUser.organization_id;
        const org = await db("organizations").where({ id: orgId }).first();
        orgName = org?.name || `Org #${orgId}`;
      }
    }

    // Log to behavioral_events
    await BehavioralEventModel.create({
      event_type: "monday_email.replied",
      org_id: orgId,
      properties: {
        sender_email: senderEmail,
        subject,
        body_preview: bodyPreview,
        sentiment: null, // future: Claude sentiment analysis
      },
    });

    // Post to #alloro-brief
    if (SLACK_WEBHOOK) {
      const slackText = `Reply from ${orgName}: "${bodyPreview.slice(0, 50)}${bodyPreview.length > 50 ? "..." : ""}"`;
      axios
        .post(SLACK_WEBHOOK, { text: slackText }, { timeout: 5000 })
        .catch(() => {});
    }

    // Create dream_team_task for Corey
    const hasDreamTeamTasks = await db.schema.hasTable("dream_team_tasks");
    if (hasDreamTeamTasks) {
      await db("dream_team_tasks")
        .insert({
          owner: "Corey",
          title: `Email reply -- ${orgName} -- ${subject}`,
          description: bodyPreview,
          status: "pending",
          source: "mailgun_inbound",
          organization_id: orgId,
        })
        .catch((err: any) => {
          console.error("[MailgunInbound] Failed to create task:", err.message);
        });
    }

    // Always respond 200 to Mailgun (they retry on non-200)
    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("[MailgunInbound] Error:", error.message);
    // Still return 200 to prevent Mailgun retries
    return res.status(200).json({ received: true, error: error.message });
  }
});

export default mailgunInboundRoutes;

// T2 registers POST /api/webhooks/mailgun/inbound
