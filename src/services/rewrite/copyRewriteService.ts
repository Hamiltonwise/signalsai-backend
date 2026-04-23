/**
 * Copy Rewrite Service (Manifest v2 Card 5 Run 4).
 *
 * Takes a site scored by the Recognition Tri-Score and rewrites low-scoring
 * sections so they pass The Standard. This is the gap the measurement layer
 * couldn't close on its own — the factory can measure, but without this
 * service it cannot heal.
 *
 * Behavior per target section:
 *   1. Load or fetch the current section content.
 *   2. Compose a rewrite via narratorService using missing_examples (first
 *      name only for HIPAA), practice identity (differentiator, location,
 *      doctor background), and the rubric dimensions that scored lowest.
 *   3. Pass composed content through the Freeform Concern Gate in 'runtime'
 *      mode. Threshold 80.
 *   4. If the gate blocks, retry with repair instructions injected into the
 *      prompt. Max 3 attempts. On the 3rd failure: flag section for
 *      dream_team_task of type copy_rewrite_failed.
 *   5. Emit per-section result with explanation ("what changed and why")
 *      for owner context.
 *
 * Three integration surfaces:
 *   - Weekly digest composer (surfaces "here is the rewrite we recommend")
 *   - Card 2 orchestrator upgrade_existing mode (upgrades existing sites)
 *   - Ad-hoc admin action for one-off runs
 *
 * Feature flag: copy_rewrite_enabled, per-practice, default false.
 * Shadow mode (flag off): full pipeline runs for observability but
 * `content_ready_for_publish` is forced to false regardless of section
 * success, so no caller can accidentally ship the rewrite in shadow.
 *
 * Adaptability: prompts + section templates + tone variants are loaded
 * at runtime from Notion page "Copy Rewrite Config v1" (24h cache,
 * local fallback keeps the service runnable when Notion is unavailable).
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import {
  FREEFORM_CONCERN_GATE_MAX_RETRIES,
  FREEFORM_CONCERN_GATE_THRESHOLD,
  runFreeformConcernGate,
} from "../siteQa/gates/freeformConcernGate";
import { isCopyRewriteEnabled } from "./rewriteFlag";
import {
  loadCopyRewriteConfig,
  type CopyRewriteConfig,
  type SectionPromptTemplate,
} from "./copyRewriteConfig";
import { fetchPage, extractText } from "../webFetch";
import type { MissingExample } from "../checkup/recognitionScorer";
import {
  getCapabilities,
  getVocab,
  type Capabilities,
  type VocabConfig,
} from "../vocabulary/vocabLoader";

const HIPAA_PRIVACY_INSTRUCTION =
  "First name only for HIPAA.";
const GENERIC_PRIVACY_INSTRUCTION =
  "Use first name only for a personal touch. No full names in published content.";

function stripHipaaReferences(text: string): string {
  return text
    .replace(/first name only for HIPAA/gi, "first name only")
    .replace(/\(first name only, HIPAA\)/gi, "(first name only)")
    .replace(/\(HIPAA\)/gi, "")
    .replace(/for HIPAA\b/gi, "")
    .replace(/\bHIPAA\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\( +\)/g, "")
    .trim();
}

// ─── Types ──────────────────────────────────────────────────────────

export interface CopyRewriteInput {
  /** Practice site URL the rewrite operates on. */
  url: string;
  /** Current tri-score from scoreRecognition. Used to pick target dimensions. */
  triScore: {
    seo_composite: number | null;
    aeo_composite: number | null;
    cro_composite: number | null;
    /** Optional: full dimension breakdown if available. Key = dim key. */
    dimensionScores?: Record<string, { score: number; max: number }>;
  };
  missingExamples: MissingExample[];
  practiceContext: {
    orgId?: number;
    practiceName: string;
    specialty?: string;
    location?: string;
    differentiator?: string;
    doctorBackground?: string;
    /** Additional raw project identity pass-through for prompt context. */
    rawIdentity?: Record<string, unknown>;
  };
  /** Defaults to config.defaultTargetSections when omitted. */
  targetSections?: string[];
  /** Optional: pre-crawled current content keyed by section id. */
  currentContentBySection?: Record<string, string>;
}

