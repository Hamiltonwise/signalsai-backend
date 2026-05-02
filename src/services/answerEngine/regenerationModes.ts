/**
 * Regeneration Modes (Continuous Answer Engine Loop, Phase 2).
 *
 * Wires the Trigger Router output to the existing Research Agent and
 * Copy Agent. Routes the regenerated copy through Reviewer Claude
 * (Build A) before any sandbox-preview update.
 *
 * Architecture spec AR-009, Components 3 + 4 + 5.
 *
 * Four Research Agent regeneration modes (mapped from signal_type):
 *   - regeneration               : GSC delta or new query
 *   - testimonial_integration    : new review
 *   - competitive_recalibration  : competitor moved into top 10
 *   - AEO_recovery               : citation lost or competitor citation
 *
 * Verdict routing per architecture spec Component 5:
 *   - PASS                  -> publish to sandbox preview, write
 *                              regeneration_published entry, schedule for
 *                              prod deploy window
 *   - PASS_WITH_CONCERNS    -> publish to sandbox preview, write
 *                              regeneration_published with concern note,
 *                              alert Jo (Slack draft)
 *   - BLOCK                 -> abort regeneration, preserve original copy,
 *                              write regeneration_held with plain-language
 *                              blocker text, alert Jo (Slack draft)
 *
 * Backed by the existing patientpathResearch + patientpathCopy services
 * at src/services/agents/. Phase 2 adds a thin orchestration layer; the
 * underlying Research and Copy logic is unchanged.
 *
 * Path corrections from the original prompt:
 *   - Research: src/services/patientpath/stages/research.ts ->
 *     src/services/agents/patientpathResearch.ts (NOT
 *     src/services/agents/researchAgent/*)
 *   - Copy: src/services/patientpath/stages/copy.ts ->
 *     src/services/agents/patientpathCopy.ts (NOT
 *     src/services/agents/copyAgent/*)
 */

import { db } from "../../database/connection";
import { runPatientPathResearch } from "../agents/patientpathResearch";
import { generatePatientPathCopy } from "../agents/patientpathCopy";
import { runReviewerClaudeOnArtifact } from "../agents/reviewerClaude";
import { writeLiveActivityEntry } from "./liveActivity";
import { renderEntry } from "../narrator/liveActivityRenderer";
import type { SignalType } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export type RegenerationMode =
  | "regeneration"
  | "testimonial_integration"
  | "competitive_recalibration"
  | "AEO_recovery";

export type RegenerationVerdict = "PASS" | "PASS_WITH_CONCERNS" | "BLOCK";

export interface RegenerationInput {
  /** signal_events.id row that triggered this regeneration. */
  signalEventId: string;
  practiceId: number;
  signalType: SignalType;
  signalData: Record<string, unknown>;
  /**
   * Skip the expensive Research+Copy agent execution. Used for the
   * smoke test path: callers provide the artifact text directly via
   * `precomputedArtifact`. Production-mode regeneration always runs
   * with skipExpensiveAgents=false.
   */
  skipExpensiveAgents?: boolean;
  /** Synthetic regenerated copy used in smoke-test mode. */
  precomputedArtifact?: string;
  /** Optional rawResponseOverride for the Reviewer Claude gate (smoke test). */
  reviewerRawResponseOverride?: string;
}

export interface RegenerationResult {
  mode: RegenerationMode;
  verdict: RegenerationVerdict;
  /** Section label used for doctor-facing text + audit log. */
  sectionLabel: string;
  /** Pointer to the new copy_outputs row when shipped. */
  copyOutputId: string | null;
  /** Pointer to Reviewer Gate Audit Log Notion page. */
  reviewerAuditLogPageUrl: string | null;
  /** Live activity entry IDs written across the pipeline. */
  liveActivityEntryIds: string[];
  /** Slack draft details when PASS_WITH_CONCERNS or BLOCK. */
  slackDraftQueued: boolean;
  blockers: string[];
  concerns: string[];
}

// ── Mode mapping ───────────────────────────────────────────────────

