/**
 * Notion Blackboard State Transition Layer (Build C)
 *
 * Every Dave-facing card moves through an explicit state machine. Every
 * transition writes one row to the State Transition Log and updates the
 * card's State, State History, Last Transition Actor, and Last Transition At
 * fields on the Sandbox Card Inbox.
 *
 * The state machine is the audit trail. Invalid transitions are rejected
 * before any Notion write occurs.
 *
 * State graph:
 *   New -> Reviewer Gated | Rejected | Archived
 *   Reviewer Gated -> Jo Reviewed | Reviewer Blocked | Rejected | Archived
 *   Reviewer Blocked -> Reviewer Gated | Jo Reviewed | Rejected | Archived
 *   Jo Reviewed -> Dave Queued | Rejected | Archived
 *   Dave Queued -> Dave In Progress | Rejected | Archived
 *   Dave In Progress -> Dave Shipped | Rejected | Archived
 *   Dave Shipped -> Verified | Rejected | Archived
 *   Verified -> Archived
 *   Rejected -> Archived
 *   Archived -> (terminal)
 *
 * Reviewer Blocked auto-pings Corey via the dream_team_tasks queue (the
 * existing path that drives the #alloro-dev signal channel).
 *
 * Companion docs:
 *   - src/services/agents/sandboxCardInbox.ts (the row writer)
 *   - src/services/agents/reviewerClaude.ts (the verdict source)
 *   - src/services/agents/bridgeTranslator.ts (the card source)
 */

import axios, { AxiosError } from "axios";
import { db } from "../../database/connection";

// -- Notion endpoints --------------------------------------------------

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// -- Database identifiers (Build C, May 2 2026) ------------------------

export const DEFAULT_STATE_TRANSITION_LOG_DATABASE_ID =
  "5785db54-467a-4505-9b3b-53673c940cdb";
export const DEFAULT_STATE_TRANSITION_LOG_DATA_SOURCE_ID =
  "7a69649f-89d3-4dc1-be4c-c3c6e8f63978";

// Reviewer Gate Audit Log: canonical Build A database. The previous Build C
// duplicate (72684b12-...) is retired; all live verdicts (including the
// April 27 calibration entry and the May 2 backfill reconciliation) live
// in 354fdaf1-... per the audit verification on May 2 2026.
export const DEFAULT_REVIEWER_GATE_AUDIT_LOG_DATABASE_ID =
  "354fdaf1-20c4-8196-9373-d78eedc29172";
export const DEFAULT_REVIEWER_GATE_AUDIT_LOG_DATA_SOURCE_ID =
  "1d9d5466-3d90-423d-b5f4-205b1ef4208c";

export const DEFAULT_DAVE_SPRINT_INBOX_DATABASE_ID =
  "c7262a4c-2272-4e23-a79f-8929d7e8d793";
export const DEFAULT_DAVE_SPRINT_INBOX_DATA_SOURCE_ID =
  "642858d9-1ba7-434f-92a0-5dae615741df";

export const DEFAULT_SANDBOX_CARD_INBOX_DATABASE_ID =
  "ddac061f-88fe-4f5e-9863-d5be2449cf81";
export const DEFAULT_SANDBOX_CARD_INBOX_DATA_SOURCE_ID =
  "49b3e4ee-bc8b-44ae-8567-abeff1b6c54c";

// -- Types --------------------------------------------------------------

export type CardState =
  | "New"
  | "Reviewer Gated"
  | "Reviewer Blocked"
  | "Jo Reviewed"
  | "Dave Queued"
  | "Dave In Progress"
  | "Dave Shipped"
  | "Verified"
  | "Rejected"
  | "Archived";

export type Actor =
  | "Corey"
  | "Jo"
  | "Dave"
  | "CC"
  | "ReviewerClaude"
  | "BridgeTranslator"
  | "CronVerifier"
  | "GitHook";

