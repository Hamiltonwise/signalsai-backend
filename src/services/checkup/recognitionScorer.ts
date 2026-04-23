/**
 * Recognition Tri-Score — the Checkup entry-point pull.
 *
 * Scores a practice against The Standard in three modes simultaneously
 * (SEO + AEO + CRO) because all three failures share the same root cause
 * (stock content) and the same root solution (authentic specificity).
 *
 * Inputs:
 *   - practice URL (required)
 *   - optional specialty / location (improves judge metadata)
 *   - optional competitor URLs (if omitted, the caller resolves from
 *     existing GBP competitor data for this market)
 *
 * Outputs:
 *   - three composite scores (seo, aeo, cro) 0-100
 *   - per-dimension breakdown per mode
 *   - 3-5 concrete examples of patient-review language NOT on the site
 *   - optional competitor comparisons
 *
 * Feature flag: recognition_score_enabled. Default false. The scorer
 * still runs in shadow (returns output) — but callers should gate
 * surfacing the Recognition section in Checkup UI on the flag.
 */

import Anthropic from "@anthropic-ai/sdk";
import { fetchPage, extractText } from "../webFetch";
import { textSearch, getPlaceDetails, isApiKeyConfigured } from "../../controllers/places/feature-services/GooglePlacesApiService";
import { score as runRubric } from "../rubric/standardRubric";
import type { ScoreResult } from "../rubric/types";
import {
  getVocab,
  HEALTHCARE_DEFAULT_VOCAB,
  type VocabConfig,
} from "../vocabulary/vocabLoader";

export interface RecognitionScorerInput {
  practiceUrl: string;
  specialty?: string;
  location?: string;
  competitorUrls?: string[];
  /** Optional: hand in a placeId if already known, else we textSearch by domain. */
  placeId?: string;
  /** Optional org id — resolves vertical-aware about-page candidates. */
  orgId?: number;
  /** Optional practice name — used to derive /about-dr-[firstword] for healthcare. */
  practiceName?: string;
}

export interface MissingExample {
  phrase: string;
  sourceReview: string;
  reviewerName?: string;
  verified: boolean;
  verificationReasoning: string;
}

export interface PatientQuote {
  text: string;
  reviewerName?: string;
  rating: number;
  when?: string;
}

export interface RecognitionScoreEntry {
  url: string;
  name?: string;
  pageFetched: boolean;
  pageFetchError?: string;
  contentChars: number;
  seo_score: ScoreResult | null;
  aeo_score: ScoreResult | null;
  cro_score: ScoreResult | null;
  seo_composite: number | null;
  aeo_composite: number | null;
  cro_composite: number | null;
  missing_examples: MissingExample[];
  patient_quotes_not_on_site: PatientQuote[];
  review_count: number;
}

export interface RecognitionScorerResult {
  practice: RecognitionScoreEntry;
  competitors: RecognitionScoreEntry[];
  rubric_version_id: string | null;
  run_timestamp: string;
  review_data_available: boolean;
  warnings: string[];
}

// ── helpers ─────────────────────────────────────────────────────────

const MAX_REVIEWS = 5;
const FETCH_TIMEOUT_MS = 10_000;

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normalizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

/**
 * Healthcare / non-healthcare about-page candidates.
 *
 * Healthcare (hipaa_mode=true OR schemaSubType=Dentist):
 *   /meet-the-doctor and /about-dr-[first word of practiceName lowercased],
 *   plus the generic /about, /about-us. The per-doctor URL is derived from
 *   the practice name at call time — never hardcoded.
 *
 * Non-healthcare:
 *   /about, /about-us, /our-team, /meet-the-team, /who-we-are.
 *
 * The per-doctor about path is derived at call time from practiceName. No
 * literal doctor-name path strings live in the codebase — a grep assertion
 * in the recognitionScorer test enforces this.
 */
export function getAboutCandidates(
  vocab: VocabConfig,
  baseUrl: string,
  practiceName: string | undefined
): string[] {
  const base = baseUrl.replace(/\/$/, "");
  const isHealthcare =
    vocab.capabilities.hipaa_mode === true || vocab.schemaSubType === "Dentist";

  if (isHealthcare) {
    const firstWord = (practiceName ?? "")
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    const candidates = [
      `${base}/about`,
      `${base}/about-us`,
      `${base}/meet-the-doctor`,
      `${base}/our-team`,
      `${base}/team`,
    ];
    if (firstWord) {
      candidates.splice(2, 0, `${base}/about-dr-${firstWord}`);
    }
    return candidates;
  }

  return [
    `${base}/about`,
    `${base}/about-us`,
    `${base}/our-team`,
    `${base}/meet-the-team`,
    `${base}/who-we-are`,
  ];
}

