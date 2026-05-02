/**
 * Cold Outbound Agent — v0 dry-run skeleton.
 *
 * Scope (this session):
 *   - Dry-run mode ONLY. No Notion writes, no Slack, no Mailgun, no
 *     real Practice Analyzer call, no real PatientPath build, no ICP
 *     source DB reads, no cron registration.
 *   - Generates Touch 1 drafts against fixture prospect data using a
 *     three-tier wedge architecture (A=high-effort, B=medium, C=light).
 *   - Runs every produced draft through five gates: Human Authenticity,
 *     Voice Constraints, Readability (Haiku), Cross-Personalization
 *     Uniqueness, and Confidence Resolution.
 *
 * Out of scope (v0):
 *   - Touch 2/3/4 production templates (only Touch 1 has tiered logic;
 *     touches 2-4 fall through to a vertical-neutral placeholder)
 *   - Notion writes, Slack notifications, Jo inbox routing
 *   - Mailgun integration / send path
 *   - ICP source DB reads
 *   - Real runPracticeAnalyzer extraction (stub only)
 *   - Real runPatientPathBuild extraction (stub only)
 *   - First-50 Corey Voice Review gate (production v1; not v0)
 *   - Production-approved subject/body strings (every draft is
 *     prefixed "[DRY RUN PLACEHOLDER. NOT FOR SEND.]")
 */

import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { checkVoice } from "../narrator/voiceConstraints";
import { checkHumanAuthenticity } from "./humanAuthenticity";
import type {
  AnalyzerFindings,
  AutoBuildPreview,
  ColdOutboundDraft,
  ColdOutboundProspect,
  ColdOutboundRunSummary,
  ConfidenceLevel,
  SkippedProspect,
  Tier,
  TierAssignment,
  Vertical,
} from "./coldOutbound.schema";
import { ORTHO_TIER_A_GBP_COMPLETENESS_MAX } from "./coldOutbound.schema";

// ── Feature flag (cron stays dark by default) ───────────────────────

export const COLD_OUTBOUND_ENABLED =
  process.env.COLD_OUTBOUND_ENABLED === "true";

// ── Stubs (injectable) ──────────────────────────────────────────────

/**
 * Stub for the Practice Analyzer. v0 returns whatever findings are
 * already present on the fixture prospect, or a synthetic placeholder
 * if none. Production: extract from src/routes/admin/checkupFunnel.ts
 * into a callable utility that takes orgGbp and returns analyzer output.
 */
export type RunPracticeAnalyzer = (input: {
  orgGbp: string;
}) => Promise<AnalyzerFindings | null>;

/**
 * Stub for the auto-built site preview (PatientPath). v0 returns the
 * preview URL already on the fixture, or null. Production: extract from
 * the PatientPath build pipeline into a callable that takes orgGbp +
 * prospectData and returns a preview URL.
 */
export type RunPatientPathBuild = (input: {
  orgGbp: string;
  prospectData: Pick<
    ColdOutboundProspect,
    "name" | "practiceName" | "city" | "state" | "vertical"
  >;
}) => Promise<AutoBuildPreview | null>;

const stubPracticeAnalyzer: RunPracticeAnalyzer = async () => {
  // v0 stub: returns null. Real value comes from the prospect fixture
  // already; the agent only invokes this stub for prospects whose tier
  // wedge requires fresh analyzer data and who do not already carry it.
  // TODO(production): extract runPracticeAnalyzer from
  // src/routes/admin/checkupFunnel.ts as a callable utility, then point
  // this default at it. The function should take orgGbp and return the
  // AnalyzerFindings shape (rankPosition, specialty, competitorName,
  // competitorReviewDelta).
  return null;
};

const stubPatientPathBuild: RunPatientPathBuild = async () => {
  // v0 stub: returns null. Real value comes from the prospect fixture
  // already. TODO(production): extract runPatientPathBuild from the
  // PatientPath build pipeline as a callable utility that takes orgGbp
  // and prospectData, kicks off a real auto-build, and returns the
  // resulting preview URL plus build timestamp.
  return null;
};

// ── Draft generator strategy (injectable for tests) ─────────────────

export interface GeneratedDraft {
  subject: string;
  body: string;
  personalizationElements: string[];
  personalizationSources: string[];
  generatedBy: "sonnet" | "opus_fallback" | "template_fallback";
}

export type DraftGenerator = (input: {
  prospect: ColdOutboundProspect;
  touchNumber: 1 | 2 | 3 | 4;
  tier: Tier;
  /** Wedge-specific data resolved by the orchestrator and handed to the generator. */
  wedge: WedgeContext;
  retryFeedback?: string;
}) => Promise<GeneratedDraft | null>;

/** Resolved wedge context the generator uses to produce draft copy. */
export interface WedgeContext {
  tier: Tier;
  vertical: Vertical;
  /** Tier A endo. */
  referralData?: ColdOutboundProspect["referralData"];
  /** Tier A ortho. */
  autoBuildPreview?: AutoBuildPreview;
  /** Tier B. */
  analyzerFindings?: AnalyzerFindings;
}

export interface ReadabilityResult {
  readable: boolean;
  issues: string[];
  source: "haiku" | "skipped_no_api_key" | "skipped_error" | "stub";
}

export type ReadabilityChecker = (text: string) => Promise<ReadabilityResult>;

// ── runColdOutbound entry point ─────────────────────────────────────

export interface ColdOutboundIcpFilter {
  state?: string;
  city?: string;
  abeOnly?: boolean;
}

export interface RunColdOutboundParams {
  /** v0: only 'dry-run' is supported. 'draft' will throw. */
  mode: "dry-run" | "draft";
  vertical: Vertical;
  touchNumber: 1 | 2 | 3 | 4;
  icpFilter?: ColdOutboundIcpFilter;

  /** Required in v0: caller supplies fixture prospect list. v1+ reads from ICP source DB. */
  fixtureProspects: ColdOutboundProspect[];

