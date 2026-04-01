/**
 * HubSpot CRM Integration -- OAuth + Read-Only Pipeline Sync
 *
 * GET  /api/integrations/hubspot/connect    -- redirect to HubSpot OAuth
 * GET  /api/integrations/hubspot/callback   -- handle OAuth callback
 * GET  /api/integrations/hubspot/status     -- connection status
 * GET  /api/integrations/hubspot/deals      -- fetch pipeline deals
 * GET  /api/integrations/hubspot/deal/:id   -- single deal with contacts
 * DELETE /api/integrations/hubspot/disconnect -- remove connection
 */

import express from "express";
import crypto from "crypto";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const hubspotRoutes = express.Router();

// HubSpot OAuth config
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID || "";
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET || "";
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || "http://localhost:3000/api/integrations/hubspot/callback";

// Read-only scopes only
const SCOPES = [
  "crm.objects.deals.read",
  "crm.objects.contacts.read",
  "crm.objects.companies.read",
  "crm.schemas.deals.read",
  "crm.schemas.contacts.read",
].join(" ");

/**
 * Refresh access token if expired (tokens last 30 minutes)
 */
async function getValidAccessToken(orgId: number): Promise<string | null> {
  const conn = await db("hubspot_connections").where({ organization_id: orgId }).first();
  if (!conn) return null;

  const expiresAt = new Date(conn.token_expires_at);
  const now = new Date();

  // Refresh if token expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    try {
      const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: HUBSPOT_CLIENT_ID,
          client_secret: HUBSPOT_CLIENT_SECRET,
          refresh_token: conn.refresh_token,
        }),
      });

      if (!response.ok) {
        console.error("[HubSpot] Token refresh failed:", response.status);
        return null;
      }

      const tokens = await response.json();
      await db("hubspot_connections").where({ organization_id: orgId }).update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
        updated_at: new Date(),
      });

      return tokens.access_token;
    } catch (err) {
      console.error("[HubSpot] Token refresh error:", err);
      return null;
    }
  }

  return conn.access_token;
}

/**
 * GET /connect -- Redirect user to HubSpot OAuth
 */
hubspotRoutes.get(
  "/connect",
  authenticateToken,
  rbacMiddleware,
  (req: RBACRequest, res) => {
    const state = crypto.randomBytes(16).toString("hex");

    // Store state in session for CSRF protection
    // Using a simple approach: encode orgId in state
    const statePayload = `${req.organizationId}:${state}`;

    const authUrl = new URL("https://app.hubspot.com/oauth/authorize");
    authUrl.searchParams.set("client_id", HUBSPOT_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", HUBSPOT_REDIRECT_URI);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("state", statePayload);

    return res.json({ success: true, authUrl: authUrl.toString() });
  }
);

/**
 * GET /callback -- Handle OAuth callback from HubSpot
 */
hubspotRoutes.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing code or state parameter");
    }

    // Parse org ID from state
    const stateStr = String(state);
    const orgId = parseInt(stateStr.split(":")[0], 10);
    if (!orgId || isNaN(orgId)) {
      return res.status(400).send("Invalid state parameter");
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        redirect_uri: HUBSPOT_REDIRECT_URI,
        code: String(code),
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error("[HubSpot] Token exchange failed:", err);
      return res.status(500).send("Failed to connect HubSpot");
    }

    const tokens = await tokenResponse.json();

    // Get HubSpot account info
    const infoResponse = await fetch(
      `https://api.hubapi.com/oauth/v1/access-tokens/${tokens.access_token}`
    );
    const info = infoResponse.ok ? await infoResponse.json() : {};

    // Upsert connection
    const existing = await db("hubspot_connections").where({ organization_id: orgId }).first();
    const connectionData = {
      organization_id: orgId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      hub_id: info.hub_id || null,
      hub_domain: info.hub_domain || null,
      scopes: SCOPES,
      updated_at: new Date(),
    };

    if (existing) {
      await db("hubspot_connections").where({ organization_id: orgId }).update(connectionData);
    } else {
      await db("hubspot_connections").insert({ ...connectionData, created_at: new Date() });
    }

    console.log(`[HubSpot] Connected org ${orgId} to hub ${info.hub_id}`);

    // Redirect back to settings page
    const frontendUrl = process.env.NODE_ENV === "production"
      ? "https://getalloro.com/settings/integrations?hubspot=connected"
      : "http://localhost:5174/settings/integrations?hubspot=connected";
    return res.redirect(frontendUrl);
  } catch (error: any) {
    console.error("[HubSpot] Callback error:", error.message);
    return res.status(500).send("Connection failed. Please try again.");
  }
});

/**
 * GET /status -- Check if HubSpot is connected
 */
