/**
 * Checkup Tri-Score Upgrade — transforms the Checkup tool's primary
 * output from Clarity Score to Recognition Tri-Score.
 *
 * When checkup_tri_score_enabled is ON:
 *   1. Recognition Tri-Score (SEO, AEO, CRO, composite) as primary output
 *   2. 3 missing examples from Google reviews
 *   3. Top 2 recommendations from rubric (lowest-scoring dimensions)
 *   4. Prospect-appropriate framing (inviting, not indicting)
 *   5. Clear next step CTA
 *   6. Existing Clarity Score preserved as secondary section
 *
 * When flag is OFF: existing output returned unchanged.
 *
 * Feature flag: checkup_tri_score_enabled (default false)
 * Copy config: Notion page "Checkup Tool Copy v1" under Alloro HQ
 */

import { scoreRecognition } from "./recognitionScorer";
import type {
  RecognitionScorerResult,
  RecognitionScoreEntry,
  MissingExample,
} from "./recognitionScorer";
import { isEnabled } from "../featureFlags";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { loadCheckupCopyConfig } from "./checkupNotionConfig";

// ── Types ────────────────────────────────────────────────────────────

export interface CheckupTriScoreInput {
  practiceUrl?: string;
  practiceName: string;
  specialty?: string;
  location?: string;
  placeId?: string;
  sessionId?: string;
  orgId?: number;
}

export interface TriScoreSection {
  seo: number | null;
  aeo: number | null;
  cro: number | null;
  composite: number | null;
  label: string;
  summary: string;
}

export interface MissingExampleDisplay {
  phrase: string;
  context: string;
  reviewerFirstName: string;
}

export interface RecommendationDisplay {
  title: string;
  detail: string;
  dimension: string;
  priority: number;
}

export interface ProspectFraming {
  headline: string;
  subheadline: string;
  triScore: TriScoreSection;
  missingExamples: MissingExampleDisplay[];
  recommendations: RecommendationDisplay[];
  patientQuote: { text: string; firstName: string; rating: number } | null;
  nextStep: {
    label: string;
    description: string;
  };
  disclaimer: string;
}

export interface CheckupTriScoreResult {
  enabled: boolean;
  prospectFraming: ProspectFraming | null;
  rawResult: RecognitionScorerResult | null;
  eventEmitted: boolean;
}

// ── Main entry ───────────────────────────────────────────────────────

export async function computeCheckupTriScore(
  input: CheckupTriScoreInput
): Promise<CheckupTriScoreResult> {
  const flagEnabled = await isEnabled("checkup_tri_score_enabled", input.orgId);

  if (!flagEnabled) {
    return { enabled: false, prospectFraming: null, rawResult: null, eventEmitted: false };
  }

  if (!input.practiceUrl) {
    return { enabled: true, prospectFraming: null, rawResult: null, eventEmitted: false };
  }

  const result = await scoreRecognition({
    practiceUrl: input.practiceUrl,
    specialty: input.specialty,
    location: input.location,
    placeId: input.placeId,
  });

  const config = await loadCheckupCopyConfig();
  const framing = buildProspectFraming(result, input, config);

  // Emit prospect event
  let eventEmitted = false;
  try {
    await BehavioralEventModel.create({
      event_type: "checkup.tri_score_completed",
      org_id: input.orgId ?? null,
      session_id: input.sessionId ?? null,
      properties: {
        url: input.practiceUrl,
        practice_name: input.practiceName,
        seo_composite: result.practice.seo_composite,
        aeo_composite: result.practice.aeo_composite,
        cro_composite: result.practice.cro_composite,
        composite: computeComposite(result.practice),
        missing_examples_count: result.practice.missing_examples.length,
        review_count: result.practice.review_count,
        review_data_available: result.review_data_available,
        rubric_version_id: result.rubric_version_id,
        timestamp: new Date().toISOString(),
      },
    });
    eventEmitted = true;
  } catch {
    // Event emission is non-blocking
  }

  return { enabled: true, prospectFraming: framing, rawResult: result, eventEmitted };
}

// ── Prospect framing ─────────────────────────────────────────────────

function buildProspectFraming(
  result: RecognitionScorerResult,
  input: CheckupTriScoreInput,
  config: Awaited<ReturnType<typeof loadCheckupCopyConfig>>
): ProspectFraming {
  const p = result.practice;
  const composite = computeComposite(p);

  // Score label
  const label = composite != null
    ? composite >= 70
      ? config.scoreLabels?.strong ?? "Strong"
      : composite >= 40
        ? config.scoreLabels?.developing ?? "Developing"
        : config.scoreLabels?.needs_attention ?? "Needs attention"
    : "Pending";

  // Summary: prospect-appropriate, inviting not indicting
  const summary = buildSummary(p, input.practiceName, composite, config);

  // Missing examples (top 3, prospect-safe framing)
  const missingExamples = p.missing_examples
    .filter((e) => e.verified)
    .slice(0, 3)
    .map((e) => formatMissingExample(e));

  // If not enough verified, include unverified
  if (missingExamples.length < 3) {
    const remaining = p.missing_examples
      .filter((e) => !e.verified)
      .slice(0, 3 - missingExamples.length)
      .map((e) => formatMissingExample(e));
    missingExamples.push(...remaining);
  }

  // Top 2 recommendations from lowest-scoring dimensions
  const recommendations = extractTopRecommendations(p, config);

  // Patient quote (first name only, HIPAA safe)
  let patientQuote: ProspectFraming["patientQuote"] = null;
  if (p.patient_quotes_not_on_site.length > 0) {
    const quote = p.patient_quotes_not_on_site[0];
    const firstName = (quote.reviewerName ?? "A patient")
      .split(" ")[0]
      .replace(/[^a-zA-Z]/g, "");
    patientQuote = {
      text: quote.text.slice(0, 200),
      firstName: firstName || "A patient",
      rating: quote.rating,
    };
  }

  return {
    headline: config.headline ?? `Here's how ${input.practiceName} shows up online`,
    subheadline:
      config.subheadline ??
      "We scored your practice against the same criteria Google, AI assistants, and prospective patients use to choose a provider.",
    triScore: {
      seo: p.seo_composite,
      aeo: p.aeo_composite,
      cro: p.cro_composite,
      composite,
      label,
      summary,
    },
    missingExamples,
    recommendations,
    patientQuote,
    nextStep: {
      label: config.ctaLabel ?? "See the full report",
      description:
        config.ctaDescription ??
        "Get your complete Recognition Report with competitor comparison, specific recommendations, and a weekly update showing your progress.",
    },
    disclaimer:
      config.disclaimer ??
      "Scores are based on publicly available data from Google and your website. No login required. No data stored without your permission.",
  };
}