  /** Inject deterministic stubs in tests. */
  draftGenerator?: DraftGenerator;
  readabilityChecker?: ReadabilityChecker;
  practiceAnalyzer?: RunPracticeAnalyzer;
  patientPathBuild?: RunPatientPathBuild;

  /** /tmp by default. */
  outputDir?: string;
  /** Custom file basename (no extension). Default: cold-outbound-dry-run-<date>. */
  outputBaseName?: string;
}

export interface RunColdOutboundResult {
  drafts: ColdOutboundDraft[];
  skipped: SkippedProspect[];
  summary: ColdOutboundRunSummary;
  outputPath: string;
}

export async function runColdOutbound(
  params: RunColdOutboundParams,
): Promise<RunColdOutboundResult> {
  if (params.mode !== "dry-run") {
    throw new Error(
      `coldOutbound v0 only supports mode='dry-run' (received '${params.mode}'). ` +
        `Notion-write / send modes require ALLORO_N8N_WEBHOOK_URL, runPracticeAnalyzer ` +
        `extraction, runPatientPathBuild extraction, ICP source DB reads, and ` +
        `Corey-approved templates in the Decision Log.`,
    );
  }

  const generator = params.draftGenerator ?? defaultDraftGenerator;
  const readability = params.readabilityChecker ?? defaultReadabilityChecker;
  const practiceAnalyzer = params.practiceAnalyzer ?? stubPracticeAnalyzer;
  const patientPathBuild = params.patientPathBuild ?? stubPatientPathBuild;
  const outputDir = params.outputDir ?? "/tmp";

  const inVertical = params.fixtureProspects.filter(
    (p) => p.vertical === params.vertical,
  );
  const filtered = applyIcpFilter(inVertical, params.icpFilter);

  const drafts: ColdOutboundDraft[] = [];
  const skipped: SkippedProspect[] = [];

  for (const prospect of filtered) {
    const result = await processProspect({
      prospect,
      touchNumber: params.touchNumber,
      generator,
      readability,
      practiceAnalyzer,
      patientPathBuild,
    });
    if (result.kind === "draft") {
      drafts.push(result.draft);
    } else {
      skipped.push(result.skip);
    }
  }

  // Cross-personalization pass (mutates draft confidence/gates).
  applyCrossPersonalization(drafts);

  const summary: ColdOutboundRunSummary = {
    drafted: drafts.length,
    skipped: skipped.length,
    green: drafts.filter((d) => d.confidence === "green").length,
    yellow: drafts.filter((d) => d.confidence === "yellow").length,
    red: drafts.filter((d) => d.confidence === "red").length,
    byTier: {
      A: drafts.filter((d) => d.tier === "A").length,
      B: drafts.filter((d) => d.tier === "B").length,
      C: drafts.filter((d) => d.tier === "C").length,
    },
    fallbacks: drafts.filter((d) => !!d.tierAssignment.fallbackFrom).length,
  };

  const outputPath = await writeMarkdownReport({
    outputDir,
    baseName: params.outputBaseName ?? defaultBaseName(),
    drafts,
    skipped,
    summary,
    vertical: params.vertical,
    touchNumber: params.touchNumber,
    totalInVertical: filtered.length,
  });

  return { drafts, skipped, summary, outputPath };
}

function defaultBaseName(): string {
  const d = new Date().toISOString().slice(0, 10);
  return `cold-outbound-dry-run-${d}`;
}

function applyIcpFilter(
  prospects: ColdOutboundProspect[],
  filter: ColdOutboundIcpFilter | undefined,
): ColdOutboundProspect[] {
  if (!filter) return prospects;
  return prospects.filter((p) => {
    if (filter.state && p.state !== filter.state) return false;
    if (filter.city && p.city !== filter.city) return false;
    // abeOnly is a future filter; v0 fixtures don't carry diplomate status,
    // so this clause is a no-op pending production data.
    if (filter.abeOnly) {
      const fact = (p.practiceFacts ?? []).join(" ").toLowerCase();
      if (!/\babe\b|american board of endodontics/.test(fact)) return false;
    }
    return true;
  });
}

// ── Tier assignment ─────────────────────────────────────────────────

/**
 * Assign a tier to a prospect. Pure function; no side effects, no stubs.
 * Tier A is vertical-specific:
 *  - endo: PBHS or TDO footer + hasReferralData=true
 *  - ortho: PBHS or TDO footer + GBP completeness <= ORTHO_TIER_A_GBP_COMPLETENESS_MAX
 * Tier A endo with PBHS/TDO but no referral data falls back to Tier B.
 * Tier A ortho with PBHS/TDO but high GBP completeness falls back to Tier B.
 * Tier B fires on any agency footer signal (PBHS, TDO, "other").
 * Tier C is the default.
 */
export function assignTier(prospect: ColdOutboundProspect): TierAssignment {
  const hasAgencyFooter =
    prospect.pmsAgencyFooter === "PBHS" || prospect.pmsAgencyFooter === "TDO";
  const hasOtherFooter = prospect.pmsAgencyFooter === "other";

  if (prospect.vertical === "endodontist") {
    if (hasAgencyFooter && prospect.hasReferralData === true && prospect.referralData) {
      return {
        tier: "A",
        reason:
          `endo Tier A: ${prospect.pmsAgencyFooter} footer + GP referral data available.`,
      };
    }
    if (hasAgencyFooter) {
      return {
        tier: "B",
        reason:
          `endo Tier A fallback: ${prospect.pmsAgencyFooter} footer present, no GP referral data.`,
        fallbackFrom: "A",
      };
    }
  }

  if (prospect.vertical === "orthodontist") {
    const gbp = prospect.gbpCompletenessScore ?? 100;
    if (hasAgencyFooter && gbp <= ORTHO_TIER_A_GBP_COMPLETENESS_MAX) {
      return {
        tier: "A",
        reason:
          `ortho Tier A: ${prospect.pmsAgencyFooter} footer + GBP completeness ${gbp}/100 (<= ${ORTHO_TIER_A_GBP_COMPLETENESS_MAX}).`,
      };
    }
    if (hasAgencyFooter) {
      return {
        tier: "B",
        reason:
          `ortho Tier A fallback: ${prospect.pmsAgencyFooter} footer present, GBP completeness ${gbp}/100 above threshold.`,
        fallbackFrom: "A",
      };
    }
  }

  if (hasOtherFooter) {
    return {
      tier: "B",
      reason:
        "Tier B: unrecognized agency footer, eligible for Practice Analyzer wedge.",
    };
  }

  return {
    tier: "C",
    reason:
      "Tier C: no agency footer signal, no referral data, no auto-build eligibility.",
  };
}

