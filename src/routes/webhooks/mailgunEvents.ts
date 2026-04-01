/**
 * Mailgun Event Webhooks -- Email Deliverability Tracking
 *
 * POST /api/webhooks/mailgun/events
 * Receives: delivered, opened, clicked, bounced, complained, unsubscribed
 *
 * Public endpoint (no auth) but verified via Mailgun HMAC signature.
 */

import express from "express";
import {
  verifyMailgunSignature,
  processMailgunEvent,
  getEmailMetrics,
  getDeliverabilityHealth,
} from "../../services/emailAnalytics";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const mailgunEventsRoutes = express.Router();

// POST /events -- Mailgun webhook receiver (public, signature-verified)
mailgunEventsRoutes.post("/events", async (req, res) => {
  try {
    const signature = req.body?.signature || {};
    const { timestamp, token, signature: sig } = signature;

    if (timestamp && token && sig) {
      if (!verifyMailgunSignature(timestamp, token, sig)) {
        console.warn("[MailgunEvents] Invalid signature, rejecting");
        return res.status(406).json({ error: "Invalid signature" });
      }
    }

    await processMailgunEvent(req.body);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[MailgunEvents] Error processing webhook:", err);
    // Return 200 to prevent Mailgun from retrying on app errors
    return res.status(200).json({ success: false, error: "Processing error" });
  }
});

// GET /metrics -- Admin: email metrics aggregation
mailgunEventsRoutes.get(
  "/metrics",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const orgId = req.query.org_id ? parseInt(req.query.org_id as string, 10) : undefined;
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const dateRange = start && end ? { start, end } : undefined;

      const metrics = await getEmailMetrics(orgId, dateRange);
      return res.json({ success: true, ...metrics });
    } catch (err) {
      console.error("[MailgunEvents] Metrics error:", err);
      return res.status(500).json({ success: false, error: "Failed to load metrics" });
    }
  }
);

// GET /health -- Admin: deliverability health summary
mailgunEventsRoutes.get(
  "/health",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const health = await getDeliverabilityHealth();
      return res.json({ success: true, ...health });
    } catch (err) {
      console.error("[MailgunEvents] Health error:", err);
      return res.status(500).json({ success: false, error: "Failed to load health" });
    }
  }
);

export default mailgunEventsRoutes;
