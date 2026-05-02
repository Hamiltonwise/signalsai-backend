/**
 * Sandbox Card Inbox -- Notion Writer
 *
 * Idempotent writer for the "Sandbox Card Inbox" Notion database
 * (https://www.notion.so/p/ddac061f88fe4f5e9863d5be2449cf81).
 *
 * Each row = one functional-area card from a CC sandbox session.
 * Bridge Translator session mode calls upsertCard() per card. Same Card ID
 * rewrites in place rather than creating a duplicate.
 *
 * The data source ID is loaded from env (SANDBOX_CARD_INBOX_DATA_SOURCE_ID)
 * with a fallback constant pointing at the live source. Authentication is
 * via the standard NOTION_TOKEN env var (same key used by service.notion-client).
 */

import axios, { AxiosError } from "axios";
import type { Card } from "./bridgeTranslator";
import type { ReviewerResult } from "./reviewerClaude";

// ── Constants ──────────────────────────────────────────────────────

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/**
 * The "Sandbox Card Inbox" data source ID, created May 1 2026 under
 * CC Operating Space. Override via env if a future migration moves it.
 */
export const DEFAULT_SANDBOX_INBOX_DATA_SOURCE_ID =
  "49b3e4ee-bc8b-44ae-8567-abeff1b6c54c";

/**
 * Database ID (different from data source ID). The data-source query API
 * uses the data source ID; the page-create API uses the database (parent) ID.
 */
export const DEFAULT_SANDBOX_INBOX_DATABASE_ID =
  "ddac061f-88fe-4f5e-9863-d5be2449cf81";

/** Functional-area select option keys allowed by the database schema. */
export type FunctionalArea =
  | "dashboard"
  | "patientpath"
  | "narrator"
  | "weekly_digest"
  | "schema_bake"
  | "vocabulary"
  | "economic_calc"
  | "watcher"
  | "referrals_pms"
  | "infrastructure"
  | "reviewer_gate"
  | "other";

/** Mapping from Bridge Translator functional area key to inbox FunctionalArea. */
const FUNCTIONAL_AREA_MAP: Record<string, FunctionalArea> = {
  customer_pages: "dashboard",
  patientpath: "patientpath",
  practice_analyzer: "dashboard",
  referrals_pms: "referrals_pms",
  monday_email: "weekly_digest",
  gbp: "infrastructure",
  gsc: "infrastructure",
  dream_team: "watcher",
  reviewer_gate: "reviewer_gate",
  migrations: "schema_bake",
  infrastructure: "infrastructure",
};

export function mapFunctionalArea(bridgeAreaKey: string): FunctionalArea {
  return FUNCTIONAL_AREA_MAP[bridgeAreaKey] || "other";
}

// ── Types ──────────────────────────────────────────────────────────

export interface UpsertCardInput {
  card: Card;
  /** Stable Card ID. Same ID = update in place. */
  cardId: string;
  functionalArea: FunctionalArea;
  reviewerResult?: ReviewerResult;
  /** URL to the audit log file (e.g. migration-manifest-deltas/2026-05-02.md). */
  auditLogUrl?: string;
  /** Pre-rendered card body (full V2 format). Trimmed to 1900 chars for Notion limits. */
  cardBody: string;
  sourceCommits: string[];
  /** Source-commits string override. If provided, used verbatim. */
  sourceCommitsOverride?: string;
}