// ── Per-prospect processing ─────────────────────────────────────────

type ProcessResult =
  | { kind: "draft"; draft: ColdOutboundDraft }
  | { kind: "skip"; skip: SkippedProspect };

interface ProcessProspectInput {
  prospect: ColdOutboundProspect;
  touchNumber: 1 | 2 | 3 | 4;
  generator: DraftGenerator;
  readability: ReadabilityChecker;
  practiceAnalyzer: RunPracticeAnalyzer;
  patientPathBuild: RunPatientPathBuild;
}

async function processProspect(
  input: ProcessProspectInput,
): Promise<ProcessResult> {
  const { prospect, touchNumber, generator, readability } = input;

  // Pre-flight: minimum personalization signal must exist.
  if (!hasMinimumPersonalization(prospect)) {
    return {
      kind: "skip",
      skip: {
        prospectId: prospect.prospectId,
        reason: "no_personalization_data",
        detail:
          "no name, no practice, no city, no GBP signal, no facts. cannot personalize.",
      },
    };
  }

  // Tier assignment.
  const tierAssignment = assignTier(prospect);

  // Resolve wedge context (may invoke the analyzer / autobuild stubs).
  const stubsCalled: ("runPracticeAnalyzer" | "runPatientPathBuild")[] = [];
  let wedge: WedgeContext;
  try {
    wedge = await resolveWedge({
      prospect,
      tier: tierAssignment.tier,
      practiceAnalyzer: input.practiceAnalyzer,
      patientPathBuild: input.patientPathBuild,
      stubsCalled,
    });
  } catch (err: unknown) {
    return {
      kind: "skip",
      skip: {
        prospectId: prospect.prospectId,
        reason: "tier_assignment_conflict",
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // First generation pass.
  let generated = await generator({
    prospect,
    touchNumber,
    tier: tierAssignment.tier,
    wedge,
  });
  if (!generated) {
    return {
      kind: "skip",
      skip: {
        prospectId: prospect.prospectId,
        reason: "draft_generation_failed",
        detail: `generator returned null on first pass for tier ${tierAssignment.tier}.`,
      },
    };
  }

  // Gate A: Human Authenticity, with one retry on failure.
  let auth = await checkHumanAuthenticity(generated.body);
  let retried = false;
  if (!auth.authentic) {
    retried = true;
    const feedback = `Previous draft failed authenticity check. Score ${auth.score}. Flags: ${auth.flags.join("; ")}. Rewrite to remove these specific patterns.`;
    const retry = await generator({
      prospect,
      touchNumber,
      tier: tierAssignment.tier,
      wedge,
      retryFeedback: feedback,
    });
    if (!retry) {
      return {
        kind: "skip",
        skip: {
          prospectId: prospect.prospectId,
          reason: "human_authenticity_failed_after_retry",
          detail: `retry returned null. first attempt flags: ${auth.flags.join("; ")}`,
        },
      };
    }
    generated = retry;
    auth = await checkHumanAuthenticity(generated.body);
    if (!auth.authentic) {
      return {
        kind: "skip",
        skip: {
          prospectId: prospect.prospectId,
          reason: "human_authenticity_failed_after_retry",
          detail: `score ${auth.score}. flags: ${auth.flags.join("; ")}`,
        },
      };
    }
  }

  // Gate B: Voice Constraints (subject + body composed).
  const composed = `${generated.subject}. ${generated.body}`;
  const voice = checkVoice(composed);
  if (!voice.passed) {
    return {
      kind: "skip",
      skip: {
        prospectId: prospect.prospectId,
        reason: "voice_violation",
        detail: voice.violations.join("; "),
      },
    };
  }

  // Gate C: Readability (Haiku). Failure caps confidence at Yellow but
  // does not skip the draft.
  const readabilityResult = await readability(generated.body);

  // Confidence gets resolved after the cross-personalization pass.
  const confidence: ConfidenceLevel = "yellow";
  const reasons: string[] = [];

  const draft: ColdOutboundDraft = {
    prospectId: prospect.prospectId,
    vertical: prospect.vertical,
    touchNumber,
    tier: tierAssignment.tier,
    tierAssignment,
    subject: generated.subject,
    body: generated.body,
    personalizationElements: generated.personalizationElements,
    personalizationSources: generated.personalizationSources,
    confidence,
    confidenceReasons: reasons,
    gates: {
      humanAuthenticity: {
        passed: auth.authentic,
        score: auth.score,
        flags: auth.flags,
        retried,
      },
      voice: {
        passed: voice.passed,
        violations: voice.violations,
        warnings: voice.warnings,
      },
      readability: {
        passed: readabilityResult.readable,
        issues: readabilityResult.issues,
        source: readabilityResult.source,
      },
      crossPersonalization: {
        uniqueElementCount: generated.personalizationElements.length,
        sharedElements: [],
      },
    },
    generatedBy: generated.generatedBy,
    stubsCalled,
  };

  return { kind: "draft", draft };
}

function hasMinimumPersonalization(p: ColdOutboundProspect): boolean {
  const hasName = !!p.name && p.name.trim().length > 0;
  if (!hasName) return false;
  const hasPractice = !!p.practiceName && p.practiceName.trim().length > 0;
  const hasLocation = !!p.city && p.city.trim().length > 0;
  const hasGbp = !!p.gbpReviewCount || !!p.gbpRating;
  const hasFacts = !!p.practiceFacts && p.practiceFacts.length > 0;
  return hasPractice || hasLocation || hasGbp || hasFacts;
}

interface ResolveWedgeInput {
  prospect: ColdOutboundProspect;
  tier: Tier;
  practiceAnalyzer: RunPracticeAnalyzer;
  patientPathBuild: RunPatientPathBuild;
  stubsCalled: ("runPracticeAnalyzer" | "runPatientPathBuild")[];
}

async function resolveWedge(input: ResolveWedgeInput): Promise<WedgeContext> {
  const { prospect, tier } = input;
  const ctx: WedgeContext = { tier, vertical: prospect.vertical };

  if (tier === "A" && prospect.vertical === "endodontist") {
    if (!prospect.referralData) {
      throw new Error(
        "endo Tier A requires referralData payload but prospect.referralData is missing.",
      );
    }
    ctx.referralData = prospect.referralData;
    return ctx;
  }

  if (tier === "A" && prospect.vertical === "orthodontist") {
    let preview: AutoBuildPreview | null = prospect.autoBuildPreview ?? null;
    if (!preview) {
      // v0: stub returns null. Production: would invoke the build pipeline.
      preview = await input.patientPathBuild({
        orgGbp: prospect.gbpRating ? `gbp-${prospect.prospectId}` : prospect.prospectId,
        prospectData: {
          name: prospect.name,
          practiceName: prospect.practiceName,
          city: prospect.city,
          state: prospect.state,
          vertical: prospect.vertical,
        },
      });
      input.stubsCalled.push("runPatientPathBuild");
    }
    if (!preview) {
      throw new Error(
        "ortho Tier A requires an auto-build preview URL but prospect has none and stub returned null.",
      );
    }
    ctx.autoBuildPreview = preview;
    return ctx;
  }

  if (tier === "B") {
    let findings: AnalyzerFindings | null = prospect.analyzerFindings ?? null;
    if (!findings) {
      // v0: stub returns null. Production: extract runPracticeAnalyzer.
      findings = await input.practiceAnalyzer({
        orgGbp: prospect.gbpRating ? `gbp-${prospect.prospectId}` : prospect.prospectId,
      });
      input.stubsCalled.push("runPracticeAnalyzer");
    }
    if (findings) ctx.analyzerFindings = findings;
    return ctx;
  }

  // Tier C: no wedge data.
  return ctx;
}

// ── Cross-personalization uniqueness pass ───────────────────────────

function applyCrossPersonalization(drafts: ColdOutboundDraft[]): void {
  const seen = new Map<string, string[]>();
  for (const d of drafts) {
    for (const el of d.personalizationElements) {
      const norm = normalizeElement(el);
      if (!seen.has(norm)) seen.set(norm, []);
      seen.get(norm)!.push(d.prospectId);
    }
  }

  for (const d of drafts) {
    const sharedElements: string[] = [];
    let uniqueCount = 0;
    for (const el of d.personalizationElements) {
      const owners = seen.get(normalizeElement(el)) ?? [];
      const isUniqueToThis =
        owners.length === 1 && owners[0] === d.prospectId;
      if (isUniqueToThis) {
        uniqueCount += 1;
      } else {
        sharedElements.push(el);
      }
    }

    d.gates.crossPersonalization.uniqueElementCount = uniqueCount;
    d.gates.crossPersonalization.sharedElements = sharedElements;

    const { confidence, reasons } = resolveConfidence(d);
    d.confidence = confidence;
    d.confidenceReasons = reasons;
  }
}

function resolveConfidence(d: ColdOutboundDraft): {
  confidence: ConfidenceLevel;
  reasons: string[];
} {
  const reasons: string[] = [];
  const readabilityCapped = !d.gates.readability.passed;
  if (readabilityCapped) {
    const issueText =
      d.gates.readability.issues.length > 0
        ? d.gates.readability.issues.join("; ")
        : "unspecified readability issues";
    reasons.push(`readability gate flagged: ${issueText}`);
  }

  const uniqueCount = d.gates.crossPersonalization.uniqueElementCount;
  const sharedElements = d.gates.crossPersonalization.sharedElements;

  if (uniqueCount >= 2 && !readabilityCapped) {
    return { confidence: "green", reasons: [] };
  }

  if (uniqueCount < 2) {
    if (uniqueCount === 1) reasons.push("only 1 personalization element unique to this prospect");
    if (uniqueCount === 0) reasons.push("no personalization element unique to this prospect");
    if (sharedElements.length > 0) {
      reasons.push(
        `shared element(s) with other drafts: ${sharedElements.slice(0, 3).join("; ")}`,
      );
    }
  }

  return { confidence: "yellow", reasons };
}

function normalizeElement(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[a-z_]+:\s*/, "");
}

// ── Default draft generator: Sonnet → Opus → template ───────────────

const SONNET_MODEL = "claude-sonnet-4-6";
const OPUS_MODEL = "claude-opus-4-7";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const defaultDraftGenerator: DraftGenerator = async ({
  prospect,
  touchNumber,
  tier,
  wedge,
  retryFeedback,
}) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[ColdOutbound] ANTHROPIC_API_KEY not set. Using template fallback.",
    );
    return templateDraft({ prospect, touchNumber, tier, wedge, retryFeedback });
  }

  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt({ prospect, touchNumber, tier, wedge, retryFeedback });

  try {
    const message = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = parseGeneratorOutput(message);
    if (parsed) {
      return {
        ...parsed,
        personalizationSources: extractPersonalizationSources(prospect, tier),
        generatedBy: "sonnet",
      };
    }
  } catch (err: unknown) {
    console.warn(
      `[ColdOutbound] Sonnet generation failed (${err instanceof Error ? err.message : String(err)}). Trying Opus fallback.`,
    );
  }

  try {
    const message = await client.messages.create({
      model: OPUS_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = parseGeneratorOutput(message);
    if (parsed) {
      console.warn("[ColdOutbound] Used Opus fallback after Sonnet failure.");
      return {
        ...parsed,
        personalizationSources: extractPersonalizationSources(prospect, tier),
        generatedBy: "opus_fallback",
      };
    }
  } catch (err: unknown) {
    console.warn(
      `[ColdOutbound] Opus fallback also failed (${err instanceof Error ? err.message : String(err)}). Using template.`,
    );
  }

  return templateDraft({ prospect, touchNumber, tier, wedge, retryFeedback });
};

// ── Default readability checker (Haiku, fail-open if no API key) ────

const defaultReadabilityChecker: ReadabilityChecker = async (text) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[ColdOutbound] ANTHROPIC_API_KEY not set. Readability gate fail-open (treating as readable).",
    );
    return { readable: true, issues: [], source: "skipped_no_api_key" };
  }
  const client = new Anthropic({ apiKey });
  const prompt =
    `Read this email draft. Does it contain any grammar errors, awkward phrasing, ` +
    `or constructions that would make a fluent English reader question whether a ` +
    `human wrote it? Return JSON: { "readable": boolean, "issues": string[] }. ` +
    `Return ONLY the JSON object, no surrounding text.\n\nDraft:\n${text}`;

  try {
    const message = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") {
      console.warn("[ColdOutbound] Readability gate: non-text response. Fail-open.");
      return { readable: true, issues: [], source: "skipped_error" };
    }
    const parsed = parseReadabilityJson(block.text);
    if (!parsed) {
      console.warn(
        "[ColdOutbound] Readability gate: failed to parse Haiku JSON. Fail-open.",
      );
      return {
        readable: true,
        issues: ["readability gate: failed to parse model JSON"],
        source: "skipped_error",
      };
    }
    return { ...parsed, source: "haiku" };
  } catch (err: unknown) {
    console.warn(
      `[ColdOutbound] Readability gate failed (${err instanceof Error ? err.message : String(err)}). Fail-open.`,
    );
    return { readable: true, issues: [], source: "skipped_error" };
  }
};

