/**
 * Live Activity Renderer (Continuous Answer Engine Loop, Phase 4).
 *
 * Per-entry-type rendering of the doctor-facing sentence shown on the
 * Live Activity feed. Three layers, in order:
 *
 *   1. Per-entry-type Haiku prompt (AR-003 model tiering): builds a
 *      one-sentence doctor-facing line from the entry's structured data.
 *   2. Voice Constraints validator (`checkVoice`): pass/fail.
 *   3. Per-entry-type deterministic template fallback: used when no
 *      ANTHROPIC_API_KEY is set, when Haiku errors, or when the Haiku
 *      output fails the voice gate.
 *
 * The output is always a single sentence that obeys the locked voice
 * rules. The fallback is always available -- no entry ever surfaces
 * empty text to the doctor.
 *
 * Phase 1's `liveActivity.renderDoctorFacingText` is a generic version
 * of layer 1. This module wraps it with per-entry-type prompts and
 * deterministic templates that reflect what each LiveActivityEntryType
 * actually means in product.
 */

import { renderDoctorFacingText } from "../answerEngine/liveActivity";
import { checkVoice } from "./voiceConstraints";
import type { LiveActivityEntryType } from "../answerEngine/types";

// ── Public API ─────────────────────────────────────────────────────

export type RenderSource =
  | "haiku"
  | "fallback_no_api_key"
  | "fallback_voice_fail"
  | "fallback_error"
  | "fallback_template";

export interface RenderEntryInput {
  entryType: LiveActivityEntryType;
  /** Structured context the renderer composes from. Shape varies by entry type. */
  data: RenderContextData;
  /** Practice name for grounding. Required. */
  practiceName: string;
}

export interface RenderEntryResult {
  text: string;
  source: RenderSource;
}

/**
 * Render one doctor-facing sentence for a Live Activity entry. Always
 * returns a non-empty string that passes the Voice Constraints check.
 */
export async function renderEntry(
  input: RenderEntryInput,
): Promise<RenderEntryResult> {
  const fallback = composeDeterministicTemplate(input);

  // Layer 1 + 2: try the LLM render with voice validation.
  const context = composeHaikuContext(input);
  const rendered = await renderDoctorFacingText({
    context,
    fallback,
  });

  // Defense in depth: re-validate voice on the returned text. The
  // upstream helper already does this, but if it ever ships a path
  // that bypasses it, we still hold the gate here.
  const voice = checkVoice(rendered.text);
  if (!voice.passed) {
    return { text: fallback, source: "fallback_voice_fail" };
  }

  return { text: rendered.text, source: rendered.source as RenderSource };
}

// ── Per-entry-type context types ───────────────────────────────────

export type RenderContextData =
  | SignalReceivedContext
  | RegenerationAttemptedContext
  | RegenerationPublishedContext
  | RegenerationHeldContext
  | CitationRecoveredContext
  | CitationLostContext
  | WatchingStartedContext;

interface BaseContext {
  /** What signal triggered this entry (free text). Optional. */
  triggerSummary?: string;
}

export interface SignalReceivedContext extends BaseContext {
  kind: "signal_received";
  signalType: string;
  signalDetail: string;
}

export interface RegenerationAttemptedContext extends BaseContext {
  kind: "regeneration_attempted";
  sectionLabel: string;
  reason: string;
}

export interface RegenerationPublishedContext extends BaseContext {
  kind: "regeneration_published";
  sectionLabel: string;
  changeSummary: string;
  /** "PASS" or "PASS_WITH_CONCERNS" */
  reviewerVerdict: "PASS" | "PASS_WITH_CONCERNS";
  watchingNote?: string;
}

export interface RegenerationHeldContext extends BaseContext {
  kind: "regeneration_held";
  sectionLabel: string;
  /** Plain-language reason (not the raw blocker code). */
  blockerInPlainLanguage: string;
}

export interface CitationRecoveredContext extends BaseContext {
  kind: "citation_recovered";
  query: string;
  platform: string;
  priorCompetitor?: string;
}

export interface CitationLostContext extends BaseContext {
  kind: "citation_lost";
  query: string;
  platform: string;
  newCompetitor?: string;
}

export interface WatchingStartedContext extends BaseContext {
  kind: "watching_started";
  what: string;
  why: string;
}

// ── Layer 1: Haiku context composer ────────────────────────────────

