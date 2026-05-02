/**
 * Done Gate Verifier
 *
 * Nightly cron entry point. Reads cards in "Dave Shipped" state from the
 * Sandbox Card Inbox, attempts to run their Done Gate criteria as automated
 * tests, and transitions to "Verified" on pass.
 *
 * For Done Gates that require manual confirmation (e.g. "Sean logs in and
 * sees X"), generates a verification request entry in the dream_team_tasks
 * queue assigned to Jo. The card stays at "Dave Shipped" until Jo manually
 * triggers the Verified transition.
 *
 * Detection of "automated vs manual" is keyword-based on the Card Body:
 *   automated:  npx tsc --noEmit, knex migrate, vitest, npm run build, curl,
 *               select count(*), bash scripts/, npm test
 *   manual:     "user logs in", "click", "open the page", "Sean", "Corey"
 *
 * This is a Build C scaffolding. The actual test execution against fixtures
 * named in each card is a follow-up; today the cron generates a Jo task for
 * any card it cannot fully verify automatically.
 */

import axios, { AxiosError } from "axios";
import { db } from "../../database/connection";
import {
  transitionCard,
  DEFAULT_SANDBOX_CARD_INBOX_DATA_SOURCE_ID,
  type CardState,
} from "./stateTransitions";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const MANUAL_KEYWORDS: RegExp[] = [
  /\b(?:sean|corey|jo|dave|merideth|user)\s+(?:logs?\s+in|opens?|clicks?|sees?|verifies?)/i,
  /\bopen\s+(?:the\s+)?(?:page|browser|dashboard)/i,
  /\bbrowser\s+smoke/i,
  /\bmanual(?:ly)?\b/i,
];