hubspotRoutes.get(
  "/status",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const conn = await db("hubspot_connections").where({ organization_id: orgId }).first();

      if (!conn) {
        return res.json({ success: true, connected: false });
      }

      return res.json({
        success: true,
        connected: true,
        hubId: conn.hub_id,
        hubDomain: conn.hub_domain,
        connectedAt: conn.created_at,
      });
    } catch (error: any) {
      console.error("[HubSpot] Status error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to check status" });
    }
  }
);

/**
 * GET /deals -- Fetch pipeline deals
 */
hubspotRoutes.get(
  "/deals",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const accessToken = await getValidAccessToken(orgId);
      if (!accessToken) {
        return res.status(401).json({ success: false, error: "HubSpot not connected" });
      }

      // Fetch pipelines first (for stage name mapping)
      const pipelinesRes = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let stageMap: Record<string, string> = {};
      if (pipelinesRes.ok) {
        const pipelines = await pipelinesRes.json();
        for (const pipeline of pipelines.results || []) {
          for (const stage of pipeline.stages || []) {
            stageMap[stage.id] = stage.label;
          }
        }
      }

      // Fetch deals with properties and contact associations
      const properties = "dealname,amount,dealstage,pipeline,closedate,hubspot_owner_id,hs_lastmodifieddate";
      const dealsRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/deals?limit=50&properties=${properties}&associations=contacts`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!dealsRes.ok) {
        console.error("[HubSpot] Deals fetch failed:", dealsRes.status);
        return res.status(502).json({ success: false, error: "Failed to fetch deals" });
      }

      const dealsData = await dealsRes.json();

      // Map deals to a clean format
      const deals = (dealsData.results || []).map((deal: any) => ({
        id: deal.id,
        name: deal.properties.dealname,
        amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
        stage: stageMap[deal.properties.dealstage] || deal.properties.dealstage,
        stageId: deal.properties.dealstage,
        pipeline: deal.properties.pipeline,
        closeDate: deal.properties.closedate,
        lastModified: deal.properties.hs_lastmodifieddate,
        contactIds: (deal.associations?.contacts?.results || []).map((c: any) => c.id),
      }));

      return res.json({ success: true, deals, totalCount: dealsData.total || deals.length });
    } catch (error: any) {
      console.error("[HubSpot] Deals error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch deals" });
    }
  }
);

/**
 * GET /deal/:dealId -- Single deal with full contact details
 */
hubspotRoutes.get(
  "/deal/:dealId",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const accessToken = await getValidAccessToken(orgId);
      if (!accessToken) {
        return res.status(401).json({ success: false, error: "HubSpot not connected" });
      }

      const { dealId } = req.params;

      // Fetch deal with associations
      const dealRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealname,amount,dealstage,pipeline,closedate,notes_last_updated&associations=contacts,companies`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!dealRes.ok) {
        return res.status(404).json({ success: false, error: "Deal not found" });
      }

      const deal = await dealRes.json();

      // Batch fetch associated contacts
      const contactIds = (deal.associations?.contacts?.results || []).map((c: any) => c.id);
      let contacts: any[] = [];

      if (contactIds.length > 0) {
        const contactsRes = await fetch(
          "https://api.hubapi.com/crm/v3/objects/contacts/batch/read",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: contactIds.map((id: string) => ({ id })),
              properties: ["firstname", "lastname", "email", "phone", "company", "jobtitle"],
            }),
          }
        );

        if (contactsRes.ok) {
          const contactsData = await contactsRes.json();
          contacts = (contactsData.results || []).map((c: any) => ({
            id: c.id,
            firstName: c.properties.firstname,
            lastName: c.properties.lastname,
            email: c.properties.email,
            phone: c.properties.phone,
            company: c.properties.company,
            jobTitle: c.properties.jobtitle,
          }));
        }
      }

      return res.json({
        success: true,
        deal: {
          id: deal.id,
          name: deal.properties.dealname,
          amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
          stage: deal.properties.dealstage,
          pipeline: deal.properties.pipeline,
          closeDate: deal.properties.closedate,
        },
        contacts,
      });
    } catch (error: any) {
      console.error("[HubSpot] Deal detail error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch deal" });
    }
  }
);

/**
 * DELETE /disconnect -- Remove HubSpot connection
 */
hubspotRoutes.delete(
  "/disconnect",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      await db("hubspot_connections").where({ organization_id: orgId }).del();
      console.log(`[HubSpot] Disconnected org ${orgId}`);

      return res.json({ success: true });
    } catch (error: any) {
      console.error("[HubSpot] Disconnect error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to disconnect" });
    }
  }
);

export default hubspotRoutes;