export interface TransitionInput {
  cardId: string;
  toState: CardState;
  actor: Actor;
  reason: string;
  linkedArtifacts?: string[];
  /** When set, used as the from-state without re-reading Notion (used by backfill / tests). */
  fromStateOverride?: CardState | "Initial";
}

export interface TransitionResult {
  success: boolean;
  transitionLogId: string;
  cardPageId?: string;
  fromState?: CardState | "Initial";
  toState?: CardState;
  error?: string;
}

// -- State machine ------------------------------------------------------

const TERMINAL_STATES: ReadonlySet<CardState> = new Set(["Archived"]);

/**
 * Allowed transitions per from-state. "Initial" is a synthetic state used
 * when a card has no prior State row (first transition into the system).
 *
 * Rejection and archival are allowed from any non-terminal state -- they
 * are added programmatically below to keep the table readable.
 */
const ALLOWED_TRANSITIONS_RAW: Record<CardState | "Initial", CardState[]> = {
  Initial: ["New", "Reviewer Gated", "Reviewer Blocked", "Jo Reviewed", "Dave Queued", "Dave In Progress", "Dave Shipped", "Verified"],
  New: ["Reviewer Gated"],
  "Reviewer Gated": ["Jo Reviewed", "Reviewer Blocked"],
  "Reviewer Blocked": ["Reviewer Gated", "Jo Reviewed"],
  "Jo Reviewed": ["Dave Queued"],
  "Dave Queued": ["Dave In Progress"],
  "Dave In Progress": ["Dave Shipped"],
  "Dave Shipped": ["Verified"],
  Verified: [],
  Rejected: [],
  Archived: [],
};

/**
 * Resolve the full set of allowed next-states for a given from-state.
 * Rejected and Archived are reachable from any non-terminal state.
 */
function allowedNext(from: CardState | "Initial"): Set<CardState> {
  const base = new Set<CardState>(ALLOWED_TRANSITIONS_RAW[from] || []);
  if (!TERMINAL_STATES.has(from as CardState)) {
    base.add("Rejected");
    base.add("Archived");
  }
  // Rejected -> Archived only (already in TERMINAL_STATES handling above).
  if (from === "Rejected") {
    base.add("Archived");
  }
  if (from === "Verified") {
    base.add("Archived");
  }
  return base;
}

export function isTransitionAllowed(
  from: CardState | "Initial",
  to: CardState,
): boolean {
  return allowedNext(from).has(to);
}

// -- Public API ---------------------------------------------------------

/**
 * Validate and execute a state transition. Writes one row to the State
 * Transition Log on success and updates the card's State / State History /
 * Last Transition fields on the Sandbox Card Inbox.
 *
 * Invalid transitions return success=false with an explicit error string.
 * The Notion log is never written for invalid transitions.
 */