function parseReadabilityJson(
  text: string,
): { readable: boolean; issues: string[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const json = JSON.parse(text.slice(start, end + 1));
    if (typeof json.readable !== "boolean") return null;
    const issues = Array.isArray(json.issues)
      ? json.issues.filter((x: unknown): x is string => typeof x === "string")
      : [];
    return { readable: json.readable, issues };
  } catch {
    return null;
  }
}

// ── Prompt construction (per-tier) ──────────────────────────────────

interface PromptInput {
  prospect: ColdOutboundProspect;
  touchNumber: 1 | 2 | 3 | 4;
  tier: Tier;
  wedge: WedgeContext;
  retryFeedback?: string;
}

function buildPrompt(input: PromptInput): string {
  const { prospect, touchNumber, tier, wedge, retryFeedback } = input;
  const lines: string[] = [];
  lines.push(
    `You are drafting a Touch ${touchNumber} cold outbound note from Corey Wise (founder of Alloro) to a ${prospect.vertical} we have NOT met. The note will be reviewed by Corey (first 50) and then Jo before any send. This is a DRY RUN draft for gate validation.`,
  );
  lines.push("");
  lines.push("Cold outbound voice constraints (different from warm follow-up):");
  lines.push("- Direct. Proof-density per sentence. No small talk.");
  lines.push("- Mention Alloro by name once. Do not pretend it's a personal email.");
  lines.push("- Faster to the specific finding than a warm note would be.");
  lines.push("");
  lines.push("Hard constraints:");
  lines.push("- No em-dashes anywhere. Use commas or periods.");
  lines.push(
    '- Banned words/phrases: strategy, growth, leverage, synergy, unlock, supercharge, elevate, world-class, best-in-class, cutting-edge, state-of-the-art, game-changing, revolutionary, industry-leading, turnkey, "scale your", "scale the".',
  );
  lines.push('- Do not say "we saved you", "we rescued", "Alloro is the best/only".');
  lines.push(
    '- No shame language ("you\'re behind", "you should have", "you haven\'t").',
  );
  lines.push("- No exclamation points. No \"excited to\" / \"thrilled to\".");
  lines.push("- Tone: peer-to-peer. Under 120 words for body.");
  lines.push("- Output is a DRY RUN PLACEHOLDER. Begin the body with the literal string \"[DRY RUN PLACEHOLDER. NOT FOR SEND.]\" on its own line.");
  lines.push("");
  lines.push(`Tier: ${tier}. Vertical: ${prospect.vertical}.`);
  lines.push(`Wedge angle for this tier:`);
  lines.push(wedgeBriefForPrompt(wedge));
  lines.push("");
  lines.push("Prospect data:");
  lines.push(`- Name: ${prospect.name}`);
  if (prospect.practiceName) lines.push(`- Practice: ${prospect.practiceName}`);
  if (prospect.city || prospect.state)
    lines.push(`- Location: ${[prospect.city, prospect.state].filter(Boolean).join(", ")}`);
  if (prospect.gbpReviewCount !== undefined)
    lines.push(`- GBP review count: ${prospect.gbpReviewCount}`);
  if (prospect.gbpRating !== undefined)
    lines.push(`- GBP rating: ${prospect.gbpRating}`);
  if (prospect.practiceFacts && prospect.practiceFacts.length > 0) {
    lines.push("- Practice facts:");
    for (const f of prospect.practiceFacts) lines.push(`  • ${f}`);
  }
  if (retryFeedback) {
    lines.push("");
    lines.push("RETRY FEEDBACK from prior gate failure:");
    lines.push(retryFeedback);
  }
  lines.push("");
  lines.push("Output format (strict, no extra commentary):");
  lines.push("SUBJECT: <one line>");
  lines.push("BODY:");
  lines.push("<body text starting with [DRY RUN PLACEHOLDER. NOT FOR SEND.]>");
  lines.push("PERSONALIZATION_ELEMENTS:");
  lines.push("- <one specific public-data anchor referenced in the body>");
  lines.push("- <another, if applicable>");
  return lines.join("\n");
}

