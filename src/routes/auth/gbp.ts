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
      scope: [
        "https://www.googleapis.com/auth/business.manage",
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/webmasters.readonly",
      ],
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

    // Discover GA4 and GSC properties (new scopes)
    try {
      const analyticsAdmin = google.analyticsadmin({ version: "v1beta", auth: oauth2 });
      const accountSummaries = await analyticsAdmin.accountSummaries.list();
      const ga4Properties: any[] = [];
      for (const acct of accountSummaries.data.accountSummaries || []) {
        for (const prop of acct.propertySummaries || []) {
          ga4Properties.push({
            propertyId: prop.property,
            displayName: prop.displayName,
            account: acct.displayName,
          });
        }
      }
      if (ga4Properties.length > 0) {
        console.log(`[GBP-AUTH] Found ${ga4Properties.length} GA4 properties for org ${orgId}`);
      }

      // Also discover GSC sites
      const searchconsole = google.searchconsole({ version: "v1", auth: oauth2 });
      const gscSites: any[] = [];
      try {
        const siteList = await searchconsole.sites.list();
        for (const site of siteList.data.siteEntry || []) {
          gscSites.push({
            siteUrl: site.siteUrl,
            permissionLevel: site.permissionLevel,
          });
        }
        if (gscSites.length > 0) {
          console.log(`[GBP-AUTH] Found ${gscSites.length} GSC sites for org ${orgId}`);
        }
      } catch (gscErr: any) {
        console.warn("[GBP-AUTH] GSC discovery failed:", gscErr.message);
      }

      // Store discovered properties in the connection record (matched by org domain if possible)
      if (ga4Properties.length > 0 || gscSites.length > 0) {
        const existingConn = await db("google_connections").where({ organization_id: orgId }).first();
        if (existingConn) {
          const pids = typeof existingConn.google_property_ids === "string"
            ? JSON.parse(existingConn.google_property_ids)
            : existingConn.google_property_ids || {};

          // Store first GA4 property (or keep existing)
          if (ga4Properties.length > 0 && !pids.ga4) {
            pids.ga4 = { propertyId: ga4Properties[0].propertyId, displayName: ga4Properties[0].displayName };
          }
          // Store first matching GSC site (or keep existing)
          if (gscSites.length > 0 && !pids.gsc) {
            pids.gsc = { siteUrl: gscSites[0].siteUrl, displayName: gscSites[0].siteUrl };
          }

          await db("google_connections").where({ id: existingConn.id }).update({
            google_property_ids: JSON.stringify(pids),
          });
          console.log(`[GBP-AUTH] Updated property IDs for org ${orgId}: GA4=${!!pids.ga4}, GSC=${!!pids.gsc}`);
        }
      }
    } catch (analyticsErr: any) {
      console.warn("[GBP-AUTH] Analytics discovery failed (non-fatal):", analyticsErr.message?.substring(0, 80));
      // Non-fatal: GBP connection still works without GA4/GSC
    }

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