export interface SectionRewriteResult {
  section: string;
  attempts: number;
  passed: boolean;
  blocked: boolean;
  escalated: boolean;
  currentContent: string;
  newContent: string | null;
  composite: number;
  rubricVersion: string | null;
  whatChanged: string;
  whyItMatters: string;
  repairInstructions: Array<{ dimension: string; instruction: string }>;
}

export interface CopyRewriteResult {
  url: string;
  shadow: boolean;
  contentReadyForPublish: boolean;
  overallScoreProjection: {
    seo: number | null;
    aeo: number | null;
    cro: number | null;
    rationale: string;
  };
  sectionResults: SectionRewriteResult[];
  configVersionId: string;
  rubricVersionId: string | null;
  runTimestamp: string;
  warnings: string[];
}

// ─── Anthropic client (shared) ──────────────────────────────────────

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

const COMPOSE_MODEL = "claude-sonnet-4-20250514";
const COMPOSE_TEMPERATURE = 0.4;
const COMPOSE_MAX_TOKENS = 1200;

// ─── Section content resolution ─────────────────────────────────────

async function resolveSectionContent(
  sectionId: string,
  input: CopyRewriteInput
): Promise<string> {
  const preCrawled = input.currentContentBySection?.[sectionId];
  if (typeof preCrawled === "string" && preCrawled.length > 0) {
    return preCrawled;
  }

  // Very simple fallback: fetch the URL and return a section slice based on
  // heuristic anchors. The 'hero' heuristic grabs the first 400 chars of
  // rendered text; other sections look for text blocks matching a section
  // keyword. This is best-effort — the caller can pass currentContentBySection
  // to skip crawling.
  const fetched = await fetchPage(input.url);
  if (!fetched.success || !fetched.html) {
    return "";
  }
  const fullText = await extractText(fetched.html);

  if (sectionId === "hero") {
    return fullText.slice(0, 400);
  }
  const lc = fullText.toLowerCase();
  const keyword = sectionToKeyword(sectionId);
  const idx = lc.indexOf(keyword);
  if (idx === -1) {
    return fullText.slice(0, 800);
  }
  return fullText.slice(Math.max(0, idx - 50), idx + 750);
}

function sectionToKeyword(sectionId: string): string {
  switch (sectionId) {
    case "proofline_carousel":
      return "review";
    case "doctor_story":
      return "doctor";
    case "about_intro":
      return "about";
    default:
      return sectionId.replace(/_/g, " ");
  }
}

// ─── Prompt assembly ────────────────────────────────────────────────

function formatPatientQuotes(examples: MissingExample[]): string {
  if (examples.length === 0) {
    return "(no review data available — write based on practice context only)";
  }
  return examples
    .slice(0, 5)
    .map((ex) => {
      const firstName = hipaaSafeFirstName(ex.reviewerName);
      const trimmed = ex.sourceReview.split(/\s+/).slice(0, 40).join(" ");
      return `- ${firstName}: "${trimmed}" (phrase to surface: "${ex.phrase}")`;
    })
    .join("\n");
}

function hipaaSafeFirstName(name: string | undefined): string {
  if (!name) return "A patient";
  const first = name.split(/\s+/)[0];
  return first.replace(/[^A-Za-z-]/g, "") || "A patient";
}

function pickTargetDimensions(
  triScore: CopyRewriteInput["triScore"]
): string[] {
  // Explicit per-dimension breakdown wins.
  if (triScore.dimensionScores) {
    return Object.entries(triScore.dimensionScores)
      .filter(([, v]) => v.max > 0 && v.score / v.max < 0.5)
      .map(([k]) => k)
      .slice(0, 4);
  }
  // Fallback: derive from tri-score composite gaps.
  const candidates: string[] = [];
  if ((triScore.cro_composite ?? 0) < 60) {
    candidates.push("fear_acknowledged", "patient_voice_match", "meta_question");
  }
  if ((triScore.aeo_composite ?? 0) < 60) {
    candidates.push("recognition_test", "mom_test");
  }
  if ((triScore.seo_composite ?? 0) < 60) {
    candidates.push("recognition_test", "provenance");
  }
  return Array.from(new Set(candidates)).slice(0, 4);
}