function buildSummary(
  p: RecognitionScoreEntry,
  name: string,
  composite: number | null,
  config: any
): string {
  if (composite == null) {
    return `We checked ${name} against the criteria that matter for visibility — but we need your website URL to complete the picture.`;
  }

  if (composite >= 70) {
    return (
      config.summaryTemplates?.strong ??
      `${name} already has strong signals across search, AI assistants, and patient experience. ${
        p.missing_examples.length > 0
          ? `Your patients say things about you that your website doesn't mention yet — that's the gap.`
          : `The next step is maintaining this position as the market moves.`
      }`
    );
  }

  if (composite >= 40) {
    return (
      config.summaryTemplates?.developing ??
      `${name} has a solid foundation, but there are specific areas where your online presence doesn't reflect what your patients already know about you. ${
        p.missing_examples.length > 0
          ? `We found ${p.missing_examples.length} things patients say that your website never mentions.`
          : `Small changes can make a meaningful difference.`
      }`
    );
  }

  return (
    config.summaryTemplates?.needs_attention ??
    `${name} has room to grow online. ${
      p.missing_examples.length > 0
        ? `Your patients describe their experience in ways your website hasn't captured yet — and that's exactly where the opportunity is.`
        : `The good news: the path forward is straightforward.`
    }`
  );
}

function formatMissingExample(e: MissingExample): MissingExampleDisplay {
  const firstName = (e.reviewerName ?? "A patient")
    .split(" ")[0]
    .replace(/[^a-zA-Z]/g, "");
  return {
    phrase: e.phrase,
    context: e.sourceReview.slice(0, 150),
    reviewerFirstName: firstName || "A patient",
  };
}

function extractTopRecommendations(
  p: RecognitionScoreEntry,
  config: any
): RecommendationDisplay[] {
  const recs: RecommendationDisplay[] = [];

  // Collect all dimension scores across modes, pick worst performers
  const dimensionScores: Array<{
    key: string;
    score: number;
    max: number;
    reasoning: string;
    mode: string;
  }> = [];

  for (const [mode, scoreResult] of [
    ["SEO", p.seo_score],
    ["AEO", p.aeo_score],
    ["CRO", p.cro_score],
  ] as const) {
    if (!scoreResult?.dimensions) continue;
    for (const [key, dim] of Object.entries(scoreResult.dimensions)) {
      if (dim.verdict === "n_a" || dim.max === 0) continue;
      dimensionScores.push({
        key,
        score: dim.score,
        max: dim.max,
        reasoning: dim.reasoning,
        mode,
      });
    }
  }

  // Sort by score/max ratio ascending (worst first)
  dimensionScores.sort((a, b) => a.score / a.max - b.score / b.max);

  // Dedupe by dimension key, take top 2
  const seen = new Set<string>();
  for (const dim of dimensionScores) {
    if (seen.has(dim.key)) continue;
    seen.add(dim.key);

    const rec = buildRecommendation(dim.key, dim.reasoning, dim.mode, config);
    if (rec) recs.push(rec);
    if (recs.length >= 2) break;
  }

  return recs;
}

function buildRecommendation(
  dimensionKey: string,
  reasoning: string,
  mode: string,
  config: any
): RecommendationDisplay | null {
  // Prospect-friendly titles (no rubric internals exposed)
  const titles: Record<string, string> = {
    meta_question: "Lead with what makes you different",
    recognition_test: "Tell your unique story",
    patient_voice_match: "Use your patients' own words",
    recipe_compliance: "Be specific, not generic",
    cesar_millan: "Let your expertise speak for itself",
    mom_test: "Keep it simple and clear",
    provenance: "Back it up with real data",
    never_blank: "Fill in the gaps",
    public_safe: "Keep it professional",
    fear_acknowledged: "Acknowledge what patients feel first",
  };

  const title = titles[dimensionKey];
  if (!title) return null;

  // Simplify reasoning for prospect audience
  const detail = reasoning
    .replace(/the site/gi, "your website")
    .replace(/the copy/gi, "the content")
    .replace(/the output/gi, "the content")
    .replace(/\bN\/A\b/g, "not applicable")
    .slice(0, 200);

  return {
    title,
    detail,
    dimension: dimensionKey,
    priority: mode === "CRO" ? 1 : mode === "SEO" ? 2 : 3,
  };
}

function computeComposite(p: RecognitionScoreEntry): number | null {
  if (p.seo_composite == null || p.aeo_composite == null || p.cro_composite == null) {
    return null;
  }
  return Math.round((p.seo_composite + p.aeo_composite + p.cro_composite) / 3);
}