export interface UpsertCardResult {
  status: "created" | "updated";
  pageId: string;
  pageUrl: string;
  cardId: string;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Find an existing inbox row by Card ID. Returns null if no match.
 */
export async function findCardByCardId(
  cardId: string,
): Promise<{ pageId: string; pageUrl: string } | null> {
  const dataSourceId =
    process.env.SANDBOX_CARD_INBOX_DATA_SOURCE_ID ||
    DEFAULT_SANDBOX_INBOX_DATA_SOURCE_ID;

  // The Notion API exposes data sources at /v1/databases/{id}/query.
  // Despite the name, we pass the data source ID — for single-source
  // databases, the database ID and data source ID are interchangeable on
  // the query endpoint. We use the data source ID for forward-compatibility
  // with multi-source databases.
  const url = `${NOTION_API_BASE}/databases/${dataSourceId}/query`;

  try {
    const response = await axios.post(
      url,
      {
        filter: {
          property: "Card ID",
          rich_text: { equals: cardId },
        },
        page_size: 1,
      },
      { headers: notionHeaders() },
    );

    const results = (response.data?.results || []) as Array<{
      id: string;
      url: string;
    }>;
    if (results.length === 0) return null;
    return { pageId: results[0].id, pageUrl: results[0].url };
  } catch (err) {
    logNotionError("findCardByCardId", err);
    return null;
  }
}

/**
 * Idempotent upsert. Same Card ID = update in place. New ID = create.
 */
export async function upsertCard(
  input: UpsertCardInput,
): Promise<UpsertCardResult> {
  const databaseId =
    process.env.SANDBOX_CARD_INBOX_DATABASE_ID ||
    DEFAULT_SANDBOX_INBOX_DATABASE_ID;

  const properties = composeProperties(input);
  const existing = await findCardByCardId(input.cardId);

  if (existing) {
    return updateExistingPage(existing.pageId, properties, input.cardId);
  }
  return createNewPage(databaseId, properties, input);
}

/**
 * Build a stable Card ID from a session date and functional area.
 * Pattern: sandbox-YYYY-MM-DD-<area_key>.
 */
export function buildCardId(
  sessionDate: string,
  bridgeAreaKey: string,
): string {
  const date = sessionDate.split("T")[0];
  return `sandbox-${date}-${bridgeAreaKey}`;
}

// ── Internals ──────────────────────────────────────────────────────

function notionHeaders(): Record<string, string> {
  const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error(
      "[SandboxCardInbox] NOTION_TOKEN (or NOTION_API_KEY) env var is required to write cards.",
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function composeProperties(input: UpsertCardInput): Record<string, unknown> {
  const { card, cardId, functionalArea, reviewerResult } = input;

  const verdict = reviewerResult?.verdict || "Not Yet Run";
  const verdictOption: Record<string, string> = {
    PASS: "PASS",
    PASS_WITH_CONCERNS: "PASS_WITH_CONCERNS",
    BLOCK: "BLOCK",
    "Not Yet Run": "Not Yet Run",
  };

  const confidenceOption: Record<string, string> = {
    Green: "🟢 Green",
    Yellow: "🟡 Yellow",
    Red: "🔴 Red",
  };

  const sourceCommitsString =
    input.sourceCommitsOverride ?? input.sourceCommits.join(", ");

  const cardBodyTrimmed = truncateForNotion(input.cardBody, 1900);

  // Notion property payload uses the rich-text array shape for text fields.
  const props: Record<string, unknown> = {
    Title: {
      title: [
        {
          type: "text",
          text: { content: `Card ${card.number}: ${card.title}` },
        },
      ],
    },
    "Card ID": richText(cardId),
    "Functional Area": { select: { name: functionalArea } },
    // Status (legacy, Build B) and State (canonical, Build C state machine)
    // are written together on initial upsert. Status mirrors the legacy
    // subset; State is the source of truth for the 10-state machine. Both
    // start at "New"; downstream transitions (transitionCard) advance State,
    // and the Build B Jo morning routine still reads Status for backward
    // compatibility until that page is migrated.
    Status: { select: { name: "New" } },
    State: { select: { name: "New" } },
    Confidence: {
      select: { name: confidenceOption[card.blastRadius] || "🟡 Yellow" },
    },
    "Reviewer Gate Verdict": {
      select: { name: verdictOption[verdict] || "Not Yet Run" },
    },
    "Source Commits": richText(sourceCommitsString),
    "Card Body": richText(cardBodyTrimmed),
  };

  if (input.auditLogUrl) {
    props["Linked Audit Log"] = { url: input.auditLogUrl };
  }

  return props;
}

function richText(content: string): Record<string, unknown> {
  return {
    rich_text: [
      {
        type: "text",
        text: { content: truncateForNotion(content, 1900) },
      },
    ],
  };
}

/**
 * Notion rich-text values cap at 2000 characters per item. Trim conservatively.
 */
function truncateForNotion(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 12) + "\n[truncated]";
}

async function createNewPage(
  databaseId: string,
  properties: Record<string, unknown>,
  input: UpsertCardInput,
): Promise<UpsertCardResult> {
  const url = `${NOTION_API_BASE}/pages`;
  const body = {
    parent: { database_id: databaseId },
    properties,
    children: cardBodyChildren(input),
  };

  try {
    const response = await axios.post(url, body, { headers: notionHeaders() });
    return {
      status: "created",
      pageId: response.data.id,
      pageUrl: response.data.url,
      cardId: input.cardId,
    };
  } catch (err) {
    logNotionError("createNewPage", err);
    throw err;
  }
}

async function updateExistingPage(
  pageId: string,
  properties: Record<string, unknown>,
  cardId: string,
): Promise<UpsertCardResult> {
  const url = `${NOTION_API_BASE}/pages/${pageId}`;
  // Strip Status AND State from the update set — only set them on creation.
  // Once a transition has advanced the card past "New" (Jo Reviewed, Dave
  // Queued, Reviewer Blocked, etc.), a re-run of the inbox writer must not
  // reset the workflow position. Build C's state machine owns State;
  // Build B's legacy Jo routine reads Status. Both are write-once-on-create.
  const safeProps = { ...properties };
  delete (safeProps as Record<string, unknown>).Status;
  delete (safeProps as Record<string, unknown>).State;

  try {
    const response = await axios.patch(
      url,
      { properties: safeProps },
      { headers: notionHeaders() },
    );
    return {
      status: "updated",
      pageId: response.data.id,
      pageUrl: response.data.url,
      cardId,
    };
  } catch (err) {
    logNotionError("updateExistingPage", err);
    throw err;
  }
}

/**
 * Page body content for new cards. Includes the V2 card format and the
 * reviewer pass markdown (if available). Notion accepts paragraph blocks
 * with rich-text content up to 2000 chars per text item.
 */
function cardBodyChildren(input: UpsertCardInput): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];

  // Section 1: card body (V2 format)
  blocks.push(headingBlock(2, "Card Body (Migration Manifest V2 format)"));
  for (const para of splitForBlocks(input.cardBody, 1900)) {
    blocks.push(paragraphBlock(para));
  }

  return blocks;
}

function headingBlock(level: 1 | 2 | 3, text: string): Record<string, unknown> {
  const type = `heading_${level}` as const;
  return {
    object: "block",
    type,
    [type]: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 1900) } }],
    },
  };
}

function paragraphBlock(text: string): Record<string, unknown> {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function splitForBlocks(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    out.push(s.slice(i, i + max));
    i += max;
  }
  return out;
}

function logNotionError(label: string, err: unknown): void {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError;
    console.error(
      `[SandboxCardInbox] ${label} failed:`,
      ax.response?.status,
      ax.response?.data || ax.message,
    );
  } else if (err instanceof Error) {
    console.error(`[SandboxCardInbox] ${label} failed:`, err.message);
  } else {
    console.error(`[SandboxCardInbox] ${label} failed:`, String(err));
  }
}