/**
 * Fetch homepage and about page as plain text. Falls back to homepage-only
 * if about is not found. The `about` variants we try mirror what the
 * InstantWebsiteGenerator emits (broad coverage across template systems).
 */
async function fetchSiteContent(
  practiceUrl: string,
  vocab: VocabConfig,
  practiceName: string | undefined
): Promise<{
  content: string;
  pageFetched: boolean;
  pageFetchError?: string;
  pagesFetched: string[];
}> {
  const pagesFetched: string[] = [];
  const baseUrl = normalizeUrl(practiceUrl).replace(/\/$/, "");
  const home = await fetchPage(baseUrl);
  if (!home.success || !home.html) {
    return {
      content: "",
      pageFetched: false,
      pageFetchError: home.error ?? "unknown",
      pagesFetched,
    };
  }
  pagesFetched.push(baseUrl);
  const homeText = await extractText(home.html);

  const aboutCandidates = getAboutCandidates(vocab, baseUrl, practiceName);
  let aboutText = "";
  for (const candidate of aboutCandidates) {
    const result = await fetchPage(candidate);
    if (result.success && result.html) {
      aboutText = await extractText(result.html);
      pagesFetched.push(candidate);
      break;
    }
  }

  const combined = aboutText ? `${homeText}\n\n--- ABOUT ---\n${aboutText}` : homeText;
  return { content: combined, pageFetched: true, pagesFetched };
}

/**
 * Resolve a placeId for this URL via Places Text Search. Uses the domain's
 * second-level label + practice name guess as the query. Returns null if no
 * reasonable match found.
 */
async function resolvePlaceId(
  url: string,
  specialty?: string,
  location?: string
): Promise<string | null> {
  if (!isApiKeyConfigured()) return null;
  const domain = extractDomain(url);
  const label = domain.split(".")[0].replace(/[-_]/g, " ");
  const queryParts = [label, specialty, location].filter(Boolean);
  const query = queryParts.join(" ");
  try {
    const places = await textSearch(query, 5);
    // Prefer a result whose website maps to our domain.
    for (const place of places) {
      const website: string | undefined = place?.websiteUri;
      if (typeof website === "string" && website.toLowerCase().includes(domain.toLowerCase())) {
        return place.id ?? null;
      }
    }
    // Fallback: first result.
    return places?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function fetchReviewsForUrl(
  url: string,
  placeIdHint: string | undefined,
  specialty?: string,
  location?: string
): Promise<PatientQuote[]> {
  const placeId = placeIdHint ?? (await resolvePlaceId(url, specialty, location));
  if (!placeId) return [];
  try {
    const details = await getPlaceDetails(placeId);
    const reviews = Array.isArray(details?.reviews) ? details.reviews : [];
    return reviews
      .filter((r: any) => typeof r?.rating === "number" && r.rating >= 4)
      .slice(0, MAX_REVIEWS)
      .map((r: any) => ({
        text: r.text?.text ?? r.originalText?.text ?? "",
        reviewerName: r.authorAttribution?.displayName,
        rating: r.rating ?? 0,
        when: r.relativePublishTimeDescription,
      }))
      .filter((q: PatientQuote) => q.text.length > 0);
  } catch {
    return [];
  }
}

// ── missing-example extraction ──────────────────────────────────────

const MIN_PHRASE_LEN = 4;
const MAX_PHRASE_LEN = 14;
const STOP = new Set([
  "the","a","an","of","to","and","or","for","in","on","at","with","by","is","are","was","were","be",
  "been","being","i","me","my","we","our","they","he","she","it","this","that","these","those",
  "had","have","has","do","does","did","so","very","really","just","also","not","no","yes","would",
  "could","will","can","get","got","like","about","really","than","then","but","if",
]);

/**
 * Extract candidate phrases (multi-word noun-ish spans) from review text
 * that are NOT substring-present in the site content. Produces 3-5 examples.
 * Uses cheap string matching first, then LLM verification to cut the list
 * down to "concrete things a patient said that the site never mentions."
 */
async function extractMissingExamples(
  reviews: PatientQuote[],
  siteContent: string
): Promise<MissingExample[]> {
  if (reviews.length === 0) return [];

  const site = siteContent.toLowerCase();
  const candidates: Array<{ phrase: string; sourceReview: string; reviewerName?: string }> = [];

  for (const review of reviews) {
    const sentences = review.text
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).filter((w) => w.length > 2);
      if (words.length < MIN_PHRASE_LEN) continue;
      // Extract meaningful contiguous bigrams/trigrams that aren't all stopwords.
      for (let n = 3; n <= Math.min(6, words.length); n++) {
        for (let i = 0; i + n <= words.length; i++) {
          const phrase = words.slice(i, i + n).join(" ").toLowerCase().replace(/[^a-z0-9 ]/g, "");
          if (phrase.length < 10 || phrase.length > 80) continue;
          const phraseWords = phrase.split(" ");
          if (phraseWords.every((w) => STOP.has(w))) continue;
          if (phraseWords.length > MAX_PHRASE_LEN) continue;
          if (site.includes(phrase)) continue;
          candidates.push({
            phrase,
            sourceReview: review.text,
            reviewerName: review.reviewerName,
          });
        }
      }
    }
  }

  // Dedupe, keep first-seen.
  const seen = new Set<string>();
  const unique: typeof candidates = [];
  for (const c of candidates) {
    if (seen.has(c.phrase)) continue;
    seen.add(c.phrase);
    unique.push(c);
    if (unique.length >= 25) break;
  }

  if (unique.length === 0) return [];

  const verified = await verifyMissingExamples(unique, siteContent);
  // Cap at 5, prefer verified=true first.
  const sorted = verified.sort((a, b) => Number(b.verified) - Number(a.verified)).slice(0, 5);
  return sorted;
}