function assemblePrompt(
  template: SectionPromptTemplate,
  input: CopyRewriteInput,
  targetDimensions: string[],
  config: CopyRewriteConfig,
  repairContext: string,
  capabilities: Capabilities,
  vocab: VocabConfig
): string {
  const dimensionsLabel = targetDimensions
    .map((d) => `${d} (${config.targetDimensionMap[d] ?? ""})`)
    .join(", ");
  const tone = template.defaultTone ?? "warm";
  const toneGuidance = config.toneVariants[tone] ?? config.toneVariants["warm"] ?? "";

  // Card J placeholders: hipaaInstruction is populated from capabilities.hipaa_mode.
  const hipaaInstruction = capabilities.hipaa_mode
    ? HIPAA_PRIVACY_INSTRUCTION
    : GENERIC_PRIVACY_INSTRUCTION;

  let prompt = template.promptTemplate;
  const replacements: Record<string, string> = {
    practiceName: input.practiceContext.practiceName ?? "the business",
    specialty: input.practiceContext.specialty ?? "the specialty",
    location: input.practiceContext.location ?? "the city",
    differentiator: input.practiceContext.differentiator ?? "(differentiator not provided)",
    doctorBackground: input.practiceContext.doctorBackground ?? `(${vocab.providerTerm} background not provided)`,
    patientQuotes: formatPatientQuotes(input.missingExamples),
    targetDimensions: dimensionsLabel || "(use The Standard's defaults)",
    tone: `${tone} — ${toneGuidance}`,
    customerTerm: vocab.customerTerm,
    customerTermPlural: vocab.customerTermPlural,
    providerTerm: vocab.providerTerm,
    hipaaInstruction,
  };
  for (const [k, v] of Object.entries(replacements)) {
    prompt = prompt.split(`{${k}}`).join(v);
  }

  const [minWords, maxWords] = template.lengthWords ?? [40, 200];
  prompt += `\n\nLength: between ${minWords} and ${maxWords} words. Return only the rewritten copy. No preamble, no explanation. No markdown headers. No quotation marks around the whole block.`;

  if (repairContext.length > 0) {
    prompt += `\n\nThis is a retry. Prior attempt failed the rubric for these reasons — fix them:\n${repairContext}`;
  }

  // Safety net: if a user-supplied Notion config still carries raw HIPAA
  // wording even though hipaa_mode is off, strip it and ensure the generic
  // privacy instruction is present exactly once in the final prompt.
  if (!capabilities.hipaa_mode) {
    prompt = stripHipaaReferences(prompt);
    if (!prompt.includes(GENERIC_PRIVACY_INSTRUCTION)) {
      prompt = `${GENERIC_PRIVACY_INSTRUCTION}\n\n${prompt}`;
    }
  }

  return prompt;
}

