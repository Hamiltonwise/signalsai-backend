import { db } from "../database/connection";

/**
 * GBP Token Refresh Service
 *
 * Google access tokens expire after 1 hour. This service refreshes them
 * daily at 3 AM PT so every doctor's GBP connection stays alive overnight.
 *
 * On revocation: nulls the access token, logs a behavioral event, and
 * creates a dream_team_task for Jo to follow up.
 */

interface RefreshResult {
  orgId: number;
  success: boolean;
  error?: string;
}

/**
 * Refresh a single org's GBP access token using its stored refresh token.
 */
export async function refreshGbpToken(orgId: number): Promise<RefreshResult> {
  const org = await db("organizations")
    .where({ id: orgId })
    .select("id", "name", "gbp_refresh_token", "gbp_access_token")
    .first();

  if (!org?.gbp_refresh_token) {
    return { orgId, success: false, error: "No refresh token stored" };
  }

  const clientId = process.env.GBP_CLIENT_ID;
  const clientSecret = process.env.GBP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { orgId, success: false, error: "Missing GBP_CLIENT_ID or GBP_CLIENT_SECRET env vars" };
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: org.gbp_refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const isRevoked = body.includes("invalid_grant") || body.includes("Token has been revoked");

      if (isRevoked) {
        await handleTokenRevoked(orgId, org.name);
        return { orgId, success: false, error: "Refresh token revoked" };
      }

      return { orgId, success: false, error: `Google API error ${res.status}: ${body}` };
    }

    const tokens = await res.json();

    await db("organizations").where({ id: orgId }).update({
      gbp_access_token: tokens.access_token,
      gbp_connected_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`[GBP-REFRESH] Refreshed token for org ${orgId}`);
    return { orgId, success: true };
  } catch (err: any) {
    console.error(`[GBP-REFRESH] Error refreshing org ${orgId}:`, err.message);
    return { orgId, success: false, error: err.message };
  }
}

/**
 * When a refresh token is revoked by the user in Google settings:
 * 1. Null the access token (connection is broken)
 * 2. Log behavioral_event for audit trail
 * 3. Create dream_team_task for Jo to reach out
 */
async function handleTokenRevoked(orgId: number, practiceName: string): Promise<void> {
  console.warn(`[GBP-REFRESH] Token revoked for org ${orgId} (${practiceName})`);

  await db("organizations").where({ id: orgId }).update({
    gbp_access_token: null,
    updated_at: new Date(),
  });

  await db("behavioral_events").insert({
    event_type: "gbp.token_revoked",
    org_id: orgId,
    properties: JSON.stringify({
      practice_name: practiceName,
      revoked_at: new Date().toISOString(),
    }),
  });

  await db("dream_team_tasks").insert({
    owner_name: "Jo",
    title: `GBP disconnected -- ${practiceName} needs to reconnect`,
    description: `Org ${orgId} (${practiceName}) had their GBP refresh token revoked. They need to reconnect via Settings > Integrations. Reach out to confirm they still want GBP monitoring active.`,
    status: "open",
    priority: "high",
    source_type: "gbp_refresh",
  });
}

/**
 * Refresh all orgs that have a GBP access token.
 * Called by the daily 3 AM PT BullMQ cron.
 */
export async function refreshAllGbpTokens(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  revoked: number;
  results: RefreshResult[];
}> {
  const orgs = await db("organizations")
    .whereNotNull("gbp_access_token")
    .select("id");

  console.log(`[GBP-REFRESH] Starting daily refresh for ${orgs.length} orgs`);

  const results: RefreshResult[] = [];

  for (const org of orgs) {
    const result = await refreshGbpToken(org.id);
    results.push(result);
  }

  const succeeded = results.filter((r) => r.success).length;
  const revoked = results.filter((r) => r.error === "Refresh token revoked").length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `[GBP-REFRESH] Daily refresh complete: ${succeeded}/${orgs.length} succeeded, ${revoked} revoked, ${failed - revoked} errors`,
  );

  return { total: orgs.length, succeeded, failed, revoked, results };
}