interface VerifyResponse {
  items: Array<{ phrase: string; verified: boolean; reasoning: string }>;
}

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

async function verifyMissingExamples(
  candidates: Array<{ phrase: string; sourceReview: string; reviewerName?: string }>,
  siteContent: string
): Promise<MissingExample[]> {
  // Even with the LLM verifier disabled, return the raw candidates as
  // unverified so the tri-score never returns an empty missing_examples
  // block if the site really is missing the review language.
  const fallback: MissingExample[] = candidates.slice(0, 5).map((c) => ({
    phrase: c.phrase,
    sourceReview: c.sourceReview,
    reviewerName: c.reviewerName,
    verified: false,
    verificationReasoning: "String-match only; LLM verification unavailable.",
  }));

  try {
    const prompt = `You are verifying which phrases pulled from a patient review are GENUINELY missing from a practice's website (i.e. the site says nothing about that theme), versus phrases the reviewer used that the site covers using slightly different wording.

Site content (first 6000 chars):
---
${siteContent.slice(0, 6000)}
---

Candidate phrases (each pulled from a patient review):
${candidates.slice(0, 15).map((c, i) => `${i + 1}. "${c.phrase}" — from: "${c.sourceReview.slice(0, 300)}"`).join("\n")}

For each candidate, decide: is this genuinely MISSING from the site (the practice doesn't tell this story about themselves)? Or is the theme covered on the site using different words?

Return strict JSON only:
{
  "items": [
    { "phrase": "<exact candidate phrase>", "verified": <true if genuinely missing>, "reasoning": "<one sentence>" }
  ]
}

No preamble, no trailing commentary.`;

    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      temperature: 0.2,
      system: "You are a terse verifier. You answer with strict JSON.",
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as VerifyResponse;
    if (!Array.isArray(parsed.items)) return fallback;

    const byPhrase = new Map(parsed.items.map((i) => [i.phrase.toLowerCase(), i]));
    const results: MissingExample[] = [];
    for (const c of candidates) {
      const lookup = byPhrase.get(c.phrase.toLowerCase());
      results.push({
        phrase: c.phrase,
        sourceReview: c.sourceReview,
        reviewerName: c.reviewerName,
        verified: Boolean(lookup?.verified),
        verificationReasoning: lookup?.reasoning ?? "Candidate; not reviewed by verifier.",
      });
    }
    return results;
  } catch {
    return fallback;
  }
}

