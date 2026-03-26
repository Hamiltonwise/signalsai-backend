/**
 * syncAgentRegistry.ts
 *
 * One-time script that reads all .claude/agents/*.md files and creates
 * or updates entries in the Notion Agent Registry database.
 *
 * Usage: npm run sync:agents
 * Requires: NOTION_API_KEY env var
 *
 * Rules:
 * - Status always set to Draft (never auto-promotes)
 * - Phase always P1 Foundation for new agents
 * - Never deletes existing Registry entries
 * - Only creates new entries or updates Notes/Status on existing ones
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const REGISTRY_DB_ID = "281fdaf120c4805dac7aeda69dfa0b44";
const AGENTS_DIR = path.resolve(__dirname, "../../.claude/agents");

// ── Agent type mapping ───────────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
  "cs-agent": "Hospitality",
  "cs-coach-agent": "Hospitality",
  "cs-expander-agent": "Hospitality",
  "cs-pulse-agent": "Hospitality",
  "account-health-agent": "Hospitality",
  "intelligence-agent": "Internal",
  "competitive-intel-agent": "Internal",
  "orchestrator-agent": "Internal",
  "cmo-agent": "Growth",
  "cro-agent": "Growth",
  "content-agent": "Growth",
  "aeo-monitor-agent": "Growth",
  "cfo-agent": "Infra & Compliance",
  "clo-agent": "Infra & Compliance",
  "safety-agent": "Infra & Compliance",
  "patientpath-research-agent": "Doctor-Facing",
  "patientpath-copy-agent": "Doctor-Facing",
  "weekly-digest-agent": "Operate",
};

// CS/client-facing agents get Weekly review, others Monthly
const WEEKLY_REVIEW_AGENTS = new Set([
  "cs-agent",
  "cs-coach-agent",
  "cs-expander-agent",
  "cs-pulse-agent",
  "account-health-agent",
  "patientpath-research-agent",
  "patientpath-copy-agent",
]);

// ── Helpers ──────────────────────────────────────────────────────

function extractMandate(content: string): string {
  const mandateMatch = content.match(/## Mandate\n(.+)/);
  if (mandateMatch) return mandateMatch[1].trim();
  // Fallback: first non-heading, non-empty line
  const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  return lines[0]?.trim() || "No mandate found";
}

function checkMutatesExternal(content: string): boolean {
  const lc = content.toLowerCase();
  return (
    lc.includes("#alloro-") ||
    lc.includes("slack") ||
    lc.includes("dream_team_task") ||
    lc.includes("dream team task")
  );
}

// ── Notion API helpers ───────────────────────────────────────────

async function notionFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status}: ${body}`);
  }

  return res.json();
}

async function queryRegistryByName(name: string): Promise<any | null> {
  const data = await notionFetch(`/databases/${REGISTRY_DB_ID}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        property: "Name",
        title: { equals: name },
      },
    }),
  });

  return data.results?.[0] || null;
}

async function createRegistryEntry(params: {
  name: string;
  type: string;
  notes: string;
  mutatesExternal: boolean;
  reviewCadence: string;
}): Promise<void> {
  await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: REGISTRY_DB_ID },
      properties: {
        Name: { title: [{ text: { content: params.name } }] },
        Status: { status: { name: "Draft" } },
        Phase: { select: { name: "P1 Foundation" } },
        Type: { select: { name: params.type } },
        Notes: { rich_text: [{ text: { content: params.notes.substring(0, 2000) } }] },
        "Mutates External Systems": { checkbox: params.mutatesExternal },
        "Review Cadence": { select: { name: params.reviewCadence } },
      },
    }),
  });
}

async function updateRegistryEntry(pageId: string, notes: string): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Notes: { rich_text: [{ text: { content: notes.substring(0, 2000) } }] },
      },
    }),
  });
}

// ── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!NOTION_API_KEY) {
    console.error("Missing NOTION_API_KEY env var. Set it in .env and retry.");
    process.exit(1);
  }

  if (!fs.existsSync(AGENTS_DIR)) {
    console.error(`Agents directory not found: ${AGENTS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  console.log(`[SYNC] Found ${files.length} agent files in ${AGENTS_DIR}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const agentName = file.replace(".md", "");
    const filePath = path.join(AGENTS_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    const mandate = extractMandate(content);
    const type = TYPE_MAP[agentName] || "Internal";
    const mutates = checkMutatesExternal(content);
    const cadence = WEEKLY_REVIEW_AGENTS.has(agentName) ? "Weekly" : "Monthly";

    // Human-readable name: cs-agent -> CS Agent
    const displayName = agentName
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    try {
      const existing = await queryRegistryByName(displayName);

      if (existing) {
        // Update Notes only (never overwrite Status/Phase)
        await updateRegistryEntry(existing.id, mandate);
        console.log(`  [UPDATE] ${displayName} -- notes updated`);
        updated++;
      } else {
        await createRegistryEntry({
          name: displayName,
          type,
          notes: mandate,
          mutatesExternal: mutates,
          reviewCadence: cadence,
        });
        console.log(`  [CREATE] ${displayName} -- ${type}, ${cadence}, mutates=${mutates}`);
        created++;
      }
    } catch (err: any) {
      console.error(`  [ERROR] ${displayName}: ${err.message}`);
      skipped++;
    }

    // Small delay to respect Notion rate limits
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\n[SYNC] Done: ${created} created, ${updated} updated, ${skipped} errors`);
}

main().catch((err) => {
  console.error("[SYNC] Fatal error:", err);
  process.exit(1);
});