function wedgeBriefForPrompt(wedge: WedgeContext): string {
  if (wedge.tier === "A" && wedge.vertical === "endodontist" && wedge.referralData) {
    const r = wedge.referralData;
    return [
      `GP referral pattern shift. Cite Dr. ${r.gpName} at ${r.gpPracticeName} stopped sending cases ${r.timeframe}. Worth approximately $${r.estimatedAnnualValue.toLocaleString()} per year. Offer Alloro's referral diagnostic. Do not promise recovery; describe what we'd surface.`,
    ].join(" ");
  }
  if (wedge.tier === "A" && wedge.vertical === "orthodontist" && wedge.autoBuildPreview) {
    return [
      `Auto-built site preview. We built a preview using public Google data for the practice in 90 seconds. Link to ${wedge.autoBuildPreview.previewUrl}. Frame as "no catch. take a look. If you want to keep it, we will handle the domain transfer. If not, no harm done."`,
    ].join(" ");
  }
  if (wedge.tier === "B" && wedge.analyzerFindings) {
    const f = wedge.analyzerFindings;
    return [
      `Practice Analyzer findings. Surface 1-2 specific local-search findings for "${f.specialty}" in their city. They rank #${f.rankPosition}. ${f.competitorName} ranks above them with ${f.competitorReviewDelta} more Google reviews. Offer the full free analyzer report at /checkup.`,
    ].join(" ");
  }
  if (wedge.tier === "B") {
    return [
      "Practice Analyzer findings. The analyzer has not yet returned data for this prospect; reference the practice's Google profile and offer the free 90-second Practice Analyzer at /checkup.",
    ].join(" ");
  }
  return [
    "Light-effort wedge. Offer the free 90-second Practice Analyzer at /checkup. One-click consent path. Reference one public data point (review count, rating, location) so the recipient knows we did not blast them.",
  ].join(" ");
}