// ── tri-score runner ────────────────────────────────────────────────

async function scoreEntry(
  url: string,
  specialty: string | undefined,
  location: string | undefined,
  placeIdHint: string | undefined,
  vocab: VocabConfig,
  practiceName: string | undefined
): Promise<RecognitionScoreEntry> {
  const { content, pageFetched, pageFetchError } = await fetchSiteContent(
    url,
    vocab,
    practiceName
  );

  const entry: RecognitionScoreEntry = {
    url,
    pageFetched,
    pageFetchError,
    contentChars: content.length,
    seo_score: null,
    aeo_score: null,
    cro_score: null,
    seo_composite: null,
    aeo_composite: null,
    cro_composite: null,
    missing_examples: [],
    patient_quotes_not_on_site: [],
    review_count: 0,
  };

  if (!pageFetched || content.length === 0) return entry;

  const reviews = await fetchReviewsForUrl(url, placeIdHint, specialty, location);
  entry.review_count = reviews.length;

  const reviewTexts = reviews.map((r) => r.text);

  // Score in parallel — each mode is an independent judge call.
  const [seo, aeo, cro] = await Promise.all([
    runRubric(content, {
      mode: "seo",
      metadata: {
        url,
        specialty,
        location,
        patientReviewText: reviewTexts,
      },
    }),
    runRubric(content, {
      mode: "aeo",
      metadata: {
        url,
        specialty,
        location,
        patientReviewText: reviewTexts,
      },
    }),
    runRubric(content, {
      mode: "cro",
      metadata: {
        url,
        specialty,
        location,
        patientReviewText: reviewTexts,
      },
    }),
  ]);

  entry.seo_score = seo;
  entry.aeo_score = aeo;
  entry.cro_score = cro;
  entry.seo_composite = seo.composite;
  entry.aeo_composite = aeo.composite;
  entry.cro_composite = cro.composite;

  // Missing examples and quotes only surfaced for patient-facing entries.
  if (reviews.length > 0) {
    entry.patient_quotes_not_on_site = reviews.filter((r) => {
      const firstWords = r.text.split(/\s+/).slice(0, 8).join(" ").toLowerCase();
      return firstWords.length > 0 && !content.toLowerCase().includes(firstWords);
    });
    entry.missing_examples = await extractMissingExamples(reviews, content);
  }

  return entry;
}

// ── public API ──────────────────────────────────────────────────────

/**
 * Score a practice in all three modes and (optionally) its competitors.
 * Never throws — surfaces errors in the result envelope.
 */
export async function scoreRecognition(
  input: RecognitionScorerInput
): Promise<RecognitionScorerResult> {
  const warnings: string[] = [];

  // Resolve vocab once per run. Competitor scoring reuses the same vocab —
  // the about-candidate shape reflects the org the run was commissioned for,
  // not whatever vertical the competitor happens to be in.
  const vocab = input.orgId != null
    ? await getVocab(input.orgId)
    : { ...HEALTHCARE_DEFAULT_VOCAB, capabilities: { ...HEALTHCARE_DEFAULT_VOCAB.capabilities } };

  const practice = await scoreEntry(
    input.practiceUrl,
    input.specialty,
    input.location,
    input.placeId,
    vocab,
    input.practiceName
  );

  if (!practice.pageFetched) {
    warnings.push(`practice_url fetch failed: ${practice.pageFetchError ?? "unknown"}`);
  }
  if (practice.review_count === 0 && practice.pageFetched) {
    warnings.push("No 4+ star Google reviews available; Patient Voice Match may be N/A.");
  }

  const competitors: RecognitionScoreEntry[] = [];
  const competitorUrls = input.competitorUrls ?? [];
  for (const competitorUrl of competitorUrls.slice(0, 3)) {
    const entry = await scoreEntry(
      competitorUrl,
      input.specialty,
      input.location,
      undefined,
      vocab,
      input.practiceName
    );
    competitors.push(entry);
  }

  const rubric_version_id = practice.seo_score?.rubric_version_id ?? null;

  return {
    practice,
    competitors,
    rubric_version_id,
    run_timestamp: new Date().toISOString(),
    review_data_available: practice.review_count > 0,
    warnings,
  };
}
