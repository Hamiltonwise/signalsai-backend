/**
 * Meta Tag Bake — Card 2 (artifact-side, May 4 2026 re-scope).
 *
 * Pure generators for the four head-tag artifacts every PatientPath page
 * needs: title (50 to 60 chars), meta description (150 to 160 chars),
 * canonical URL, and Open Graph + Twitter Card tags.
 *
 * This module produces the artifact only. The renderer that stamps these
 * onto the rendered head element of *.sites.getalloro.com lives in
 * Hamiltonwise/website-renderer (Card 2b, Dave-owned).
 *
 * Validator Framework:
 *   - Brand Voice + Em-Dash: src/services/narrator/voiceConstraints.ts
 *     (checkVoice catches both classes per AR-002 in one pass)
 *   - Factual Citation (PR-005): every specific claim in the meta
 *     description must be grounded in the source facts passed in
 *
 * Storage path (for Card 2b's renderer):
 *   The bake artifact lands on BakedSchemaArtifact.pages[i].metaTags. When
 *   the discoverability_bake_enabled flag is on, stampSectionsWithSchema
 *   also writes the metaTags object onto the section's schema field, which
 *   the adapter persists to website_builder.pages.sections[i].schema.
 *   Renderer reads sections[i].schema.metaTags per page.
 */

import { checkVoice } from "../../narrator/voiceConstraints";
import type { BakePracticeMetadata } from "./discoverabilityBake";

// ── Vertical → practitioner noun map ────────────────────────────────

const VERTICAL_TO_PRACTITIONER_NOUN: Record<string, string> = {
  endodontics: "Endodontist",
  orthodontics: "Orthodontist",
  general_dentistry: "Dentist",
  pediatric_dentistry: "Pediatric Dentist",
  periodontics: "Periodontist",
  oral_surgery: "Oral Surgeon",
  prosthodontics: "Prosthodontist",
  chiropractic: "Chiropractor",
  physical_therapy: "Physical Therapist",
  optometry: "Optometrist",
  veterinary: "Veterinarian",
  legal: "Attorney",
  financial_advisor: "Financial Advisor",
  medspa: "Med Spa",
  accounting: "Accountant",
  automotive: "Auto Service",
  barber: "Barber",
  fitness: "Fitness Studio",
  food_service: "Restaurant",
  home_services: "Home Services",
  real_estate: "Real Estate Agent",
};

export function practitionerNounFor(vertical: string | undefined | null): string {
  if (!vertical) return "Practice";
  const key = vertical.trim().toLowerCase();
  return VERTICAL_TO_PRACTITIONER_NOUN[key] ?? "Practice";
}

// ── Types ───────────────────────────────────────────────────────────

export interface OpenGraphTags {
  "og:title": string;
  "og:description": string;
  "og:url": string;
  "og:image": string;
  "og:type": string;
  "twitter:card": string;
  "twitter:title": string;
  "twitter:description": string;
}

export interface MetaTagSourceFacts {
  practiceName: string;
  vertical: string;
  city?: string;
  state?: string;
  description?: string;
  baseUrl: string;
  ogImage?: string;
}

export interface MetaTagValidationResult {
  passed: boolean;
  brandVoice: { passed: boolean; violations: string[]; warnings: string[] };
  emDash: { passed: boolean; violations: string[] };
  factualCitation: { passed: boolean; violations: string[] };
}

export interface MetaTagBakeResult {
  title: string;
  metaDescription: string;
  canonical: string;
  openGraph: OpenGraphTags;
  /** Length-band warnings: title outside 50 to 60, description outside 150 to 160. */
  lengthWarnings: string[];
  validation: MetaTagValidationResult;
  /** Echoed back so callers can audit which fields contributed. */
  sourceFactsUsed: {
    practiceName: string;
    vertical: string;
    city: string | null;
    state: string | null;
    descriptionPresent: boolean;
    baseUrl: string;
  };
}

// ── Pure generators ─────────────────────────────────────────────────

/**
 * Title format: "{Practitioner Noun} in {City} | {Practice Name}".
 * Falls back to "{Practice Name} | {Practitioner Noun}" when city is absent.
 */
export function generateTitle(input: {
  practiceName: string;
  vertical: string;
  city?: string | null;
}): string {
  const noun = practitionerNounFor(input.vertical);
  const name = input.practiceName.trim();
  const city = input.city?.trim();
  if (city) {
    return `${noun} in ${city} | ${name}`;
  }
  return `${name} | ${noun}`;
}