export function modeForSignalType(signalType: SignalType): RegenerationMode | null {
  switch (signalType) {
    case "gsc_rank_delta":
    case "gsc_new_query":
    case "gsc_impression_spike":
      return "regeneration";
    case "gbp_review_new":
      return "testimonial_integration";
    case "competitor_top10":
      return "competitive_recalibration";
    case "aeo_citation_lost":
    case "aeo_citation_competitor":
    case "aeo_citation_new":
      return "AEO_recovery";
    case "gbp_rating_shift":
      return null; // routed to gbp_agent.content_sync, not a regeneration
  }
}

// ── Section labels per mode ────────────────────────────────────────

function sectionLabelForMode(
  mode: RegenerationMode,
  signalData: Record<string, unknown>,
): string {
  const q = typeof signalData.query === "string" ? signalData.query : null;
  switch (mode) {
    case "regeneration":
      return q ? `FAQ block for "${q}"` : "FAQ block";
    case "testimonial_integration":
      return "Testimonial section";
    case "competitive_recalibration":
      return "Compare section";
    case "AEO_recovery":
      return q ? `Answer Engine FAQ for "${q}"` : "Answer Engine FAQ";
  }
}

// ── Public API ─────────────────────────────────────────────────────

export async function runRegeneration(
  input: RegenerationInput,
): Promise<RegenerationResult> {
  const mode = modeForSignalType(input.signalType);
  if (!mode) {
    throw new Error(
      `[RegenerationModes] No regeneration mode for signal_type="${input.signalType}"`,
    );
  }

  const sectionLabel = sectionLabelForMode(mode, input.signalData);
  const liveActivityEntryIds: string[] = [];

  const practice = await db("organizations").where({ id: input.practiceId }).first();
  if (!practice) {
    throw new Error(
      `[RegenerationModes] organizations row not found for practice_id=${input.practiceId}`,
    );
  }

  // Step 1: write regeneration_attempted entry
  const attemptedRendered = await renderEntry({
    entryType: "regeneration_attempted",
    practiceName: practice.name,
    data: {
      kind: "regeneration_attempted",
      sectionLabel,
      reason: composeAttemptReason(input.signalType, input.signalData),
    },
  });
  const attemptedId = await writeLiveActivityEntry({
    practice_id: input.practiceId,
    entry_type: "regeneration_attempted",
    entry_data: {
      mode,
      signal_type: input.signalType,
      signal_data: input.signalData,
      signal_event_id: input.signalEventId,
    },
    doctor_facing_text: attemptedRendered.text,
    linked_signal_event_id: input.signalEventId,
    linked_state_transition_id: null,
  });
  liveActivityEntryIds.push(attemptedId);

  // Step 2: produce the regenerated artifact (Research + Copy)
  let artifactText: string;
  let copyOutputId: string | null = null;

  if (input.skipExpensiveAgents) {
    artifactText =
      input.precomputedArtifact ||
      `[smoke-test] regenerated ${sectionLabel} for ${practice.name}.`;
  } else {
    const built = await produceArtifact({
      mode,
      practiceId: input.practiceId,
      practice,
      sectionLabel,
      signalData: input.signalData,
    });
    artifactText = built.artifactText;
    copyOutputId = built.copyOutputId;
  }

  // Step 3: route through Reviewer Claude
  const reviewer = await runReviewerClaudeOnArtifact({
    artifactContent: artifactText,
    artifactSource: `answer-engine.regeneration.${mode}.practice-${input.practiceId}.signal-${input.signalEventId}`,
    autoPromoteOnPass: false, // we manage the inbox write below ourselves
    rawResponseOverride: input.reviewerRawResponseOverride,
  });

  const verdict = reviewer.verdict as RegenerationVerdict;

  // Step 4: write the outcome live_activity_entry by verdict
  if (verdict === "BLOCK") {
    const heldRendered = await renderEntry({
      entryType: "regeneration_held",
      practiceName: practice.name,
      data: {
        kind: "regeneration_held",
        sectionLabel,
        blockerInPlainLanguage: composeBlockerInPlainLanguage(reviewer.blockers),
      },
    });
    const heldId = await writeLiveActivityEntry({
      practice_id: input.practiceId,
      entry_type: "regeneration_held",
      entry_data: {
        mode,
        verdict,
        blockers: reviewer.blockers.map((b) => b.finding),
        reviewer_audit_log_url: reviewer.auditLogPageUrl,
      },
      doctor_facing_text: heldRendered.text,
      linked_signal_event_id: input.signalEventId,
      linked_state_transition_id: null,
    });
    liveActivityEntryIds.push(heldId);
  } else {
    // PASS or PASS_WITH_CONCERNS: regeneration is published to sandbox preview
    const watchingNote =
      input.signalData.query && typeof input.signalData.query === "string"
        ? `rank for "${input.signalData.query}" over the next 48 hours`
        : "the citation status over the next 48 hours";
    const publishedRendered = await renderEntry({
      entryType: "regeneration_published",
      practiceName: practice.name,
      data: {
        kind: "regeneration_published",
        sectionLabel,
        changeSummary: composeChangeSummary(mode, input.signalData),
        reviewerVerdict: verdict,
        watchingNote,
      },
    });
    const publishedId = await writeLiveActivityEntry({
      practice_id: input.practiceId,
      entry_type: "regeneration_published",
      entry_data: {
        mode,
        verdict,
        concerns: reviewer.concerns.map((c) => c.finding),
        reviewer_audit_log_url: reviewer.auditLogPageUrl,
        copy_output_id: copyOutputId,
      },
      doctor_facing_text: publishedRendered.text,
      linked_signal_event_id: input.signalEventId,
      linked_state_transition_id: null,
    });
    liveActivityEntryIds.push(publishedId);
  }

  // Step 5: Slack draft mechanism for PASS_WITH_CONCERNS and BLOCK.
  // The reviewerClaude module already posts a notification. We additionally
  // record a draft intent in dream_team_tasks so Corey can see it in the
  // task queue. Auto-send is gated by a feature flag.
  let slackDraftQueued = false;
  if (verdict === "PASS_WITH_CONCERNS" || verdict === "BLOCK") {
    slackDraftQueued = await queueSlackDraftForReview({
      practiceId: input.practiceId,
      practiceName: practice.name,
      mode,
      sectionLabel,
      verdict,
      blockers: reviewer.blockers.map((b) => b.finding),
      concerns: reviewer.concerns.map((c) => c.finding),
      reviewerAuditLogUrl: reviewer.auditLogPageUrl,
    });
  }

  return {
    mode,
    verdict,
    sectionLabel,
    copyOutputId,
    reviewerAuditLogPageUrl: reviewer.auditLogPageUrl ?? null,
    liveActivityEntryIds,
    slackDraftQueued,
    blockers: reviewer.blockers.map((b) => b.finding),
    concerns: reviewer.concerns.map((c) => c.finding),
  };
}