const AUTOMATED_KEYWORDS: RegExp[] = [
  /npx\s+tsc/i,
  /knex\s+migrate/i,
  /vitest/i,
  /npm\s+(?:run\s+)?(?:test|build)/i,
  /\bcurl\b/i,
  /\bselect\s+count\(/i,
  /bash\s+scripts\//i,
];

export interface DoneGateRunResult {
  totalShipped: number;
  autoVerified: number;
  manualRequested: number;
  errors: string[];
}

export async function runDoneGateVerifierCron(): Promise<DoneGateRunResult> {
  const result: DoneGateRunResult = {
    totalShipped: 0,
    autoVerified: 0,
    manualRequested: 0,
    errors: [],
  };

  let cards: Array<{
    pageId: string;
    pageUrl: string;
    cardId: string;
    cardBody: string;
    title: string;
  }> = [];
  try {
    cards = await fetchShippedCards();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`fetchShippedCards: ${message}`);
    return result;
  }

  result.totalShipped = cards.length;

  for (const card of cards) {
    try {
      const verdict = classifyDoneGate(card.cardBody);

      if (verdict.kind === "automated") {
        // Build C scaffolding: when an automated runner is wired, this would
        // execute the runnable steps in a sandbox and only transition on green.
        // For now, log and skip -- safer to require manual confirmation than
        // to claim verification without the test having actually run.
        const taskId = await createJoVerificationTask({
          card,
          verdictKind: "automated-stub",
          steps: verdict.steps,
        });
        result.manualRequested += 1;
        await transitionAttemptLog(card.cardId, "automated-runner-pending", taskId);
        continue;
      }

      // Manual verification path
      const taskId = await createJoVerificationTask({
        card,
        verdictKind: "manual",
        steps: verdict.steps,
      });
      result.manualRequested += 1;
      await transitionAttemptLog(card.cardId, "manual-verification-requested", taskId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${card.cardId}: ${message}`);
    }
  }

  // Telemetry
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "blackboard.done_gate_cron_run",
      properties: JSON.stringify({
        total_shipped: result.totalShipped,
        auto_verified: result.autoVerified,
        manual_requested: result.manualRequested,
        errors: result.errors,
      }),
      created_at: new Date(),
    });
  } catch {
    // ignore
  }

  return result;
}

/**
 * Manually transition a card to Verified after Jo (or anyone) has confirmed
 * the Done Gate criteria. Exposed for the Jo-confirms path and for tests.
 */
export async function markCardVerified(input: {
  cardId: string;
  reason: string;
  actor?: "Jo" | "CronVerifier" | "Corey";
  linkedArtifacts?: string[];
}): Promise<{ success: boolean; error?: string }> {
  const r = await transitionCard({
    cardId: input.cardId,
    toState: "Verified",
    actor: input.actor || "Jo",
    reason: input.reason,
    linkedArtifacts: input.linkedArtifacts || [],
  });
  return { success: r.success, error: r.error };
}

// -- Internals ---------------------------------------------------------

async function fetchShippedCards(): Promise<
  Array<{
    pageId: string;
    pageUrl: string;
    cardId: string;
    cardBody: string;
    title: string;
  }>
> {
  const dataSourceId =
    process.env.SANDBOX_CARD_INBOX_DATA_SOURCE_ID ||
    DEFAULT_SANDBOX_CARD_INBOX_DATA_SOURCE_ID;
  const url = `${NOTION_API_BASE}/databases/${dataSourceId}/query`;

  const response = await axios.post(
    url,
    {
      filter: {
        property: "State",
        select: { equals: "Dave Shipped" },
      },
      page_size: 100,
    },
    { headers: notionHeaders() },
  );

  const results = (response.data?.results || []) as Array<{
    id: string;
    url: string;
    properties: Record<string, unknown>;
  }>;

  return results.map((row) => {
    const cardIdProp = row.properties?.["Card ID"] as
      | { rich_text?: Array<{ plain_text?: string }> }
      | undefined;
    const cardId = (cardIdProp?.rich_text || [])
      .map((rt) => rt.plain_text || "")
      .join("");
    const bodyProp = row.properties?.["Card Body"] as
      | { rich_text?: Array<{ plain_text?: string }> }
      | undefined;
    const cardBody = (bodyProp?.rich_text || [])
      .map((rt) => rt.plain_text || "")
      .join("");
    const titleProp = row.properties?.Title as
      | { title?: Array<{ plain_text?: string }> }
      | undefined;
    const title = (titleProp?.title || [])
      .map((rt) => rt.plain_text || "")
      .join("");
    return { pageId: row.id, pageUrl: row.url, cardId, cardBody, title };
  });
}

interface DoneGateClassification {
  kind: "automated" | "manual";
  steps: string[];
}

export function classifyDoneGate(cardBody: string): DoneGateClassification {
  const verificationSection = extractVerificationSection(cardBody);
  const hasManual = MANUAL_KEYWORDS.some((p) => p.test(verificationSection));
  const hasAutomated = AUTOMATED_KEYWORDS.some((p) =>
    p.test(verificationSection),
  );

  // Steps: split on newlines, keep numbered/bulleted lines.
  const steps = verificationSection
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /^[\d\-*•]/.test(s) && s.length > 2);

  if (hasManual && !hasAutomated) return { kind: "manual", steps };
  if (hasAutomated && !hasManual) return { kind: "automated", steps };
  // Mixed or ambiguous -- default to manual (safer).
  return { kind: "manual", steps };
}

function extractVerificationSection(cardBody: string): string {
  const idx = cardBody.toLowerCase().indexOf("verification tests");
  if (idx === -1) return cardBody;
  // Take from the marker to the next major section heading or end.
  const after = cardBody.slice(idx);
  const stop = after.search(/\n(?:done gate|commits in this card|---)/i);
  return stop === -1 ? after : after.slice(0, stop);
}

async function createJoVerificationTask(input: {
  card: { cardId: string; pageUrl: string; title: string; cardBody: string };
  verdictKind: "manual" | "automated-stub";
  steps: string[];
}): Promise<number | null> {
  const description = [
    `Done Gate verification needed for ${input.card.cardId}.`,
    "",
    `Card: ${input.card.title}`,
    `Notion: ${input.card.pageUrl}`,
    "",
    `Verification steps (run each, confirm pass):`,
    ...(input.steps.length > 0
      ? input.steps
      : ["(no parsable steps -- read the card body)"]),
    "",
    input.verdictKind === "automated-stub"
      ? "Note: this card's Done Gate looks runnable. The automated runner is not yet wired in Build C; manual confirmation is required for now."
      : "Note: this card's Done Gate requires a human pass.",
    "",
    "When confirmed, transition the card to Verified via the Card Flow Dashboard or run:",
    `npx tsx -e "import('./src/services/blackboard/doneGateVerifier').then(m => m.markCardVerified({ cardId: '${input.card.cardId}', reason: 'Jo confirmed manual verification' }))"`,
  ].join("\n");

  try {
    const [row] = await db("dream_team_tasks")
      .insert({
        title: `Verify Done Gate: ${input.card.cardId}`,
        description,
        assigned_to: "jo",
        status: "open",
        priority: "medium",
        metadata: JSON.stringify({
          source: "blackboard.done_gate_verifier",
          card_id: input.card.cardId,
          card_url: input.card.pageUrl,
          verdict_kind: input.verdictKind,
        }),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");
    return typeof row === "object" && row !== null ? (row as { id: number }).id : (row as unknown as number);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[DoneGateVerifier] createJoVerificationTask failed:",
      message,
    );
    return null;
  }
}

async function transitionAttemptLog(
  cardId: string,
  outcome: string,
  taskId: number | null,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "blackboard.done_gate_attempt",
      properties: JSON.stringify({
        card_id: cardId,
        outcome,
        verification_task_id: taskId,
      }),
      created_at: new Date(),
    });
  } catch {
    // ignore
  }
}

function notionHeaders(): Record<string, string> {
  const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error(
      "[DoneGateVerifier] NOTION_TOKEN (or NOTION_API_KEY) env var is required.",
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}
