/**
 * AAE Nurture Agent — v1 dry-run skeleton.
 *
 * Scope (this session):
 *   - Dry-run mode ONLY. No Notion writes, no Slack, no scrapes, no sends.
 *   - Generates drafts against fixture attendee data and runs them through
 *     three quality gates: Human Authenticity, Voice Constraints,
 *     Cross-Personalization Uniqueness.
 *
 * Gates that are explicitly OUT of scope:
 *   - Practice Analyzer pre-runs (Touch 2 personalization)
 *   - LinkedIn / website scraping
 *   - Real attendee data reads
 *   - Mailgun integration / send path
 *   - Slack notifications
 *   - Cross-system production-visible actions of any kind
 *   - Cron firing — registration is scaffolded but gated behind
 *     AAE_NURTURE_ENABLED which defaults to false.
 *
 * Step 9 approval-required strings (subject/body templates) are NOT
 * baked in. The default draft generator produces neutral placeholder
 * copy clearly labeled "DRY RUN PLACEHOLDER — NOT FOR SEND" so we can
 * exercise the gate logic without prematurely shipping any
 * Corey-approval-pending strings.
 */

import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { checkVoice } from "../narrator/voiceConstraints";
import { checkHumanAuthenticity } from "./humanAuthenticity";
import type {
  AaeAttendee,
  AaeSegment,
  ConfidenceLevel,
  NurtureDraft,
  NurtureRunSummary,
  SkipReason,
  SkippedAttendee,
} from "./aaeNurture.schema";

// ── Feature flag (cron stays dark by default) ───────────────────────

export const AAE_NURTURE_ENABLED =
  process.env.AAE_NURTURE_ENABLED === "true";

// ── Draft generator strategy (injectable for tests) ─────────────────

export interface GeneratedDraft {
  subject: string;
  body: string;
  personalizationElements: string[];
  personalizationSources: string[];
  generatedBy: "sonnet" | "opus_fallback" | "template_fallback";
}

export type DraftGenerator = (input: {
  attendee: AaeAttendee;
  touchNumber: 1 | 2 | 3 | 4;
  retryFeedback?: string;
}) => Promise<GeneratedDraft | null>;

export interface ReadabilityResult {
  readable: boolean;
  issues: string[];
  source: "haiku" | "skipped_no_api_key" | "skipped_error" | "stub";
}

export type ReadabilityChecker = (text: string) => Promise<ReadabilityResult>;

// ── runAaeNurture entry point ───────────────────────────────────────

export interface RunAaeNurtureParams {
  /** Reject anything other than 'dry-run' in v1. */
  mode: "dry-run";
  segmentFilter: AaeSegment;
  touchNumber: 1 | 2 | 3 | 4;
  fixtureAttendees: AaeAttendee[];
  /** Inject a deterministic generator in tests. Default: Sonnet → Opus → template. */
  draftGenerator?: DraftGenerator;
  /** Inject a deterministic readability checker in tests. Default: Haiku, fail-open if no API key. */
  readabilityChecker?: ReadabilityChecker;
  /** /tmp by default. */
  outputDir?: string;
  /** Custom file basename (no extension). Default: aae-nurture-dry-run-<date>. */
  outputBaseName?: string;
}

export interface RunAaeNurtureResult {
  drafts: NurtureDraft[];
  skipped: SkippedAttendee[];
  summary: NurtureRunSummary;
  outputPath: string;
}

