/**
 * Card I — Production Hygiene Scan (May 4 2026).
 *
 * Weekly cron (Monday 03:00 UTC) that scans notification config
 * surfaces for personal-domain test patterns and posts to
 * #alloro-dev when matches are found. Establishes the regression-
 * detection mechanism per Card I step 6.
 *
 * Surfaces scanned:
 *   - location_notification_config.email_addresses (Card H table)
 *   - website_builder.projects.recipients (JSONB)
 *
 * Result is logged to behavioral_events whether or not matches were
 * found, so the absence of an alert is also auditable.
 *
 * Slack post is best-effort. The scan never throws on Slack failure.
 */

import { db } from "../database/connection";

export interface HygieneScanResult {
  matchCount: number;
  matches: Array<{
    surface: string;
    id: string | number;
    addresses: string[];
  }>;
  scannedAt: string;
}

export async function runProductionHygieneScan(): Promise<HygieneScanResult> {
  const matches: HygieneScanResult["matches"] = [];

  const TEST_PATTERNS = ["%@gmail.com", "%@hotmail.com", "%@yahoo.com"];

  // Surface 1: location_notification_config.email_addresses
  try {
    const lnc = await db.raw(
      `SELECT id, email_addresses
         FROM location_notification_config
         WHERE EXISTS (
           SELECT 1 FROM unnest(email_addresses) AS e
           WHERE e ILIKE ANY (?::text[])
         )`,
      [TEST_PATTERNS],
    );
    for (const row of lnc.rows ?? []) {
      const hits = (row.email_addresses ?? []).filter((e: string) =>
        /@(gmail|hotmail|yahoo)\.com$/i.test(e),
      );
      if (hits.length > 0) {
        matches.push({
          surface: "location_notification_config",
          id: row.id,
          addresses: hits,
        });
      }
    }
  } catch (err) {
    console.warn(
      `[productionHygieneScan] location_notification_config scan failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Surface 2: website_builder.projects.recipients (JSONB)
  try {
    const proj = await db.raw(
      `SELECT id, recipients
         FROM website_builder.projects
         WHERE recipients::text ILIKE ANY (?::text[])`,
      [["%@gmail.com%", "%@hotmail.com%", "%@yahoo.com%"]],
    );
    for (const row of proj.rows ?? []) {
      const recipients = Array.isArray(row.recipients)
        ? row.recipients
        : typeof row.recipients === "string"
          ? JSON.parse(row.recipients)
          : [];
      const hits = recipients.filter((e: any) =>
        typeof e === "string" && /@(gmail|hotmail|yahoo)\.com$/i.test(e),
      );
      if (hits.length > 0) {
        matches.push({
          surface: "website_builder.projects.recipients",
          id: row.id,
          addresses: hits,
        });
      }
    }
  } catch (err) {
    console.warn(
      `[productionHygieneScan] projects.recipients scan failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const result: HygieneScanResult = {
    matchCount: matches.length,
    matches,
    scannedAt: new Date().toISOString(),
  };

  // Log result regardless of match count
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "production_hygiene_scan_completed",
      org_id: null,
      properties: db.raw("?::jsonb", [
        JSON.stringify({
          environment: process.env.NODE_ENV ?? "development",
          match_count: result.matchCount,
          matches: result.matches,
        }),
      ]),
      created_at: db.fn.now(),
    });
  } catch {
    /* best effort */
  }

  if (result.matchCount > 0) {
    await postSlackAlert(result);
  }

  return result;
}

async function postSlackAlert(result: HygieneScanResult): Promise<void> {
  const webhook = process.env.SLACK_ALLORO_DEV_WEBHOOK_URL;
  if (!webhook) {
    console.warn(
      `[productionHygieneScan] SLACK_ALLORO_DEV_WEBHOOK_URL not set — skipping Slack post; ${result.matchCount} matches detected`,
    );
    return;
  }
  const summary = result.matches
    .map((m) => `• ${m.surface}#${m.id}: ${m.addresses.join(", ")}`)
    .join("\n");
  const message = `Production hygiene scan found ${result.matchCount} test-pattern email(s) in production:\n${summary}\nInvestigate and clean.`;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, channel: "#alloro-dev" }),
    });
    if (!res.ok) {
      console.warn(
        `[productionHygieneScan] Slack post returned ${res.status}`,
      );
    }
  } catch (err) {
    console.warn(
      `[productionHygieneScan] Slack post failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
