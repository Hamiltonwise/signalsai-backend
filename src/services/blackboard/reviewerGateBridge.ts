/**
 * Reviewer Gate Bridge
 *
 * Glue between Reviewer Claude verdicts and the Notion Blackboard state
 * machine. On every reviewer pass:
 *   1. Write a row to the Reviewer Gate Audit Log (verdict, counts, markdown).
 *   2. Transition the card based on the verdict:
 *        - PASS  + autoPromoted -> Jo Reviewed
 *        - PASS  + Red blast    -> Reviewer Gated (Corey reviews manually)
 *        - PASS_WITH_CONCERNS   -> Reviewer Gated (Corey decides)
 *        - BLOCK                -> Reviewer Blocked (pings Corey)
 *
 * Callers are expected to have already moved the card to "Reviewer Gated"
 * (the BridgeTranslator does this immediately after the inbox upsert).
 */

import axios, { AxiosError } from "axios";
import type { Card } from "../agents/bridgeTranslator";
import type { ReviewerResult } from "../agents/reviewerClaude";
import { renderReviewerMarkdown } from "../agents/reviewerClaude";
import { shouldAutoPromote } from "../agents/reviewerClaude";
import {
  transitionCard,
  DEFAULT_REVIEWER_GATE_AUDIT_LOG_DATABASE_ID,
  type CardState,
  type Actor,
} from "./stateTransitions";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// -- Types -------------------------------------------------------------

export interface ProcessReviewerVerdictInput {
  card: Card;
  cardId: string;
  result: ReviewerResult;
  /** When true, auto-promote PASS verdicts to Jo Reviewed. */
  autoPromoteOnPass: boolean;
  /** Optional URL pointing to the audit log file (e.g. manifest delta). */
  auditLogUrl?: string;
}

export interface ProcessReviewerVerdictOutput {
  auditLogPageId: string;
  auditLogPageUrl: string;
  finalState: CardState | null;
  autoPromoted: boolean;
  transitionErrors: string[];
}

// -- Public API --------------------------------------------------------

/**
 * Run the full reviewer-verdict consequence chain for a card. Idempotent
 * by design: a transition that's already been applied returns success=false
 * and is logged as a transitionError but does not throw.
 */
export async function processReviewerVerdict(
  input: ProcessReviewerVerdictInput,
): Promise<ProcessReviewerVerdictOutput> {
  const { card, cardId, result, autoPromoteOnPass, auditLogUrl } = input;
  const transitionErrors: string[] = [];

  // Step 1: write the audit log row.
  let auditLogPageId = "";
  let auditLogPageUrl = "";
  const autoPromoted = shouldAutoPromote(card, result, autoPromoteOnPass);

  try {
    const audit = await writeReviewerAuditLogRow({
      card,
      cardId,
      result,
      autoPromoted,
    });
    auditLogPageId = audit.pageId;
    auditLogPageUrl = audit.pageUrl;
  } catch (err) {
    logNotionError("writeReviewerAuditLogRow", err);
  }

  // Step 2: transition based on verdict.
  let finalState: CardState | null = null;
  const artifacts = [auditLogPageUrl, auditLogUrl].filter(Boolean) as string[];
  const reviewerActor: Actor = "ReviewerClaude";

  if (result.verdict === "BLOCK") {
    const r = await transitionCard({
      cardId,
      toState: "Reviewer Blocked",
      actor: reviewerActor,
      reason: `Reviewer Claude verdict: BLOCK (${result.counts.blocker} blocker(s), ${result.counts.concern} concern(s)).`,
      linkedArtifacts: artifacts,
    });
    if (r.success) finalState = "Reviewer Blocked";
    else transitionErrors.push(r.error || "BLOCK transition failed");
  } else if (result.verdict === "PASS_WITH_CONCERNS") {
    // Stays at Reviewer Gated. No automatic promotion. The earlier transition
    // (BridgeTranslator -> Reviewer Gated) already covers this state.
    finalState = "Reviewer Gated";
  } else if (result.verdict === "PASS") {
    if (autoPromoted) {
      const r = await transitionCard({
        cardId,
        toState: "Jo Reviewed",
        actor: reviewerActor,
        reason: "Auto-promoted on PASS verdict (no Red blast radius).",
        linkedArtifacts: artifacts,
      });
      if (r.success) finalState = "Jo Reviewed";
      else transitionErrors.push(r.error || "Jo Reviewed transition failed");
    } else {
      // PASS but Red blast radius -- pause at Reviewer Gated for Corey.
      finalState = "Reviewer Gated";
    }
  }

  return {
    auditLogPageId,
    auditLogPageUrl,
    finalState,
    autoPromoted,
    transitionErrors,
  };
}

// -- Audit log writer --------------------------------------------------

interface WriteAuditInput {
  card: Card;
  cardId: string;
  result: ReviewerResult;
  autoPromoted: boolean;
}

async function writeReviewerAuditLogRow(
  input: WriteAuditInput,
): Promise<{ pageId: string; pageUrl: string }> {
  const databaseId =
    process.env.REVIEWER_GATE_AUDIT_LOG_DATABASE_ID ||
    DEFAULT_REVIEWER_GATE_AUDIT_LOG_DATABASE_ID;
  const url = `${NOTION_API_BASE}/pages`;

  const markdown = renderReviewerMarkdown(input.card, input.result);
  const title = `Card ${input.card.number}: ${input.card.title} -- ${input.result.verdict}`;
  const reviewedAt = new Date().toISOString();

  const properties: Record<string, unknown> = {
    Title: {
      title: [{ type: "text", text: { content: truncate(title, 1900) } }],
    },
    "Card ID": richText(input.cardId),
    Verdict: { select: { name: input.result.verdict } },
    "Blocker Count": { number: input.result.counts.blocker },
    "Concern Count": { number: input.result.counts.concern },
    "Note Count": { number: input.result.counts.note },
    "Auto Promoted": { checkbox: input.autoPromoted },
    Markdown: richText(markdown),
    "Reviewed At": { date: { start: reviewedAt } },
  };

  const response = await axios.post(
    url,
    { parent: { database_id: databaseId }, properties },
    { headers: notionHeaders() },
  );
  return {
    pageId: response.data?.id as string,
    pageUrl: response.data?.url as string,
  };
}

// -- Helpers -----------------------------------------------------------

function notionHeaders(): Record<string, string> {
  const token = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error(
      "[ReviewerGateBridge] NOTION_TOKEN (or NOTION_API_KEY) env var is required.",
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
      { type: "text", text: { content: truncate(content, 1900) } },
    ],
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 12) + "\n[truncated]";
}

function logNotionError(label: string, err: unknown): void {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError;
    console.error(
      `[ReviewerGateBridge] ${label} failed:`,
      ax.response?.status,
      ax.response?.data || ax.message,
    );
  } else if (err instanceof Error) {
    console.error(`[ReviewerGateBridge] ${label} failed:`, err.message);
  } else {
    console.error(`[ReviewerGateBridge] ${label} failed:`, String(err));
  }
}