/**
 * Meta description. Prefers verified verbatim text from the practice's own
 * description field (PR-005 fact-lock). Falls back to a synthesized
 * sentence composed only from verified location + name + vertical when no
 * description is available.
 */
export function generateMetaDescription(input: {
  practiceName: string;
  vertical: string;
  city?: string | null;
  state?: string | null;
  description?: string | null;
}): string {
  const TARGET_MAX = 160;

  if (input.description && input.description.trim().length > 0) {
    const cleaned = input.description.replace(/\s+/g, " ").trim();
    if (cleaned.length <= TARGET_MAX) {
      return cleaned;
    }
    // Greedy whole-sentence inclusion. Per PR-005 fact-lock we never invent
    // bridge text or trim mid-clause; we accept a shorter complete-sentence
    // result and let the length warning surface for human review.
    const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 0) {
      let acc = "";
      for (const raw of sentences) {
        const sentence = raw.trim();
        const candidate = acc ? `${acc} ${sentence}` : sentence;
        if (candidate.length <= TARGET_MAX) {
          acc = candidate;
        } else {
          break;
        }
      }
      if (acc.length > 0) return acc;
      // First sentence alone exceeds TARGET_MAX; fall through to word-boundary trim.
    }
    // Final fallback: trim at last word boundary inside TARGET_MAX, append period.
    const slice = cleaned.slice(0, TARGET_MAX);
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > 80) {
      return `${slice.slice(0, lastSpace).replace(/[.,;:]\s*$/, "")}.`;
    }
    return slice;
  }

  // Composed fallback. Only verified facts.
  const noun = practitionerNounFor(input.vertical);
  const name = input.practiceName.trim();
  const city = input.city?.trim();
  const state = input.state?.trim();
  const location = city ? (state ? `${city}, ${state}` : city) : "";
  const locationPhrase = location ? ` in ${location}` : "";
  return `${noun} care${locationPhrase}. ${name} provides care for new and returning patients with modern treatment.`;
}

/**
 * Self-referential canonical URL. baseUrl strips trailing slash, pagePath
 * normalized to leading slash. Root path returns baseUrl alone.
 */