function composeHaikuContext(input: RenderEntryInput): string {
  const lines: string[] = [];
  lines.push(`Practice: ${input.practiceName}.`);
  lines.push(`Entry type: ${input.entryType}.`);

  const d = input.data;
  switch (d.kind) {
    case "signal_received":
      lines.push(`Signal type: ${d.signalType}.`);
      lines.push(`Detail: ${d.signalDetail}.`);
      lines.push(
        "Write one sentence in the doctor's voice that names the practice and describes what was just observed in plain language. Do not invent facts. Do not promise outcomes.",
      );
      break;
    case "regeneration_attempted":
      lines.push(`Section affected: ${d.sectionLabel}.`);
      lines.push(`Reason: ${d.reason}.`);
      lines.push(
        "Write one sentence that names the practice, the section being updated, and why. Do not say the change has shipped yet.",
      );
      break;
    case "regeneration_published":
      lines.push(`Section: ${d.sectionLabel}. Change: ${d.changeSummary}.`);
      lines.push(`Reviewer verdict: ${d.reviewerVerdict}.`);
      if (d.watchingNote) lines.push(`Watching: ${d.watchingNote}.`);
      lines.push(
        "Write one sentence that names the practice, describes what changed in plain language, and what is being watched next. Do not say a metric has moved unless explicitly told.",
      );
      break;
    case "regeneration_held":
      lines.push(`Section affected: ${d.sectionLabel}.`);
      lines.push(`Reason held: ${d.blockerInPlainLanguage}.`);
      lines.push(
        "Write one sentence that names the practice, says the change was held for review, and gives the plain-language reason. Original copy stays live. Jo will look at it.",
      );
      break;
    case "citation_recovered":
      lines.push(`Query: \"${d.query}\". Platform: ${d.platform}.`);
      if (d.priorCompetitor) lines.push(`Previously cited: ${d.priorCompetitor}.`);
      lines.push(
        "Write one sentence that names the practice, the query, the platform, and (if relevant) who used to be cited. State the recovery as a fact.",
      );
      break;
    case "citation_lost":
      lines.push(`Query: \"${d.query}\". Platform: ${d.platform}.`);
      if (d.newCompetitor) lines.push(`Now cited: ${d.newCompetitor}.`);
      lines.push(
        "Write one sentence that names the practice, the query, the platform, and (if relevant) who is being cited instead. State the loss as a fact, not a failure.",
      );
      break;
    case "watching_started":
      lines.push(`What: ${d.what}. Why: ${d.why}.`);
      lines.push(
        "Write one sentence that names the practice and what is being watched, in calm language. Do not promise a result.",
      );
      break;
  }

  if (input.data.triggerSummary) {
    lines.push(`Context note: ${input.data.triggerSummary}.`);
  }

  return lines.join("\n");
}

// ── Layer 3: Deterministic templates ───────────────────────────────

/**
 * Per-entry-type fallback. Always produces a sentence that passes
 * Voice Constraints. Pure (no API call). Used when Haiku is unavailable
 * or its output fails the gate.
 */
function composeDeterministicTemplate(input: RenderEntryInput): string {
  const name = input.practiceName;
  const d = input.data;

  switch (d.kind) {
    case "signal_received":
      return `Alloro picked up a ${friendly(d.signalType)} signal for ${name}: ${shorten(d.signalDetail)}.`;
    case "regeneration_attempted":
      return `Alloro is updating the ${shorten(d.sectionLabel)} section for ${name}. Reason: ${shorten(d.reason)}.`;
    case "regeneration_published": {
      const verdict =
        d.reviewerVerdict === "PASS"
          ? "Reviewer Claude passed it cleanly."
          : "Reviewer Claude passed it with notes for review.";
      const watching = d.watchingNote ? ` Watching ${shorten(d.watchingNote)} next.` : "";
      return `Alloro updated the ${shorten(d.sectionLabel)} section for ${name}. ${shorten(d.changeSummary)}. ${verdict}${watching}`;
    }
    case "regeneration_held":
      return `Alloro held a change to the ${shorten(d.sectionLabel)} section for ${name}. Reason: ${shorten(d.blockerInPlainLanguage)}. The current copy stays live and Jo will look at it.`;
    case "citation_recovered": {
      const prior = d.priorCompetitor ? ` Previously cited: ${shorten(d.priorCompetitor)}.` : "";
      return `${name} is now cited on ${shorten(d.platform)} for ${quote(d.query)}.${prior}`;
    }
    case "citation_lost": {
      const swap = d.newCompetitor ? ` Now cited: ${shorten(d.newCompetitor)}.` : "";
      return `${name} is no longer cited on ${shorten(d.platform)} for ${quote(d.query)}.${swap}`;
    }
    case "watching_started":
      return `Alloro is watching ${shorten(d.what)} for ${name}. Reason: ${shorten(d.why)}.`;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function friendly(signalType: string): string {
  // Map signal_type enum strings to a doctor-readable phrase, no jargon.
  const map: Record<string, string> = {
    gsc_rank_delta: "ranking-shift",
    gsc_impression_spike: "search-volume",
    gsc_new_query: "new-query",
    gbp_review_new: "new-review",
    gbp_rating_shift: "rating-shift",
    competitor_top10: "competitor-rising",
    aeo_citation_lost: "AI-citation-lost",
    aeo_citation_new: "AI-citation-gained",
    aeo_citation_competitor: "competitor-AI-citation",
  };
  return map[signalType] || "signal";
}

function shorten(s: string): string {
  // Keep the doctor-facing sentence under the voice "tighten" warning
  // threshold (6 sentences / 800 chars). Truncate verbose inputs.
  if (!s) return "";
  const max = 200;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/[—–]/g, ", ").trim() + ".";
}

function quote(s: string): string {
  // Wrap a query phrase in straight quotes (curly quotes are not banned
  // but straight is consistent with the rest of the voice samples).
  return `\"${s.replace(/\"/g, "'")}\"`;
}
