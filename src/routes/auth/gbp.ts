// T2 registers any new endpoints
import express, { Request, Response } from "express";
import { google } from "googleapis";
import { db } from "../../database/connection";
import { getMindsQueue } from "../../workers/queues";
import { gbpAuthLimiter } from "../../middleware/publicRateLimiter";

const router = express.Router();

// ── Env helpers ──────────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

function buildOAuth2Client() {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    "https://app.getalloro.com/api/auth/google/callback",
  );
}

// ── GET /api/auth/google ─────────────────────────────────────────
// Redirects the authenticated user to the Google OAuth consent screen
// with the business.manage scope for GBP access.

router.get("/google", gbpAuthLimiter, (req: Request, res: Response) => {
  try {
    const oauth2 = buildOAuth2Client();

    // Encode orgId in state so the callback can link the token
    const orgId = (req.query.orgId as string) || "";
    const state = Buffer.from(JSON.stringify({ orgId })).toString("base64url");

    const authUrl = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/business.manage"],
      state,
    });

    res.redirect(authUrl);
  } catch (err: any) {
    console.error("[GBP-AUTH] Failed to generate auth URL:", err.message);
    res.redirect("/dashboard?gbp=failed");
  }
});

// ── GET /api/auth/google/callback ────────────────────────────────
// Exchanges the authorization code for tokens, stores them on the
// organizations record, enqueues a PatientPath build, and redirects.

router.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined;
    if (!code) {
      console.error("[GBP-AUTH] No authorization code in callback");
      return res.redirect("/dashboard?gbp=failed");
    }

    // Decode state to recover orgId
    let orgId: number | null = null;
    try {
      const stateRaw = req.query.state as string;
      if (stateRaw) {
        const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
        orgId = parsed.orgId ? Number(parsed.orgId) : null;
      }
    } catch {
      console.warn("[GBP-AUTH] Could not decode state parameter");
    }

    if (!orgId) {
      console.error("[GBP-AUTH] No orgId in state -- cannot store tokens");
      return res.redirect("/dashboard?gbp=failed");
    }

    // Exchange code for tokens
    const oauth2 = buildOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.access_token) {
      console.error("[GBP-AUTH] No access token received from Google");
      return res.redirect("/dashboard?gbp=failed");
    }

    // Fetch the GBP account ID from the My Business Account Management API
    oauth2.setCredentials(tokens);
    let gbpAccountId: string | null = null;
    try {
      const mbam = google.mybusinessaccountmanagement({ version: "v1", auth: oauth2 });
      const accounts = await mbam.accounts.list();
      if (accounts.data.accounts && accounts.data.accounts.length > 0) {
        gbpAccountId = accounts.data.accounts[0].name || null;
      }
    } catch (err: any) {
      console.warn("[GBP-AUTH] Could not fetch GBP account ID:", err.message);
      // Non-fatal -- we still store the tokens
    }

    // Store on organizations record
    await db("organizations").where({ id: orgId }).update({
      gbp_access_token: tokens.access_token,
      gbp_refresh_token: tokens.refresh_token || null,
      gbp_account_id: gbpAccountId,
      gbp_connected_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`[GBP-AUTH] Stored GBP tokens for org ${orgId}, account ${gbpAccountId}`);

    // Enqueue PatientPath build
    try {
      const queue = getMindsQueue("patientpath");
      await queue.add(`patientpath:build:${orgId}`, { orgId }, { removeOnComplete: 100, removeOnFail: 50 });
      console.log(`[GBP-AUTH] Enqueued patientpath:build:${orgId}`);
    } catch (err: any) {
      console.warn("[GBP-AUTH] Failed to enqueue PatientPath build:", err.message);
    }

    // Trigger first ranking snapshot immediately -- don't make them wait until Sunday
    try {
      const { generateSnapshotForOrg } = await import("../../services/rankingsIntelligence");
      await generateSnapshotForOrg(orgId);
      console.log(`[GBP-AUTH] First ranking snapshot generated for org ${orgId}`);
    } catch (err: any) {
      console.warn("[GBP-AUTH] Failed to generate ranking snapshot:", err.message);
    }

    return res.redirect("/dashboard?gbp=connected");
  } catch (err: any) {
    console.error("[GBP-AUTH] Callback error:", err.message);
    return res.redirect("/dashboard?gbp=failed");
  }
});

export default router;