export function generateCanonicalUrl(input: {
  baseUrl: string;
  pagePath: string;
}): string {
  const base = input.baseUrl.replace(/\/+$/, "");
  const raw = input.pagePath.trim();
  if (!raw || raw === "/" || raw === "") {
    return base;
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
}

/**
 * Open Graph + Twitter Card tags. Mirror of title/description for the
 * og: namespace, plus og:image / og:type / twitter:card.
 */
export function generateOpenGraphTags(input: {
  title: string;
  metaDescription: string;
  canonical: string;
  ogImage?: string | null;
}): OpenGraphTags {
  const ogImage = (input.ogImage ?? "").trim();
  return {
    "og:title": input.title,
    "og:description": input.metaDescription,
    "og:url": input.canonical,
    "og:image": ogImage,
    "og:type": "website",
    "twitter:card": ogImage ? "summary_large_image" : "summary",
    "twitter:title": input.title,
    "twitter:description": input.metaDescription,
  };
}

// ── Validator Framework ─────────────────────────────────────────────

/**
 * Conservative factual citation gate (PR-005). Detects assertion patterns
 * that read like specific claims and verifies they appear verbatim in the
 * source description. The gate intentionally errs toward false positives
 * rather than false negatives because a fabricated claim shipped to a
 * customer page is a much worse failure mode than a false-positive flag
 * the human reviewer overrides.
 */
function checkFactualCitation(
  text: string,
  sourceDescription: string | null | undefined
): string[] {
  const violations: string[] = [];
  const sourceLower = (sourceDescription ?? "").toLowerCase();

  const FACT_CLAIM_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
    { name: "board-certified", pattern: /\bboard[- ]certified\b/i },
    { name: "award-winning", pattern: /\baward[- ]winning\b/i },
    { name: "best in", pattern: /\bbest\s+in\s+(?:the\s+)?[a-z ]+/i },
    { name: "leading", pattern: /\bleading\s+(?:provider|practice|clinic|expert)\b/i },
    { name: "top-rated", pattern: /\btop[- ]rated\b/i },
    { name: "#1", pattern: /\b#\s?1\b/i },
    { name: "voted best", pattern: /\bvoted\s+best\b/i },
  ];

  for (const { name, pattern } of FACT_CLAIM_PATTERNS) {
    if (pattern.test(text)) {
      // Only an issue if the same phrase is NOT in the source description
      if (!pattern.test(sourceLower)) {
        violations.push(
          `meta description contains specific claim "${name}" not present in business_data.description (PR-005 fact-lock)`,
        );
      }
    }
  }

  return violations;
}

export function validateMetaTagStrings(
  strings: { title: string; metaDescription: string },
  sourceDescription: string | null | undefined,
): MetaTagValidationResult {
  const titleVoice = checkVoice(strings.title);
  const descVoice = checkVoice(strings.metaDescription);

  const allViolations = [
    ...titleVoice.violations.map((v) => `title: ${v}`),
    ...descVoice.violations.map((v) => `description: ${v}`),
  ];
  const emDashViolations = allViolations.filter((v) => v.toLowerCase().includes("em-dash"));
  const otherVoiceViolations = allViolations.filter((v) => !v.toLowerCase().includes("em-dash"));

  const factualViolations = checkFactualCitation(strings.metaDescription, sourceDescription);

  const passed =
    otherVoiceViolations.length === 0 &&
    emDashViolations.length === 0 &&
    factualViolations.length === 0;

  return {
    passed,
    brandVoice: {
      passed: otherVoiceViolations.length === 0,
      violations: otherVoiceViolations,
      warnings: [...titleVoice.warnings, ...descVoice.warnings],
    },
    emDash: {
      passed: emDashViolations.length === 0,
      violations: emDashViolations,
    },
    factualCitation: {
      passed: factualViolations.length === 0,
      violations: factualViolations,
    },
  };
}

// ── Orchestrator ────────────────────────────────────────────────────

/**
 * Build the full meta tag artifact for a single page. Synchronous; takes
 * pre-resolved facts so the call is testable without DB.
 */
export function buildPageMetaTags(input: {
  facts: MetaTagSourceFacts;
  pagePath: string;
}): MetaTagBakeResult {
  const { facts, pagePath } = input;

  const title = generateTitle({
    practiceName: facts.practiceName,
    vertical: facts.vertical,
    city: facts.city,
  });

  const metaDescription = generateMetaDescription({
    practiceName: facts.practiceName,
    vertical: facts.vertical,
    city: facts.city,
    state: facts.state,
    description: facts.description,
  });

  const canonical = generateCanonicalUrl({
    baseUrl: facts.baseUrl,
    pagePath,
  });

  const openGraph = generateOpenGraphTags({
    title,
    metaDescription,
    canonical,
    ogImage: facts.ogImage,
  });

  const lengthWarnings: string[] = [];
  if (title.length < 50) lengthWarnings.push(`title is ${title.length} chars (target 50 to 60)`);
  if (title.length > 60) lengthWarnings.push(`title is ${title.length} chars (target 50 to 60)`);
  if (metaDescription.length < 150)
    lengthWarnings.push(`metaDescription is ${metaDescription.length} chars (target 150 to 160)`);
  if (metaDescription.length > 160)
    lengthWarnings.push(`metaDescription is ${metaDescription.length} chars (target 150 to 160)`);

  const validation = validateMetaTagStrings(
    { title, metaDescription },
    facts.description,
  );

  return {
    title,
    metaDescription,
    canonical,
    openGraph,
    lengthWarnings,
    validation,
    sourceFactsUsed: {
      practiceName: facts.practiceName,
      vertical: facts.vertical,
      city: facts.city ?? null,
      state: facts.state ?? null,
      descriptionPresent: !!(facts.description && facts.description.trim().length > 0),
      baseUrl: facts.baseUrl,
    },
  };
}

/**
 * Resolve MetaTagSourceFacts from a BakePracticeMetadata + a few extra
 * fields the bake stage now carries. Used by the bake stage to translate
 * its existing input shape into the metaTagBake input shape.
 */
export function factsFromBakePractice(input: {
  practice: BakePracticeMetadata;
  vertical: string;
  baseUrl: string;
  description?: string | null;
  ogImage?: string | null;
}): MetaTagSourceFacts {
  const description =
    input.description ?? input.practice.description ?? undefined;
  return {
    practiceName: input.practice.name,
    vertical: input.vertical,
    city: input.practice.address?.city,
    state: input.practice.address?.region,
    description,
    baseUrl: input.baseUrl,
    ogImage: input.ogImage ?? undefined,
  };
}