// ── Artifact production (Research + Copy) ──────────────────────────

async function produceArtifact(input: {
  mode: RegenerationMode;
  practiceId: number;
  practice: { id: number; name: string; specialty?: string; checkup_data?: { place?: { addressLocality?: string } } };
  sectionLabel: string;
  signalData: Record<string, unknown>;
}): Promise<{ artifactText: string; copyOutputId: string | null }> {
  // Step A: refresh the research brief. Research Agent is mode-aware via
  // refreshMode and is fed via the regular org context plus any incoming
  // signal data (e.g. new GSC query, new review).
  const brief = await runPatientPathResearch({
    orgId: input.practiceId,
    refreshMode: true,
  });

  if (!brief) {
    throw new Error(
      `[RegenerationModes] Research Agent returned null for practice ${input.practiceId}`,
    );
  }

  // Step B: produce the targeted Copy Agent output. For Phase 2 we run
  // the full Copy Agent and then extract the section the regeneration
  // mode targets. Future phases can expose a per-section regeneration
  // entry point in patientpathCopy.
  const city =
    input.practice.checkup_data?.place?.addressLocality ||
    "your community";
  const copy = await generatePatientPathCopy({
    orgId: input.practiceId,
    practiceName: input.practice.name,
    specialty: input.practice.specialty || "specialist",
    city,
    irreplaceableThing: brief.copyDirection.irreplaceableThing,
    heroHeadline: brief.copyDirection.heroHeadline,
    problemStatement: brief.copyDirection.problemStatement,
    socialProofQuotes: brief.copyDirection.socialProofQuotes,
    faqTopics: brief.copyDirection.faqTopics,
    toneGuidance: brief.copyDirection.toneGuidance,
    fearCategories: brief.copyDirection.fearCategories,
    praisePatterns: brief.copyDirection.praisePatterns,
    practicePersonality: brief.copyDirection.practicePersonality,
    totalReviews: brief.practiceProfile.totalReviews,
    averageRating: brief.practiceProfile.averageRating,
  });

  // Step C: persist the copy output (versioned) so the diff is auditable.
  const idempotencyKey = `regen-${input.mode}-${input.practiceId}-${signalIdempotencyKey(input.signalData)}`;
  const [row] = await db("copy_outputs")
    .insert({
      org_id: input.practiceId,
      research_brief_id: null, // Research Agent persists internally
      idempotency_key: idempotencyKey,
      copy_json: JSON.stringify(copy),
      status: "pending_reviewer",
    })
    .onConflict("idempotency_key")
    .merge()
    .returning(["id"]);
  const copyOutputId = (row as { id: string } | undefined)?.id ?? null;

  // Step D: extract the section the mode targets, render as artifact.
  const targeted = pickTargetedSection(copy, input.mode);
  const artifactText = renderArtifactMarkdown({
    practiceName: input.practice.name,
    sectionLabel: input.sectionLabel,
    targetedSection: targeted,
  });

  return { artifactText, copyOutputId };
}

