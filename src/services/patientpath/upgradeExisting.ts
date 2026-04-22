/**
 * Card 2 orchestrator — upgrade_existing entry mode.
 *
 * Existing client sites (Artful on Kaleidoscope, Garrison on whatever
 * template) were never built by Card 2, so Discoverability Bake, rubric
 * scoring, and rewrite never touched them. This mode gives them a path to
 * site-level improvement without migrating off their current platform.
 *
 * Pipeline:
 *   1. Accept an existing practice URL (not a new project_identity).
 *   2. Crawl current content (homepage + about, reusing recognitionScorer's
 *      fetch helpers).
 *   3. Run Recognition Tri-Score against the current site to identify gaps.
 *   4. Run Copy Rewrite Service on the gap sections.
 *   5. Produce a diff view: current vs rewritten + projected score delta.
 *   6. If feature flag enabled, emit the diff as a proposal to the practice's
 *      owner surface (digest or alert).
 *   7. DO NOT auto-publish. A new approval endpoint must confirm before any
 *      published change.
 *
 * Feature flag: upgrade_existing_enabled, per-practice, default false.
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { fetchPage, extractText } from "../webFetch";
import { scoreRecognition } from "../checkup/recognitionScorer";
import type { RecognitionScorerResult } from "../checkup/recognitionScorer";
import { runCopyRewrite } from "../rewrite/copyRewriteService";
import type { CopyRewriteResult, SectionRewriteResult } from "../rewrite/copyRewriteService";
import { isUpgradeExistingEnabled } from "../rewrite/rewriteFlag";

export interface UpgradeExistingInput {
  orgId?: number;
  url: string;
  specialty?: string;
  location?: string;
  practiceName?: string;
  differentiator?: string;
  doctorBackground?: string;
  /** Optional competitor URLs to include in the tri-score pass. */
  competitorUrls?: string[];
  /** Optional: force specific target sections; otherwise defaults apply. */
  targetSections?: string[];
}

export interface SectionDiff {
  section: string;
  before: string;
  after: string | null;
  passed: boolean;
  blocked: boolean;
  composite: number;
  whatChanged: string;
  whyItMatters: string;
  charDelta: number;
  firstSentenceBefore: string;
  firstSentenceAfter: string;
}

export interface UpgradeExistingResult {
  orgId?: number;
  url: string;
  shadow: boolean;
  autoPublishAllowed: false;
  approvalRequired: true;
  triScoreBefore: {
    seo: number | null;
    aeo: number | null;
    cro: number | null;
  };
  triScoreProjected: {
    seo: number | null;
    aeo: number | null;
    cro: number | null;
    rationale: string;
  };
  sectionDiffs: SectionDiff[];
  rewriteResult: CopyRewriteResult;
  recognitionResult: RecognitionScorerResult;
  runTimestamp: string;
  warnings: string[];
  proposalEmitted: boolean;
}

// ─────────────────────────────────────────────────────────────────────

function firstSentence(text: string): string {
  if (!text) return "";
  const match = text.match(/[^.!?]+[.!?]/);
  return (match?.[0] ?? text.slice(0, 180)).trim();
}

function sectionResultToDiff(r: SectionRewriteResult): SectionDiff {
  return {
    section: r.section,
    before: r.currentContent,
    after: r.newContent,
    passed: r.passed,
    blocked: r.blocked,
    composite: r.composite,
    whatChanged: r.whatChanged,
    whyItMatters: r.whyItMatters,
    charDelta: (r.newContent?.length ?? 0) - r.currentContent.length,
    firstSentenceBefore: firstSentence(r.currentContent),
    firstSentenceAfter: firstSentence(r.newContent ?? ""),
  };
}

async function emitProposalEvent(
  orgId: number,
  url: string,
  sectionDiffs: SectionDiff[],
  rewriteResult: CopyRewriteResult
): Promise<void> {
  await BehavioralEventModel.create({
    event_type: "upgrade_existing.proposal_ready",
    org_id: orgId,
    properties: {
      url,
      sections: sectionDiffs.map((d) => ({
        id: d.section,
        passed: d.passed,
        composite: d.composite,
        char_delta: d.charDelta,
      })),
      projected: rewriteResult.overallScoreProjection,
      rubric_version_id: rewriteResult.rubricVersionId,
      config_version_id: rewriteResult.configVersionId,
    },
  }).catch(() => {});
}

async function archiveProposal(
  input: UpgradeExistingInput,
  result: UpgradeExistingResult
): Promise<void> {
  // Store the proposal in copy_outputs with a dedicated status so the
  // approval endpoint can find it later. Soft-fails if the table schema
  // doesn't have an idempotency_key column in this sandbox.
  try {
    await db("copy_outputs")
      .insert({
        org_id: input.orgId ?? null,
        idempotency_key: `upgrade_existing:${input.orgId ?? "none"}:${input.url}:${Date.now()}`,
        copy_json: JSON.stringify({
          kind: "upgrade_existing_proposal",
          url: input.url,
          triScoreBefore: result.triScoreBefore,
          triScoreProjected: result.triScoreProjected,
          sectionDiffs: result.sectionDiffs,
          rubricVersionId: result.rewriteResult.rubricVersionId,
          configVersionId: result.rewriteResult.configVersionId,
        }),
        status: "upgrade_existing_proposal",
        qa_attempts: 0,
      })
      .returning("id");
  } catch {
    // soft-fail; the in-memory result is still returned to the caller
  }
}