export async function transitionCard(
  input: TransitionInput,
): Promise<TransitionResult> {
  const {
    cardId,
    toState,
    actor,
    reason,
    linkedArtifacts = [],
    fromStateOverride,
  } = input;

  if (!cardId || cardId.trim().length === 0) {
    return {
      success: false,
      transitionLogId: "",
      error: "cardId is required",
    };
  }

  if (!reason || reason.trim().length === 0) {
    return {
      success: false,
      transitionLogId: "",
      error: "reason is required for every transition (audit trail integrity)",
    };
  }

  // Step 1: resolve the current state of the card.
  const card = await findCardByCardId(cardId);
  let fromState: CardState | "Initial" = "Initial";
  if (fromStateOverride) {
    fromState = fromStateOverride;
  } else if (card?.state) {
    fromState = card.state;
  }

  // Step 2: validate against the state machine.
  if (!isTransitionAllowed(fromState, toState)) {
    const allowed = Array.from(allowedNext(fromState)).join(", ");
    return {
      success: false,
      transitionLogId: "",
      fromState,
      toState,
      error: `Invalid transition: ${fromState} -> ${toState}. Allowed: ${allowed || "(terminal)"}.`,
    };
  }

  const timestamp = new Date().toISOString();

  // Step 3: write the transition log row.
  let transitionLogId = "";
  try {
    transitionLogId = await writeTransitionLogRow({
      cardId,
      cardUrl: card?.url,
      fromState,
      toState,
      actor,
      reason,
      linkedArtifacts,
      timestamp,
    });
  } catch (err) {
    logNotionError("writeTransitionLogRow", err);
    return {
      success: false,
      transitionLogId: "",
      fromState,
      toState,
      error: `Failed to write State Transition Log row: ${formatError(err)}`,
    };
  }

  // Step 4: update the card's State, State History, Last Transition fields.
  if (card?.pageId) {
    try {
      await updateCardState({
        pageId: card.pageId,
        previousHistory: card.stateHistory || "",
        fromState,
        toState,
        actor,
        reason,
        timestamp,
      });
    } catch (err) {
      logNotionError("updateCardState", err);
      // Don't fail the whole transition -- log is the audit trail.
    }
  }

  // Step 5: behavioral_events telemetry (best-effort).
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "blackboard.state_transition",
      properties: JSON.stringify({
        card_id: cardId,
        from_state: fromState,
        to_state: toState,
        actor,
        reason,
        linked_artifacts: linkedArtifacts,
        transition_log_id: transitionLogId,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[StateTransitions] behavioral_events insert failed:",
      message,
    );
  }

  // Step 6: side effect for Reviewer Blocked -- ping Corey.
  if (toState === "Reviewer Blocked") {
    await pingCoreyForReviewerBlocked({
      cardId,
      cardUrl: card?.url,
      reason,
      linkedArtifacts,
    });
  }

  return {
    success: true,
    transitionLogId,
    cardPageId: card?.pageId,
    fromState,
    toState,
  };
}

// -- Sandbox Card Inbox lookup -----------------------------------------

interface CardLookupResult {
  pageId: string;
  url: string;
  state?: CardState;
  stateHistory?: string;
}

/**
 * Find a Sandbox Card Inbox row by Card ID. Returns null if not found or
 * if the Notion call fails.
 */
export async function findCardByCardId(
  cardId: string,
): Promise<CardLookupResult | null> {
  const dataSourceId =
    process.env.SANDBOX_CARD_INBOX_DATA_SOURCE_ID ||
    DEFAULT_SANDBOX_CARD_INBOX_DATA_SOURCE_ID;
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
      properties: Record<string, unknown>;
    }>;
    if (results.length === 0) return null;
    const row = results[0];
    const stateProp = row.properties?.State as
      | { select?: { name?: string } | null }
      | undefined;
    const stateName = stateProp?.select?.name as CardState | undefined;
    const historyProp = row.properties?.["State History"] as
      | { rich_text?: Array<{ plain_text?: string }> }
      | undefined;
    const historyText = (historyProp?.rich_text || [])
      .map((rt) => rt.plain_text || "")
      .join("");
    return {
      pageId: row.id,
      url: row.url,
      state: stateName,
      stateHistory: historyText,
    };
  } catch (err) {
    logNotionError("findCardByCardId", err);
    return null;
  }
}

// -- Transition log writer ---------------------------------------------

interface WriteTransitionLogRowInput {
  cardId: string;
  cardUrl?: string;
  fromState: CardState | "Initial";
  toState: CardState;
  actor: Actor;
  reason: string;
  linkedArtifacts: string[];
  timestamp: string;
}

async function writeTransitionLogRow(
  input: WriteTransitionLogRowInput,
): Promise<string> {
  const databaseId =
    process.env.STATE_TRANSITION_LOG_DATABASE_ID ||
    DEFAULT_STATE_TRANSITION_LOG_DATABASE_ID;

  const url = `${NOTION_API_BASE}/pages`;
  const title = `${input.cardId}: ${input.fromState} -> ${input.toState}`;

  const properties: Record<string, unknown> = {
    Transition: {
      title: [{ type: "text", text: { content: truncate(title, 1900) } }],
    },
    "Card ID": richText(input.cardId),
    "From State": { select: { name: input.fromState } },
    "To State": { select: { name: input.toState } },
    Actor: { select: { name: input.actor } },
    Reason: richText(input.reason),
    "Linked Artifacts": richText(input.linkedArtifacts.join("\n")),
    "Linked Card": richText(input.cardUrl || ""),
    Timestamp: { date: { start: input.timestamp } },
  };

  const response = await axios.post(
    url,
    {
      parent: { database_id: databaseId },
      properties,
    },
    { headers: notionHeaders() },
  );
  return response.data?.id as string;
}