export async function runAaeNurture(
  params: RunAaeNurtureParams,
): Promise<RunAaeNurtureResult> {
  if (params.mode !== "dry-run") {
    throw new Error(
      `aaeNurture v1 only supports mode='dry-run' (received '${params.mode}'). ` +
        `Send / Notion-write modes are out of scope until step 9 strings are approved ` +
        `and attendee DB wiring is verified.`,
    );
  }

  const generator = params.draftGenerator ?? defaultDraftGenerator;
  const readability = params.readabilityChecker ?? defaultReadabilityChecker;
  const outputDir = params.outputDir ?? "/tmp";
  const inSegment = params.fixtureAttendees.filter(
    (a) => a.segment === params.segmentFilter,
  );

  const drafts: NurtureDraft[] = [];
  const skipped: SkippedAttendee[] = [];

  for (const attendee of inSegment) {
    const result = await processAttendee(
      attendee,
      params.touchNumber,
      generator,
      readability,
    );
    if (result.kind === "draft") {
      drafts.push(result.draft);
    } else {
      skipped.push(result.skip);
    }
  }

  // Cross-personalization pass (mutates draft confidence/gates).
  applyCrossPersonalization(drafts);

  // Final summary.
  const summary: NurtureRunSummary = {
    drafted: drafts.length,
    skipped: skipped.length,
    jo_review_required: drafts.filter((d) => d.confidence !== "green").length,
    green: drafts.filter((d) => d.confidence === "green").length,
    yellow: drafts.filter((d) => d.confidence === "yellow").length,
  };

  const outputPath = await writeMarkdownReport({
    outputDir,
    baseName: params.outputBaseName ?? defaultBaseName(),
    drafts,
    skipped,
    summary,
    segmentFilter: params.segmentFilter,
    touchNumber: params.touchNumber,
    totalInSegment: inSegment.length,
  });

  return { drafts, skipped, summary, outputPath };
}

function defaultBaseName(): string {
  const d = new Date().toISOString().slice(0, 10);
  return `aae-nurture-dry-run-${d}`;
}

// ── Per-attendee processing ─────────────────────────────────────────

type ProcessResult =
  | { kind: "draft"; draft: NurtureDraft }
  | { kind: "skip"; skip: SkippedAttendee };

async function processAttendee(
  attendee: AaeAttendee,
  touchNumber: 1 | 2 | 3 | 4,
  generator: DraftGenerator,
  readability: ReadabilityChecker,
): Promise<ProcessResult> {
  // Pre-flight: bare minimum personalization signal must exist.
  if (!hasMinimumPersonalization(attendee)) {
    return {
      kind: "skip",
      skip: {
        attendeeId: attendee.attendeeId,
        reason: "no_personalization_data",
        detail:
          "personalization data thin. recommend manual draft or skip.",
      },
    };
  }

  // First generation pass.
  let generated = await generator({ attendee, touchNumber });
  if (!generated) {
    return {
      kind: "skip",
      skip: {
        attendeeId: attendee.attendeeId,
        reason: "draft_generation_failed",
        detail: "generator returned null on first pass.",
      },
    };
  }

  // Gate A: Human Authenticity, with one retry on failure.
  let auth = await checkHumanAuthenticity(generated.body);
  let retried = false;
  if (!auth.authentic) {
    retried = true;
    const feedback = `Previous draft failed authenticity check. Score ${auth.score}. Flags: ${auth.flags.join("; ")}. Rewrite to remove these specific patterns.`;
    const retry = await generator({ attendee, touchNumber, retryFeedback: feedback });
    if (!retry) {
      return {
        kind: "skip",
        skip: {
          attendeeId: attendee.attendeeId,
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
          attendeeId: attendee.attendeeId,
          reason: "human_authenticity_failed_after_retry",
          detail: `score ${auth.score}. flags: ${auth.flags.join("; ")}`,
        },
      };
    }
  }

  // Gate B: Voice Constraints.
  const composed = `${generated.subject}. ${generated.body}`;
  const voice = checkVoice(composed);
  if (!voice.passed) {
    return {
      kind: "skip",
      skip: {
        attendeeId: attendee.attendeeId,
        reason: "voice_violation",
        detail: voice.violations.join("; "),
      },
    };
  }

  // Gate C: Readability (Haiku). Failure caps confidence at Yellow but
  // does not skip the draft. Issues feed into confidenceReasons.
  const readabilityResult = await readability(generated.body);

  // Initial confidence is recomputed after the cross-personalization pass.
  // Seed with placeholder values; resolveConfidence will replace them.
  const confidence: ConfidenceLevel = "yellow";
  const reasons: string[] = [];

  const draft: NurtureDraft = {
    attendeeId: attendee.attendeeId,
    touchNumber,
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
  };

  return { kind: "draft", draft };
}