function parseGeneratorOutput(
  message: Anthropic.Messages.Message,
): { subject: string; body: string; personalizationElements: string[] } | null {
  const block = message.content[0];
  if (!block || block.type !== "text") return null;
  const text = block.text;

  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+?)(?:\nPERSONALIZATION_ELEMENTS:|$)/i);
  const elementsBlock = text.match(/PERSONALIZATION_ELEMENTS:\s*([\s\S]+)$/i);

  if (!subjectMatch || !bodyMatch) return null;
  const subject = subjectMatch[1].trim();
  const body = bodyMatch[1].trim();

  const elements: string[] = [];
  if (elementsBlock) {
    for (const line of elementsBlock[1].split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const m = trimmed.match(/^[-*•]\s*(.+)$/);
      if (m) elements.push(m[1].trim());
    }
  }

  return { subject, body, personalizationElements: elements };
}

function extractPersonalizationSources(
  p: ColdOutboundProspect,
  tier: Tier,
): string[] {
  const out: string[] = [];
  if (p.practiceName) out.push("practice_name");
  if (p.city) out.push("city");
  if (p.state) out.push("state");
  if (p.gbpReviewCount !== undefined) out.push("gbp_review_count");
  if (p.gbpRating !== undefined) out.push("gbp_rating");
  if (p.practiceFacts && p.practiceFacts.length > 0) out.push("practice_facts");
  if (tier === "A" && p.vertical === "endodontist") out.push("gp_referral_data");
  if (tier === "A" && p.vertical === "orthodontist") out.push("auto_build_preview");
  if (tier === "B") out.push("analyzer_findings");
  return out;
}

// ── Template fallback (used when API key absent or model calls fail) ─

interface TemplateInput {
  prospect: ColdOutboundProspect;
  touchNumber: 1 | 2 | 3 | 4;
  tier: Tier;
  wedge: WedgeContext;
  retryFeedback?: string;
}