// -- Card row updater --------------------------------------------------

interface UpdateCardStateInput {
  pageId: string;
  previousHistory: string;
  fromState: CardState | "Initial";
  toState: CardState;
  actor: Actor;
  reason: string;
  timestamp: string;
}

async function updateCardState(input: UpdateCardStateInput): Promise<void> {
  const url = `${NOTION_API_BASE}/pages/${input.pageId}`;
  const newEntry = `[${input.timestamp}] ${input.fromState} -> ${input.toState} (${input.actor}): ${input.reason}`;
  const newHistory = input.previousHistory
    ? `${input.previousHistory}\n${newEntry}`
    : newEntry;

  const properties: Record<string, unknown> = {
    State: { select: { name: input.toState } },
    "State History": richText(truncate(newHistory, 1900)),
    "Last Transition At": { date: { start: input.timestamp } },
    "Last Transition Actor": { select: { name: input.actor } },
  };

  await axios.patch(url, { properties }, { headers: notionHeaders() });
}

// -- Side effect: Reviewer Blocked notification ------------------------

async function pingCoreyForReviewerBlocked(input: {
  cardId: string;
  cardUrl?: string;
  reason: string;
  linkedArtifacts: string[];
}): Promise<void> {
  const description = [
    `Card ${input.cardId} entered Reviewer Blocked.`,
    "",
    `Reason: ${input.reason}`,
    input.cardUrl ? `Card URL: ${input.cardUrl}` : "",
    input.linkedArtifacts.length > 0
      ? `Artifacts:\n${input.linkedArtifacts.map((a) => `- ${a}`).join("\n")}`
      : "",
    "",
    "Action: Corey reviews the blocker(s), revises the card, then transitions back to Reviewer Gated for re-review.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await db("dream_team_tasks").insert({
      title: `Reviewer Blocked: ${input.cardId}`,
      description,
      assigned_to: "corey",
      status: "open",
      priority: "high",
      metadata: JSON.stringify({
        source: "blackboard.state_transitions",
        card_id: input.cardId,
        card_url: input.cardUrl,
        slack_channel: "#alloro-dev",
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[StateTransitions] pingCoreyForReviewerBlocked failed:",
      message,
    );
  }
}

// -- Helpers -----------------------------------------------------------

function notionHeaders(): Record<string, string> {
  const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error(
      "[StateTransitions] NOTION_TOKEN (or NOTION_API_KEY) env var is required.",
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function richText(content: string): Record<string, unknown> {
  return {
    rich_text: [
      {
        type: "text",
        text: { content: truncate(content, 1900) },
      },
    ],
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 12) + "\n[truncated]";
}

function formatError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError;
    const data = ax.response?.data;
    return `${ax.response?.status} ${typeof data === "string" ? data : JSON.stringify(data)}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function logNotionError(label: string, err: unknown): void {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError;
    console.error(
      `[StateTransitions] ${label} failed:`,
      ax.response?.status,
      ax.response?.data || ax.message,
    );
  } else if (err instanceof Error) {
    console.error(`[StateTransitions] ${label} failed:`, err.message);
  } else {
    console.error(`[StateTransitions] ${label} failed:`, String(err));
  }
}

// -- Re-exports for tests ----------------------------------------------

export const __test__ = {
  ALLOWED_TRANSITIONS_RAW,
  TERMINAL_STATES,
  allowedNext,
};