async function composeSectionContent(
  prompt: string,
  capabilities: Capabilities
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  const privacyClause = capabilities.hipaa_mode
    ? HIPAA_PRIVACY_INSTRUCTION
    : GENERIC_PRIVACY_INSTRUCTION;
  const systemPrompt = `You rewrite copy for local service practices so it passes The Standard rubric: the recipient feels understood before they feel informed. Plain English. No marketing language. Surface one specific detail from customer reviews. ${privacyClause}`;
  try {
    const response = await getAnthropic().messages.create({
      model: COMPOSE_MODEL,
      max_tokens: COMPOSE_MAX_TOKENS,
      temperature: COMPOSE_TEMPERATURE,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return text.trim() || null;
  } catch {
    return null;
  }
}

// ─── What-changed / why-it-matters narration ────────────────────────

function deriveWhatChanged(
  before: string,
  after: string,
  targetDimensions: string[]
): { whatChanged: string; whyItMatters: string } {
  if (!after || after.length === 0) {
    return {
      whatChanged: "No rewrite produced (rewrite service could not compose).",
      whyItMatters: "The owner's current copy stays in place until the rewrite runs again.",
    };
  }
  const beforeOpen = before.split(/\s+/).slice(0, 10).join(" ");
  const afterOpen = after.split(/\s+/).slice(0, 10).join(" ");
  const whatChanged = `Opening shifted from "${beforeOpen}${before.split(/\s+/).length > 10 ? "..." : ""}" to "${afterOpen}${after.split(/\s+/).length > 10 ? "..." : ""}". ${before.length} chars → ${after.length} chars.`;

  const whyLines: string[] = [];
  if (targetDimensions.includes("fear_acknowledged")) {
    whyLines.push("the patient's fear or pain is named before services");
  }
  if (targetDimensions.includes("patient_voice_match")) {
    whyLines.push("a real patient's language anchors the proof");
  }
  if (targetDimensions.includes("recognition_test")) {
    whyLines.push("a longtime patient would recognize the doctor in this version");
  }
  if (targetDimensions.includes("meta_question")) {
    whyLines.push("the recipient feels understood before they feel informed");
  }
  if (targetDimensions.includes("mom_test")) {
    whyLines.push("the reading level drops to 9th grade and the jargon is gone");
  }
  const whyItMatters =
    whyLines.length > 0
      ? `The rewrite fixes: ${whyLines.join(", ")}.`
      : "The rewrite targets The Standard dimensions this section scored lowest on.";

  return { whatChanged, whyItMatters };
}

// ─── Per-section rewrite ────────────────────────────────────────────

async function rewriteOneSection(
  sectionId: string,
  input: CopyRewriteInput,
  config: CopyRewriteConfig,
  capabilities: Capabilities,
  vocab: VocabConfig
): Promise<SectionRewriteResult> {
  const template = config.sectionPromptTemplates[sectionId];
  const currentContent = await resolveSectionContent(sectionId, input);

  if (!template) {
    return {
      section: sectionId,
      attempts: 0,
      passed: false,
      blocked: false,
      escalated: false,
      currentContent,
      newContent: null,
      composite: 0,
      rubricVersion: null,
      whatChanged: "Unknown section id — no prompt template in Copy Rewrite Config v1.",
      whyItMatters: "Update the Notion config to include this section, or pass a supported target.",
      repairInstructions: [],
    };
  }

  const targetDimensions = pickTargetDimensions(input.triScore);

  let attempt = 0;
  let newContent: string | null = null;
  let composite = 0;
  let rubricVersion: string | null = null;
  let repairContext = "";
  let repairInstructions: SectionRewriteResult["repairInstructions"] = [];
  let passed = false;
  let blocked = false;

  while (attempt < (config.maxRetries ?? FREEFORM_CONCERN_GATE_MAX_RETRIES)) {
    attempt += 1;
    const prompt = assemblePrompt(template, input, targetDimensions, config, repairContext, capabilities, vocab);
    newContent = await composeSectionContent(prompt, capabilities);
    if (!newContent) {
      // Compose failed (missing API key, parse error, etc.). Count as attempt,
      // retry the loop with no repair context (no gate feedback yet).
      continue;
    }

    const gateResult = await runFreeformConcernGate({
      content: newContent,
      orgId: input.practiceContext.orgId,
      surface: "siteQa",
      attempt,
      metadata: {
        practice: input.practiceContext.practiceName,
        specialty: input.practiceContext.specialty,
        location: input.practiceContext.location,
        url: input.url,
        patientReviewText: input.missingExamples
          .slice(0, 5)
          .map((ex) => ex.sourceReview),
      },
    });
    composite = gateResult.score.composite;
    rubricVersion = gateResult.score.rubric_version_id;
    repairInstructions = gateResult.repairInstructions;

    if (gateResult.passed) {
      passed = true;
      break;
    }

    if (gateResult.blocked) {
      blocked = true;
      break;
    }

    // Gate failed but not blocked yet (flag off, or attempts remaining):
    // build repair context for next iteration.
    repairContext = gateResult.repairInstructions
      .map((r) => `- ${r.dimension}: ${r.instruction}`)
      .join("\n") ||
      `Composite ${composite} < ${FREEFORM_CONCERN_GATE_THRESHOLD}. Raise recognition + patient voice.`;
  }

  const { whatChanged, whyItMatters } = deriveWhatChanged(
    currentContent,
    newContent ?? "",
    targetDimensions
  );

  let escalated = false;
  if (!passed && blocked && input.practiceContext.orgId != null) {
    await escalateCopyRewriteFailure(
      input.practiceContext.orgId,
      sectionId,
      input.url,
      composite,
      repairInstructions
    );
    escalated = true;
  }

  return {
    section: sectionId,
    attempts: attempt,
    passed,
    blocked,
    escalated,
    currentContent,
    newContent,
    composite,
    rubricVersion,
    whatChanged,
    whyItMatters,
    repairInstructions,
  };
}

async function escalateCopyRewriteFailure(
  orgId: number,
  sectionId: string,
  url: string,
  composite: number,
  repair: SectionRewriteResult["repairInstructions"]
): Promise<void> {
  try {
    await db("dream_team_tasks").insert({
      owner_name: "copy_rewrite_service",
      title: `Copy Rewrite blocked on ${sectionId} for ${url}`,
      description:
        `Composite ${composite} / threshold ${FREEFORM_CONCERN_GATE_THRESHOLD}\n\n` +
        `Repair hints:\n${repair
          .map((r) => `- ${r.dimension}: ${r.instruction}`)
          .join("\n")}`,
      status: "open",
      priority: "high",
      source_type: "copy_rewrite_failed",
    });
  } catch {
    // dream_team_tasks columns vary; soft-fail.
  }
}

// ─── Projection of tri-score after rewrite ──────────────────────────

function projectTriScore(
  triScore: CopyRewriteInput["triScore"],
  sectionResults: SectionRewriteResult[]
): CopyRewriteResult["overallScoreProjection"] {
  const passed = sectionResults.filter((s) => s.passed && s.newContent).length;
  const total = sectionResults.length;
  if (total === 0) {
    return {
      seo: triScore.seo_composite,
      aeo: triScore.aeo_composite,
      cro: triScore.cro_composite,
      rationale: "No sections targeted — projection equals current tri-score.",
    };
  }
  const ratio = passed / total;
  const bump = Math.round(ratio * 35); // rewrite of all 4 sections ~+35 points
  return {
    seo: triScore.seo_composite != null ? clamp(triScore.seo_composite + Math.round(bump * 0.6), 0, 100) : null,
    aeo: triScore.aeo_composite != null ? clamp(triScore.aeo_composite + Math.round(bump * 0.7), 0, 100) : null,
    cro: triScore.cro_composite != null ? clamp(triScore.cro_composite + bump, 0, 100) : null,
    rationale:
      passed === 0
        ? "No section passed the rubric — projected scores equal current."
        : `Passing ${passed} of ${total} target sections lifts CRO by ~${bump}, AEO by ~${Math.round(bump * 0.7)}, SEO by ~${Math.round(bump * 0.6)}. Projection is directional, not a guarantee — real movement confirms after re-scoring the published site.`,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ─── Public API ─────────────────────────────────────────────────────

export async function runCopyRewrite(
  input: CopyRewriteInput
): Promise<CopyRewriteResult> {
  const warnings: string[] = [];
  const config = await loadCopyRewriteConfig();
  if (config.source === "fallback") {
    warnings.push("Copy Rewrite config loaded from local fallback — Notion unavailable.");
  }

  const shadow = !(await isCopyRewriteEnabled(input.practiceContext.orgId));
  const targets = input.targetSections ?? config.defaultTargetSections;
  const capabilities = await getCapabilities(input.practiceContext.orgId ?? null);
  const vocab = await getVocab(input.practiceContext.orgId ?? null);

  const sectionResults: SectionRewriteResult[] = [];
  for (const sectionId of targets) {
    const result = await rewriteOneSection(sectionId, input, config, capabilities, vocab);
    sectionResults.push(result);
  }

  const overallScoreProjection = projectTriScore(input.triScore, sectionResults);
  const allPassed = sectionResults.length > 0 && sectionResults.every((s) => s.passed && s.newContent);

  await BehavioralEventModel.create({
    event_type: "copy_rewrite.completed",
    org_id: input.practiceContext.orgId ?? null,
    properties: {
      url: input.url,
      shadow,
      sections: sectionResults.map((s) => ({
        id: s.section,
        passed: s.passed,
        composite: s.composite,
        attempts: s.attempts,
        escalated: s.escalated,
      })),
      content_ready_for_publish: allPassed && !shadow,
      config_version_id: config.versionId,
    },
  }).catch(() => {});

  return {
    url: input.url,
    shadow,
    contentReadyForPublish: allPassed && !shadow,
    overallScoreProjection,
    sectionResults,
    configVersionId: config.versionId,
    rubricVersionId: sectionResults.find((s) => s.rubricVersion)?.rubricVersion ?? null,
    runTimestamp: new Date().toISOString(),
    warnings,
  };
}