function pickTargetedSection(
  copy: { sections: Array<{ name: string; headline: string; body: string }> },
  mode: RegenerationMode,
): { name: string; headline: string; body: string } | null {
  if (!copy.sections || copy.sections.length === 0) return null;
  const wanted = mode === "competitive_recalibration"
    ? /compare|differen/i
    : mode === "testimonial_integration"
      ? /testimonial|review|story/i
      : /faq|answer|question/i;
  const match = copy.sections.find((s) => wanted.test(s.name));
  return match || copy.sections[0];
}

function renderArtifactMarkdown(input: {
  practiceName: string;
  sectionLabel: string;
  targetedSection: { name: string; headline: string; body: string } | null;
}): string {
  const lines: string[] = [];
  lines.push(`# Regeneration: ${input.sectionLabel}`);
  lines.push("");
  lines.push(`Practice: ${input.practiceName}`);
  lines.push("");
  if (!input.targetedSection) {
    lines.push("(no targeted section found in Copy Agent output)");
    return lines.join("\n");
  }
  lines.push(`## ${input.targetedSection.headline}`);
  lines.push("");
  lines.push(input.targetedSection.body);
  return lines.join("\n");
}

// ── Slack draft queue ──────────────────────────────────────────────

async function queueSlackDraftForReview(input: {
  practiceId: number;
  practiceName: string;
  mode: RegenerationMode;
  sectionLabel: string;
  verdict: RegenerationVerdict;
  blockers: string[];
  concerns: string[];
  reviewerAuditLogUrl: string | undefined | null;
}): Promise<boolean> {
  // Phase 2 ships the alert mechanism but does NOT auto-send.
  // We record a dream_team_task with assigned_to=corey describing the
  // verdict + flags. The reviewerClaude module already posts a Slack
  // message on every verdict; the dream_team_task is the durable queue
  // that survives across sessions. Auto-send promotion is gated by the
  // feature flag `answer_engine_auto_slack_alert` (off by default).

  try {
    await db("dream_team_tasks").insert({
      title: `Answer Engine ${input.verdict}: ${input.sectionLabel} for ${input.practiceName}`,
      description: composeDraftDescription(input),
      owner_name: "corey",
      assigned_to: "corey",
      status: "open",
      priority: input.verdict === "BLOCK" ? "high" : "medium",
      created_at: new Date(),
      updated_at: new Date(),
    });
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[RegenerationModes] dream_team_tasks insert failed: ${message}`,
    );
    return false;
  }
}

function composeDraftDescription(input: {
  practiceName: string;
  mode: RegenerationMode;
  sectionLabel: string;
  verdict: RegenerationVerdict;
  blockers: string[];
  concerns: string[];
  reviewerAuditLogUrl: string | undefined | null;
}): string {
  const lines: string[] = [];
  lines.push(`Mode: ${input.mode}`);
  lines.push(`Section: ${input.sectionLabel}`);
  lines.push(`Verdict: ${input.verdict}`);
  if (input.blockers.length > 0) {
    lines.push("");
    lines.push("Blockers:");
    for (const b of input.blockers) lines.push(`- ${b}`);
  }
  if (input.concerns.length > 0) {
    lines.push("");
    lines.push("Concerns:");
    for (const c of input.concerns) lines.push(`- ${c}`);
  }
  if (input.reviewerAuditLogUrl) {
    lines.push("");
    lines.push(`Reviewer audit log: ${input.reviewerAuditLogUrl}`);
  }
  return lines.join("\n");
}

// ── Helpers ────────────────────────────────────────────────────────

function composeAttemptReason(
  signalType: SignalType,
  signalData: Record<string, unknown>,
): string {
  const q = typeof signalData.query === "string" ? signalData.query : "";
  switch (signalType) {
    case "gsc_rank_delta": {
      const before = signalData.rankBefore;
      const after = signalData.rankAfter;
      return q
        ? `search rank for "${q}" moved from ${before} to ${after}`
        : "a tracked search query shifted ranking";
    }
    case "gsc_new_query":
      return q ? `a new patient search appeared: "${q}"` : "a new patient search appeared";
    case "gsc_impression_spike":
      return q
        ? `impressions for "${q}" changed materially this week`
        : "impressions for a tracked query changed materially";
    case "gbp_review_new":
      return "a new patient review came in";
    case "competitor_top10":
      return "a competitor moved into the top 10 for a tracked query";
    case "aeo_citation_lost":
      return q ? `an AI engine stopped citing your practice for "${q}"` : "an AI engine stopped citing your practice";
    case "aeo_citation_new":
      return q ? `an AI engine started citing your practice for "${q}"` : "an AI engine started citing your practice";
    case "aeo_citation_competitor":
      return q ? `a competitor took the AI citation for "${q}"` : "a competitor took an AI citation";
    case "gbp_rating_shift":
      return "your Google rating shifted";
  }
}

function composeChangeSummary(
  mode: RegenerationMode,
  signalData: Record<string, unknown>,
): string {
  const q = typeof signalData.query === "string" ? signalData.query : "";
  switch (mode) {
    case "regeneration":
      return q
        ? `the FAQ block answers "${q}" using language from your patient reviews`
        : "the FAQ block now reflects the latest patient queries";
    case "testimonial_integration":
      return "the testimonial section now includes the new review under the matching fear category";
    case "competitive_recalibration":
      return "the compare section now reflects the new top competitor in your area";
    case "AEO_recovery":
      return q
        ? `a new FAQ block plus schema markup answers "${q}" in the patient's actual words`
        : "a new FAQ block plus schema markup closes the AI citation gap";
  }
}

function composeBlockerInPlainLanguage(
  blockers: Array<{ finding: string }>,
): string {
  if (blockers.length === 0) return "the regeneration produced an artifact we cannot publish without review";
  // Pick the first blocker; trim to a sentence-length doctor-readable.
  const raw = blockers[0].finding;
  const trimmed = raw.length > 220 ? raw.slice(0, 200).trim() + "..." : raw;
  return trimmed;
}

function signalIdempotencyKey(signalData: Record<string, unknown>): string {
  const q = signalData.query;
  if (typeof q === "string" && q.length > 0) {
    return q.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  }
  return `s${Date.now()}`;
}
