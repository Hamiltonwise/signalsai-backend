/**
 * TTFV (Time-to-First-Value) sensor endpoint.
 *
 * POST /api/org/:orgId/ttfv — records doctor's response
 * GET /api/org/:orgId/ttfv — returns current TTFV state + billing prompt status
 * POST /api/org/:orgId/first-login — marks first login timestamp
 */

import express from "express";
import { db } from "../database/connection";
import axios from "axios";
import { detectTTFV } from "../services/ttfvDetection";

const ttfvRoutes = express.Router();

const SLACK_WEBHOOK = process.env.SLACK_ALLORO_BRIEF_WEBHOOK_URL;

/**
 * POST /api/org/:orgId/first-login
 * Sets first_login_at if not already set.
 */
ttfvRoutes.post("/:orgId/first-login", async (req: any, res) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (!orgId || orgId !== req.organizationId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) return res.status(404).json({ success: false, error: "Not found" });

    if (!org.first_login_at) {
      await db("organizations")
        .where({ id: orgId })
        .update({ first_login_at: new Date() });
    }

    return res.json({ success: true, firstLogin: !org.first_login_at });
  } catch (error: any) {
    console.error("[TTFV] First login error:", error.message);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * GET /api/org/:orgId/ttfv
 * Returns TTFV state for the org.
 */
ttfvRoutes.get("/:orgId/ttfv", async (req: any, res) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (!orgId || orgId !== req.organizationId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const org = await db("organizations")
      .where({ id: orgId })
      .select(
        "first_login_at",
        "ttfv_response",
        "ttfv_responded_at",
        "billing_prompt_shown_at",
        "subscription_status"
      )
      .first();

    if (!org) return res.status(404).json({ success: false, error: "Not found" });

    return res.json({
      success: true,
      firstLoginAt: org.first_login_at,
      ttfvResponse: org.ttfv_response,
      ttfvRespondedAt: org.ttfv_responded_at,
      billingPromptShownAt: org.billing_prompt_shown_at,
      showTtfvPrompt: !!org.first_login_at && !org.ttfv_response,
      showBillingPrompt:
        org.ttfv_response === "yes" &&
        org.subscription_status !== "active" &&
        org.subscription_status !== "trial",
    });
  } catch (error: any) {
    console.error("[TTFV] Status error:", error.message);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * POST /api/org/:orgId/ttfv
 * Records the doctor's TTFV response.
 */
ttfvRoutes.post("/:orgId/ttfv", async (req: any, res) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (!orgId || orgId !== req.organizationId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const { response } = req.body;
    if (response !== "yes" && response !== "not_yet") {
      return res.status(400).json({ success: false, error: "Invalid response" });
    }

    const org = await db("organizations").where({ id: orgId }).select("name", "ttfv_response").first();
    if (!org) return res.status(404).json({ success: false, error: "Not found" });

    // Don't overwrite existing response
    if (org.ttfv_response) {
      return res.json({ success: true, alreadyResponded: true });
    }

    await db("organizations")
      .where({ id: orgId })
      .update({
        ttfv_response: response,
        ttfv_responded_at: new Date(),
      });

    // If "not_yet" — send Slack notification
    if (response === "not_yet" && SLACK_WEBHOOK) {
      const now = new Date().toISOString();
      axios
        .post(SLACK_WEBHOOK, {
          text: `TTFV: Not yet — ${org.name} (org ${orgId}) responded "Not quite yet" at ${now}. Review their Checkup finding and dashboard data.`,
        })
        .catch(() => {}); // fire-and-forget
    }

    console.log(`[TTFV] Org ${orgId} (${org.name}) responded: ${response}`);

    return res.json({ success: true, response });
  } catch (error: any) {
    console.error("[TTFV] Response error:", error.message);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * GET /api/org/:orgId/ttfv-detection
 * Autonomous TTFV detection based on behavioral signals.
 * Returns score, signals, and reached status.
 */
ttfvRoutes.get("/:orgId/ttfv-detection", async (req: any, res) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (!orgId || orgId !== req.organizationId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const result = await detectTTFV(orgId);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[TTFV] Detection error:", error.message);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

export default ttfvRoutes;