function templateDraft(input: TemplateInput): GeneratedDraft | null {
  const { prospect, touchNumber, tier, wedge, retryFeedback } = input;

  const elements: string[] = [];

  // Common public-data elements (city + practice + GBP signal).
  if (prospect.practiceName) elements.push(`practice: ${prospect.practiceName}`);
  if (prospect.city) {
    const loc = prospect.state ? `${prospect.city}, ${prospect.state}` : prospect.city;
    elements.push(`location: ${loc}`);
  }
  if (prospect.gbpReviewCount !== undefined) {
    elements.push(`gbp-review-count: ${prospect.gbpReviewCount}`);
  }
  if (prospect.gbpRating !== undefined) {
    elements.push(`gbp-rating: ${prospect.gbpRating}`);
  }
  if (prospect.practiceFacts) {
    for (const f of prospect.practiceFacts) elements.push(`practice-fact: ${f}`);
  }

  // Tier-specific elements.
  if (tier === "A" && wedge.referralData) {
    const r = wedge.referralData;
    elements.push(`gp-referral: ${r.gpName} at ${r.gpPracticeName}, ${r.timeframe}, ~$${r.estimatedAnnualValue}/yr`);
  }
  if (tier === "A" && wedge.autoBuildPreview) {
    elements.push(`auto-build-preview: ${wedge.autoBuildPreview.previewUrl}`);
  }
  if (tier === "B" && wedge.analyzerFindings) {
    const f = wedge.analyzerFindings;
    elements.push(
      `analyzer-finding: ranked #${f.rankPosition} for "${f.specialty}", ${f.competitorName} ranks above with ${f.competitorReviewDelta} more reviews`,
    );
  }

  if (elements.length === 0) return null;

  // ── Subject + body per tier ──────────────────────────────────────
  const retryTag = retryFeedback ? " [retry]" : "";
  let subject: string;
  const bodyLines: string[] = [];
  bodyLines.push(`[DRY RUN PLACEHOLDER. NOT FOR SEND.]`);
  bodyLines.push("");
  bodyLines.push(`${prospect.name},`);
  bodyLines.push("");

  if (tier === "A" && wedge.referralData && prospect.vertical === "endodontist") {
    const r = wedge.referralData;
    subject = `${r.gpName} stopped sending you cases${retryTag}`;
    bodyLines.push(
      `Dr. ${r.gpName} at ${r.gpPracticeName} stopped sending you cases ${r.timeframe}. Based on the case volume we can see in public referral patterns, that gap is worth roughly $${r.estimatedAnnualValue.toLocaleString()} per year.`,
    );
    bodyLines.push("");
    bodyLines.push(
      `Alloro runs a referral diagnostic that surfaces which GPs have shifted, where their cases are going, and what changed. If a five-minute look would be useful, reply with a yes and I'll send it over.`,
    );
  } else if (
    tier === "A" &&
    wedge.autoBuildPreview &&
    prospect.vertical === "orthodontist"
  ) {
    const previewUrl = wedge.autoBuildPreview.previewUrl;
    const practiceLabel = prospect.practiceName ?? "your practice";
    subject = `90-second site preview for ${practiceLabel}${retryTag}`;
    bodyLines.push(
      `I built a website preview for ${practiceLabel} in 90 seconds using your existing Google data: ${previewUrl}.`,
    );
    bodyLines.push("");
    bodyLines.push(
      `No catch. Take a look. If you want to keep it, Alloro handles the domain transfer. If not, no harm done.`,
    );
  } else if (tier === "B" && wedge.analyzerFindings) {
    const f = wedge.analyzerFindings;
    const cityPart = prospect.city ? ` in ${prospect.city}` : "";
    const searchTerm = prospect.city
      ? `${f.specialty} ${prospect.city}`
      : f.specialty;
    subject = `${prospect.practiceName ?? "your practice"} ranks #${f.rankPosition} for ${f.specialty}${retryTag}`;
    bodyLines.push(
      `${prospect.practiceName ?? "Your practice"}${cityPart} currently ranks #${f.rankPosition} for "${searchTerm}". ${f.competitorName} ranks above you with ${f.competitorReviewDelta} more Google reviews.`,
    );
    bodyLines.push("");
    bodyLines.push(
      `Alloro's free 90-second Practice Analyzer pulls the rest of the picture (which competitors rank above, what GPs are searching, what your GBP shows). Run it at alloro.com/checkup.`,
    );
  } else if (tier === "B") {
    // Tier B with no analyzer findings yet — describe what the analyzer would surface.
    subject = `Free 90-second Practice Analyzer for ${prospect.practiceName ?? "your practice"}${retryTag}`;
    bodyLines.push(
      `Alloro's Practice Analyzer pulls how ${prospect.practiceName ?? "your practice"} shows up against ${prospect.vertical === "endodontist" ? "other endodontists" : "other orthodontists"} on Google${prospect.city ? ` in ${prospect.city}` : ""}: review counts, ranks, GBP completeness, and which competitors patients see first.`,
    );
    bodyLines.push("");
    bodyLines.push(
      `It runs in 90 seconds at alloro.com/checkup. No signup. Reply if a look would help.`,
    );
  } else {
    // Tier C light-effort wedge.
    const localPart = prospect.city
      ? ` in ${prospect.city}${prospect.state ? `, ${prospect.state}` : ""}`
      : "";
    subject = `90-second look at ${prospect.practiceName ?? "your practice"}${retryTag}`;
    bodyLines.push(
      `Found ${prospect.practiceName ?? "your practice"}${localPart} while pulling ${prospect.vertical} data for Alloro's Practice Analyzer.`,
    );
    if (prospect.gbpReviewCount !== undefined) {
      bodyLines.push("");
      bodyLines.push(
        `One specific data point we noticed: ${prospect.gbpReviewCount} Google reviews on file${prospect.gbpRating ? ` at a ${prospect.gbpRating} rating` : ""}.`,
      );
    }
    bodyLines.push("");
    bodyLines.push(
      `If a 90-second analyzer run on the rest of your online presence would be useful, run it free at alloro.com/checkup. One click, no signup.`,
    );
  }

  // Touch-number tail (only Touch 1 has tier wedges; touches 2-4 keep the
  // wedge framing and add a tail referencing the prior touch). v0 only
  // produces Touch 1 in fixtures, so this is mostly defensive.
  if (touchNumber === 2) {
    bodyLines.push("");
    bodyLines.push(
      `Following up on last week's note. ${prospect.vertical === "endodontist" ? "Garrison Endodontics" : "Artful Orthodontics"} ran a similar diagnostic last quarter and recovered a referral channel they didn't know they'd lost.`,
    );
  } else if (touchNumber === 3) {
    bodyLines.push("");
    bodyLines.push(
      `Last note in this thread. The free 90-second analyzer is at alloro.com/checkup. One click, no signup, no follow-up if you don't want one.`,
    );
  } else if (touchNumber === 4) {
    bodyLines.push("");
    bodyLines.push(
      `If a 15-minute call would be useful, reply with a yes and a window. Otherwise, reply "remove" and I'll take you off the list. Either is fine.`,
    );
  }

  bodyLines.push("");
  bodyLines.push(`Corey`);
  bodyLines.push(`Founder, Alloro`);
  bodyLines.push("");
  bodyLines.push(
    `Reply "remove" to opt out. Alloro, ATTN: Cold Outbound, [SENDER MAILING ADDRESS, populated at send-time].`,
  );

  return {
    subject,
    body: bodyLines.join("\n"),
    personalizationElements: elements,
    personalizationSources: extractPersonalizationSources(prospect, tier),
    generatedBy: "template_fallback",
  };
}

// ── Markdown report writer ──────────────────────────────────────────