function hasMinimumPersonalization(a: AaeAttendee): boolean {
  const hasName = !!a.name && a.name.trim().length > 0;
  const hasBoothNotes = !!a.boothNotes && a.boothNotes.trim().length > 0;
  const hasPractice = !!a.practiceName && a.practiceName.trim().length > 0;
  const hasLocation = !!a.city && a.city.trim().length > 0;
  const hasFacts = !!a.practiceFacts && a.practiceFacts.length > 0;
  // No name OR no signal at all → cannot personalize.
  if (!hasName) return false;
  return hasBoothNotes || hasPractice || hasLocation || hasFacts;
}

// ── Cross-personalization uniqueness pass ───────────────────────────

function applyCrossPersonalization(drafts: NurtureDraft[]): void {
  // Build a frequency map: element-text → list of attendeeIds whose draft contains it.
  const seen = new Map<string, string[]>();
  for (const d of drafts) {
    for (const el of d.personalizationElements) {
      const norm = normalizeElement(el);
      if (!seen.has(norm)) seen.set(norm, []);
      seen.get(norm)!.push(d.attendeeId);
    }
  }

  for (const d of drafts) {
    const sharedElements: string[] = [];
    let uniqueCount = 0;
    for (const el of d.personalizationElements) {
      const owners = seen.get(normalizeElement(el)) ?? [];
      const isUniqueToThis =
        owners.length === 1 && owners[0] === d.attendeeId;
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

/**
 * Resolve final confidence from gate results. Readability failure caps
 * confidence at Yellow regardless of personalization uniqueness.
 */
function resolveConfidence(d: NurtureDraft): {
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
    if (uniqueCount === 1) reasons.push("only 1 personalization element unique to this attendee");
    if (uniqueCount === 0) reasons.push("no personalization element unique to this attendee");
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
    .replace(/^[a-z]+:\s*/, ""); // strip a leading "label: " if present
}

// ── Default draft generator: Sonnet → Opus fallback → template ──────

const SONNET_MODEL = "claude-sonnet-4-6";
const OPUS_MODEL = "claude-opus-4-7";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const defaultDraftGenerator: DraftGenerator = async ({
  attendee,
  touchNumber,
  retryFeedback,
}) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[AaeNurture] ANTHROPIC_API_KEY not set. Using template fallback for draft generation.",
    );
    return templateDraft(attendee, touchNumber, retryFeedback);
  }
  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(attendee, touchNumber, retryFeedback);

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
        personalizationSources: extractPersonalizationSources(attendee),
        generatedBy: "sonnet",
      };
    }
  } catch (err: any) {
    console.warn(
      `[AaeNurture] Sonnet generation failed (${err?.message ?? err}). Trying Opus fallback.`,
    );
  }

  // Opus fallback.
  try {
    const message = await client.messages.create({
      model: OPUS_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = parseGeneratorOutput(message);
    if (parsed) {
      console.warn("[AaeNurture] Used Opus fallback after Sonnet failure.");
      return {
        ...parsed,
        personalizationSources: extractPersonalizationSources(attendee),
        generatedBy: "opus_fallback",
      };
    }
  } catch (err: any) {
    console.warn(
      `[AaeNurture] Opus fallback also failed (${err?.message ?? err}). Using template.`,
    );
  }

  return templateDraft(attendee, touchNumber, retryFeedback);
};

// ── Default readability checker (Haiku, fail-open if no API key) ─────

const defaultReadabilityChecker: ReadabilityChecker = async (text) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[AaeNurture] ANTHROPIC_API_KEY not set. Readability gate fail-open (treating as readable).",
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
      console.warn("[AaeNurture] Readability gate: non-text response. Fail-open.");
      return { readable: true, issues: [], source: "skipped_error" };
    }
    const parsed = parseReadabilityJson(block.text);
    if (!parsed) {
      console.warn(
        "[AaeNurture] Readability gate: failed to parse Haiku JSON. Fail-open.",
      );
      return {
        readable: true,
        issues: ["readability gate: failed to parse model JSON"],
        source: "skipped_error",
      };
    }
    return { ...parsed, source: "haiku" };
  } catch (err: any) {
    console.warn(
      `[AaeNurture] Readability gate failed (${err?.message ?? err}). Fail-open.`,
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

function buildPrompt(
  attendee: AaeAttendee,
  touchNumber: 1 | 2 | 3 | 4,
  retryFeedback: string | undefined,
): string {
  const lines: string[] = [];
  lines.push(
    `You are drafting a Touch ${touchNumber} follow-up note from Corey Wise (founder of Alloro) to a doctor we met at the AAE conference. The note will be reviewed by a human (Jo) before any send. This is a DRY RUN draft for gate validation.`,
  );
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
  lines.push("- Tone: direct, peer-to-peer, no fluff. Under 120 words for body.");
  lines.push("- Do NOT use the literal subject lines from the approval-required list. Generate neutral placeholder copy.");
  lines.push("");
  lines.push("Attendee data:");
  lines.push(`- Name: ${attendee.name}`);
  if (attendee.practiceName) lines.push(`- Practice: ${attendee.practiceName}`);
  if (attendee.city || attendee.state)
    lines.push(`- Location: ${[attendee.city, attendee.state].filter(Boolean).join(", ")}`);
  if (attendee.vertical) lines.push(`- Vertical: ${attendee.vertical}`);
  if (attendee.boothNotes) lines.push(`- Booth conversation note: ${attendee.boothNotes}`);
  if (attendee.practiceFacts && attendee.practiceFacts.length > 0) {
    lines.push("- Practice facts:");
    for (const f of attendee.practiceFacts) lines.push(`  • ${f}`);
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
  lines.push("<body text>");
  lines.push("PERSONALIZATION_ELEMENTS:");
  lines.push("- <one specific fact about THIS attendee referenced in the body>");
  lines.push("- <another specific fact, if applicable>");
  return lines.join("\n");
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

function extractPersonalizationSources(a: AaeAttendee): string[] {
  const out: string[] = [];
  if (a.boothNotes && a.boothNotes.trim().length > 0) out.push("booth_notes");
  if (a.practiceName) out.push("practice_name");
  if (a.city) out.push("city");
  if (a.state) out.push("state");
  if (a.vertical) out.push("vertical");
  if (a.practiceFacts && a.practiceFacts.length > 0) out.push("practice_facts");
  return out;
}

// ── Template fallback (used when API key absent or model calls fail) ─

function templateDraft(
  attendee: AaeAttendee,
  touchNumber: 1 | 2 | 3 | 4,
  retryFeedback: string | undefined,
): GeneratedDraft | null {
  // For the dry-run skeleton this produces neutral placeholder copy that is
  // explicitly NOT the approval-required Step 9 strings. Each draft shows
  // its provenance ("[DRY RUN PLACEHOLDER]") so a human reviewing the
  // /tmp report knows this is not Corey-approved final text.
  const elements: string[] = [];

  if (attendee.boothNotes && attendee.boothNotes.trim().length > 0) {
    elements.push(`booth-conversation-note: ${attendee.boothNotes.trim()}`);
  }
  if (attendee.practiceName) {
    elements.push(`practice: ${attendee.practiceName}`);
  }
  if (attendee.city) {
    const loc = attendee.state ? `${attendee.city}, ${attendee.state}` : attendee.city;
    elements.push(`location: ${loc}`);
  }
  if (attendee.practiceFacts) {
    for (const f of attendee.practiceFacts) elements.push(`practice-fact: ${f}`);
  }

  if (elements.length === 0) return null;

  // Neutral placeholder body. No banned phrases. No em-dashes. No exclamation.
  // Under 120 words. Soft retry behavior: trim words if retryFeedback present.
  const subject = retryFeedback
    ? `${attendee.name}, AAE follow-up [retry]`
    : `${attendee.name}, AAE follow-up`;

  const lines: string[] = [];
  lines.push(`[DRY RUN PLACEHOLDER. NOT FOR SEND.]`);
  lines.push("");
  lines.push(`${attendee.name},`);
  lines.push("");
  if (attendee.boothNotes) {
    lines.push(`We talked at AAE about ${attendee.boothNotes.trim()}.`);
  } else if (attendee.practiceName && attendee.city) {
    lines.push(
      `Following up after AAE on ${attendee.practiceName} in ${attendee.city}.`,
    );
  } else if (attendee.practiceName) {
    lines.push(`Following up after AAE on ${attendee.practiceName}.`);
  } else {
    lines.push(`Following up after AAE.`);
  }
  if (attendee.practiceFacts && attendee.practiceFacts[0]) {
    lines.push(`One thing that stuck with me: ${attendee.practiceFacts[0]}.`);
  }
  lines.push(
    `If it would help, the free Practice Analyzer at alloro.com/checkup runs against your Google profile and shows what most patients see before they ever call.`,
  );
  lines.push("");
  lines.push(`Reply if useful, ignore if not.`);
  lines.push("");
  lines.push(`Corey`);

  return {
    subject,
    body: lines.join("\n"),
    personalizationElements: elements,
    personalizationSources: extractPersonalizationSources(attendee),
    generatedBy: "template_fallback",
  };
}

// ── Markdown report writer ──────────────────────────────────────────

interface ReportInputs {
  outputDir: string;
  baseName: string;
  drafts: NurtureDraft[];
  skipped: SkippedAttendee[];
  summary: NurtureRunSummary;
  segmentFilter: AaeSegment;
  touchNumber: 1 | 2 | 3 | 4;
  totalInSegment: number;
}

async function writeMarkdownReport(r: ReportInputs): Promise<string> {
  const outputPath = path.join(r.outputDir, `${r.baseName}.md`);
  const lines: string[] = [];
  lines.push(`# AAE Nurture Dry-Run`);
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Mode:** dry-run (no Notion writes, no scrapes, no sends)`);
  lines.push(`**Segment:** ${r.segmentFilter}`);
  lines.push(`**Touch:** ${r.touchNumber}`);
  lines.push(`**Attendees in segment:** ${r.totalInSegment}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Drafted: ${r.summary.drafted}`);
  lines.push(`- Skipped: ${r.summary.skipped}`);
  lines.push(`- Jo review required: ${r.summary.jo_review_required}`);
  lines.push(`- Green: ${r.summary.green}`);
  lines.push(`- Yellow: ${r.summary.yellow}`);
  lines.push("");

  if (r.skipped.length > 0) {
    lines.push("## Skipped");
    lines.push("");
    for (const s of r.skipped) {
      lines.push(`- **${s.attendeeId}**: ${s.reason}${s.detail ? `. ${s.detail}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Drafts");
  lines.push("");
  for (const d of r.drafts) {
    const dot = d.confidence === "green" ? "GREEN" : d.confidence === "yellow" ? "YELLOW" : "RED";
    lines.push(`### ${d.attendeeId}. Confidence: ${dot}`);
    lines.push("");
    lines.push(`**Subject:** ${d.subject}`);
    lines.push("");
    lines.push(`**Body:**`);
    lines.push("");
    lines.push("```");
    lines.push(d.body);
    lines.push("```");
    lines.push("");
    lines.push(`**Personalization sources:** ${d.personalizationSources.join(", ") || "(none)"}`);
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
 * Register the AAE nurture cron schedule.
 *
 * v1: scaffolding only. AAE_NURTURE_ENABLED defaults to false. When true,
 * a host-side scheduler (mondayChain-style) would call runAaeNurture daily.
 * The actual scheduling library wiring is deferred until production-write
 * mode is authorized.
 */
export function registerAaeNurtureCron(): { registered: boolean; reason?: string } {
  if (!AAE_NURTURE_ENABLED) {
    return {
      registered: false,
      reason: "AAE_NURTURE_ENABLED is false (v1 dry-run only. not authorized to fire).",
    };
  }
  // Intentionally not wired to a scheduler yet. v2 will:
  //   - Compute due-touch attendees by conversation_date offset (3/10/24/42 days)
  //   - Call runAaeNurture in 'send' mode (which doesn't exist in v1)
  //   - Push approved drafts to the Notion AAE Nurture Draft Inbox
  //   - Post a #alloro-dev Slack notification tagging Jo
  return {
    registered: false,
    reason: "v1 scaffolding only. production scheduler wiring deferred until step 9 strings approved and attendee DB verified.",
  };
}
