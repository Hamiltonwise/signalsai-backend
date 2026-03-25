import express, { Request, Response } from "express";
import { db } from "../../database/connection";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

// ── Webhook registry ─────────────────────────────────────────────
// All known webhooks in the system. Add new ones here as they ship.

interface WebhookDef {
  name: string;
  endpoint: string;
  env_var: string;
}

const WEBHOOKS: WebhookDef[] = [
  {
    name: "Stripe",
    endpoint: "/api/billing/webhook",
    env_var: "STRIPE_WEBHOOK_SECRET",
  },
  {
    name: "Mailgun",
    endpoint: "/api/webhooks/mailgun/inbound",
    env_var: "MAILGUN_API_KEY",
  },
  {
    name: "Fireflies",
    endpoint: "/api/admin/fireflies-webhook",
    env_var: "FIREFLIES_API_KEY",
  },
  {
    name: "n8n Scraper",
    endpoint: "/api/scraper/homepage",
    env_var: "SCRAPER_API_KEY",
  },
  {
    name: "n8n Trial Emails",
    endpoint: "(outbound to n8n)",
    env_var: "ALLORO_N8N_WEBHOOK_URL",
  },
];

// ── GET /api/admin/webhooks/health ───────────────────────────────

router.get(
  "/health",
  authenticateToken,
  superAdminMiddleware,
  async (_req: Request, res: Response) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Get latest receipt per webhook name
      const latestReceipts = await db("webhook_receipts")
        .select("webhook_name")
        .max("received_at as last_received_at")
        .groupBy("webhook_name");

      // Get latest event type per webhook
      const latestEvents = await db
        .select("wr.webhook_name", "wr.event_type")
        .from(
          db("webhook_receipts")
            .select("webhook_name", "event_type", "received_at")
            .distinctOn("webhook_name")
            .orderBy([
              { column: "webhook_name" },
              { column: "received_at", order: "desc" },
            ])
            .as("wr"),
        );

      const receiptMap = new Map<string, { last_received_at: Date; event_type: string | null }>();

      for (const r of latestReceipts) {
        receiptMap.set(r.webhook_name, {
          last_received_at: r.last_received_at,
          event_type: null,
        });
      }

      for (const e of latestEvents) {
        const existing = receiptMap.get(e.webhook_name);
        if (existing) {
          existing.event_type = e.event_type;
        }
      }

      const webhooks = WEBHOOKS.map((w) => {
        const receipt = receiptMap.get(w.name);
        const envConfigured = !!process.env[w.env_var];

        let status: "active" | "stale" | "never_received" = "never_received";
        if (receipt?.last_received_at) {
          status = new Date(receipt.last_received_at) > sevenDaysAgo ? "active" : "stale";
        }

        return {
          name: w.name,
          endpoint: w.endpoint,
          last_received_at: receipt?.last_received_at || null,
          last_event_type: receipt?.event_type || null,
          status,
          env_var_configured: envConfigured,
        };
      });

      return res.json({ success: true, webhooks });
    } catch (err: any) {
      console.error("[WEBHOOK-HEALTH] Error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

// T2 registers GET /api/admin/webhooks/health
export default router;

// ── Helper: Record a webhook receipt ─────────────────────────────
// Import this function in webhook handlers to track receipts.
// Usage: await recordWebhookReceipt("Stripe", "invoice.paid");

export async function recordWebhookReceipt(
  webhookName: string,
  eventType?: string,
): Promise<void> {
  try {
    await db("webhook_receipts").insert({
      webhook_name: webhookName,
      event_type: eventType || null,
    });
  } catch (err: any) {
    // Non-fatal -- don't break webhook processing
    console.warn(`[WEBHOOK-HEALTH] Failed to record receipt for ${webhookName}:`, err.message);
  }
}