interface ReportInputs {
  outputDir: string;
  baseName: string;
  drafts: ColdOutboundDraft[];
  skipped: SkippedProspect[];
  summary: ColdOutboundRunSummary;
  vertical: Vertical;
  touchNumber: 1 | 2 | 3 | 4;
  totalInVertical: number;
}

async function writeMarkdownReport(r: ReportInputs): Promise<string> {
  const outputPath = path.join(r.outputDir, `${r.baseName}.md`);
  const lines: string[] = [];
  lines.push(`# Cold Outbound Dry-Run`);
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Mode:** dry-run (no Notion writes, no Mailgun, no analyzer/build calls)`);
  lines.push(`**Vertical:** ${r.vertical}`);
  lines.push(`**Touch:** ${r.touchNumber}`);
  lines.push(`**Prospects in vertical:** ${r.totalInVertical}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Drafted: ${r.summary.drafted}`);
  lines.push(`- Skipped: ${r.summary.skipped}`);
  lines.push(`- Green: ${r.summary.green}`);
  lines.push(`- Yellow: ${r.summary.yellow}`);
  lines.push(`- Red: ${r.summary.red}`);
  lines.push(`- Tier A: ${r.summary.byTier.A}`);
  lines.push(`- Tier B: ${r.summary.byTier.B}`);
  lines.push(`- Tier C: ${r.summary.byTier.C}`);
  lines.push(`- Fallbacks (Tier A → Tier B): ${r.summary.fallbacks}`);
  lines.push("");

  if (r.skipped.length > 0) {
    lines.push("## Skipped");
    lines.push("");
    for (const s of r.skipped) {
      lines.push(`- **${s.prospectId}**: ${s.reason}${s.detail ? `. ${s.detail}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Drafts");
  lines.push("");
  for (const d of r.drafts) {
    const dot =
      d.confidence === "green" ? "GREEN" : d.confidence === "yellow" ? "YELLOW" : "RED";
    const fallbackTag = d.tierAssignment.fallbackFrom
      ? ` (fallback from Tier ${d.tierAssignment.fallbackFrom})`
      : "";
    lines.push(`### ${d.prospectId}. Tier ${d.tier}${fallbackTag}. Confidence: ${dot}`);
    lines.push("");
    lines.push(`**Tier reason:** ${d.tierAssignment.reason}`);
    lines.push(`**Stubs called:** ${d.stubsCalled.length > 0 ? d.stubsCalled.join(", ") : "(none)"}`);
    lines.push("");
    lines.push(`**Subject:** ${d.subject}`);
    lines.push("");
    lines.push(`**Body:**`);
    lines.push("");
    lines.push("```");
    lines.push(d.body);
    lines.push("```");
    lines.push("");
    lines.push(
      `**Personalization sources:** ${d.personalizationSources.join(", ") || "(none)"}`,
    );
    lines.push("");
    lines.push(`**Personalization elements (${d.personalizationElements.length}):**`);
    for (const e of d.personalizationElements) lines.push(`- ${e}`);
    lines.push("");
    lines.push(`**Gates:**`);
    lines.push(
      `- Human Authenticity: ${d.gates.humanAuthenticity.passed ? "PASS" : "FAIL"} ` +
        `(score ${d.gates.humanAuthenticity.score}, retried=${d.gates.humanAuthenticity.retried}, ` +
        `flags: ${d.gates.humanAuthenticity.flags.join("; ") || "none"})`,
    );
    lines.push(
      `- Voice: ${d.gates.voice.passed ? "PASS" : "FAIL"} ` +
        `(violations: ${d.gates.voice.violations.join("; ") || "none"}; ` +
        `warnings: ${d.gates.voice.warnings.join("; ") || "none"})`,
    );
    lines.push(
      `- Readability (Haiku): ${d.gates.readability.passed ? "PASS" : "FAIL"} ` +
        `[source: ${d.gates.readability.source}] ` +
        `(issues: ${d.gates.readability.issues.join("; ") || "none"})`,
    );
    lines.push(
      `- Cross-personalization: ${d.gates.crossPersonalization.uniqueElementCount} unique element(s); ` +
        `shared: ${d.gates.crossPersonalization.sharedElements.join("; ") || "none"}`,
    );
    if (d.confidenceReasons.length > 0) {
      lines.push(`**Confidence reasoning:**`);
      for (const reason of d.confidenceReasons) lines.push(`- ${reason}`);
    }
    lines.push(`**Generated by:** ${d.generatedBy}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  fs.mkdirSync(r.outputDir, { recursive: true });
  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  return outputPath;
}

// ── Cron registration scaffolding (gated; does not fire) ────────────

/**
 * Register the cold-outbound cron schedule.
 *
 * v0: scaffolding only. COLD_OUTBOUND_ENABLED defaults to false. When
 * eventually authorized, a host-side scheduler would call runColdOutbound
 * daily at 09:00 PT against the ICP source DB at a 100-prospects-per-day
 * rate. The actual scheduling library wiring is deferred until:
 *  - ALLORO_N8N_WEBHOOK_URL destination is live
 *  - runPracticeAnalyzer is extracted as a callable
 *  - runPatientPathBuild is extracted as a callable
 *  - ICP source DB is seeded with endos + orthos
 *  - Corey-approved subject/body templates land in the Decision Log
 *  - First 50 Corey Voice Review gate is in place
 *  - Mailgun sender reputation is verified for cold sends
 */
export function registerColdOutboundCron(): {
  registered: boolean;
  reason?: string;
} {
  if (!COLD_OUTBOUND_ENABLED) {
    return {
      registered: false,
      reason:
        "COLD_OUTBOUND_ENABLED is false (v0 dry-run only. not authorized to fire).",
    };
  }
  return {
    registered: false,
    reason:
      "v0 scaffolding only. production scheduler wiring deferred until upstream prerequisites land (ALLORO_N8N_WEBHOOK_URL, runPracticeAnalyzer, runPatientPathBuild, ICP DB, Corey templates, first-50 Voice Review, Mailgun reputation).",
  };
}