// ─────────────────────────────────────────────────────────────────────

export async function runUpgradeExisting(
  input: UpgradeExistingInput
): Promise<UpgradeExistingResult> {
  const warnings: string[] = [];
  const shadow = !(await isUpgradeExistingEnabled(input.orgId));

  // 1-2. Crawl current content (homepage) — recognition scorer will also
  // fetch and parse, but we keep a copy for explicit before/after diffing.
  const fetched = await fetchPage(input.url);
  let currentHomepage = "";
  if (fetched.success && fetched.html) {
    currentHomepage = await extractText(fetched.html);
  } else {
    warnings.push(`Practice URL fetch failed: ${fetched.error ?? "unknown"}`);
  }

  // 3. Tri-score
  const recognitionResult = await scoreRecognition({
    practiceUrl: input.url,
    specialty: input.specialty,
    location: input.location,
    competitorUrls: input.competitorUrls,
  });

  const triScoreBefore = {
    seo: recognitionResult.practice.seo_composite,
    aeo: recognitionResult.practice.aeo_composite,
    cro: recognitionResult.practice.cro_composite,
  };

  // 4. Rewrite gap sections
  const rewriteResult = await runCopyRewrite({
    url: input.url,
    triScore: {
      seo_composite: triScoreBefore.seo,
      aeo_composite: triScoreBefore.aeo,
      cro_composite: triScoreBefore.cro,
    },
    missingExamples: recognitionResult.practice.missing_examples,
    practiceContext: {
      orgId: input.orgId,
      practiceName: input.practiceName ?? "the practice",
      specialty: input.specialty,
      location: input.location,
      differentiator: input.differentiator,
      doctorBackground: input.doctorBackground,
    },
    targetSections: input.targetSections,
    currentContentBySection: currentHomepage
      ? { hero: currentHomepage.slice(0, 400) }
      : undefined,
  });

  // 5. Diffs
  const sectionDiffs = rewriteResult.sectionResults.map(sectionResultToDiff);

  const triScoreProjected = {
    seo: rewriteResult.overallScoreProjection.seo,
    aeo: rewriteResult.overallScoreProjection.aeo,
    cro: rewriteResult.overallScoreProjection.cro,
    rationale: rewriteResult.overallScoreProjection.rationale,
  };

  const result: UpgradeExistingResult = {
    orgId: input.orgId,
    url: input.url,
    shadow,
    autoPublishAllowed: false,
    approvalRequired: true,
    triScoreBefore,
    triScoreProjected,
    sectionDiffs,
    rewriteResult,
    recognitionResult,
    runTimestamp: new Date().toISOString(),
    warnings,
    proposalEmitted: false,
  };

  // 6. Emit proposal only when live + have an org + at least one section passed
  const atLeastOnePassed = sectionDiffs.some((d) => d.passed && d.after);
  if (!shadow && input.orgId != null && atLeastOnePassed) {
    await emitProposalEvent(input.orgId, input.url, sectionDiffs, rewriteResult);
    result.proposalEmitted = true;
  }

  // Archive the proposal so the approval endpoint has something to consume.
  await archiveProposal(input, result);

  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Approval endpoint (programmatic; HTTP route wiring is a separate layer)

export interface ApproveUpgradeExistingInput {
  orgId: number;
  url: string;
  approvedBy: string;
  proposalId?: string;
}

export interface ApprovalResult {
  approved: boolean;
  proposalId: string | null;
  note: string;
}

/**
 * Owner-approval path. Callers (admin controller or a signed email link)
 * pass the approved proposal forward to the adapter. This function only
 * records the approval and emits the event; the actual publish happens in
 * the adapter and is intentionally NOT invoked here so the orchestrator
 * remains the single publish path.
 */
export async function approveUpgradeExistingProposal(
  input: ApproveUpgradeExistingInput
): Promise<ApprovalResult> {
  try {
    const row = await db("copy_outputs")
      .where({ org_id: input.orgId, status: "upgrade_existing_proposal" })
      .orderBy("created_at", "desc")
      .first("id");
    const proposalId = (row?.id as string | undefined) ?? input.proposalId ?? null;

    if (!proposalId) {
      return {
        approved: false,
        proposalId: null,
        note: "No upgrade_existing proposal found for this org.",
      };
    }

    await db("copy_outputs")
      .where({ id: proposalId })
      .update({
        status: "upgrade_existing_approved",
        updated_at: new Date(),
      });

    await BehavioralEventModel.create({
      event_type: "upgrade_existing.approved",
      org_id: input.orgId,
      properties: {
        url: input.url,
        approved_by: input.approvedBy,
        proposal_id: proposalId,
      },
    }).catch(() => {});

    return {
      approved: true,
      proposalId,
      note: "Proposal approved. Adapter will publish on the next build cycle.",
    };
  } catch (err: any) {
    return {
      approved: false,
      proposalId: null,
      note: `Approval failed: ${err?.message ?? "unknown"}`,
    };
  }
}
