/**
 * Local fallback copy of The Standard — Runtime Principle Rubric v1.
 *
 * Used when NOTION_TOKEN is missing or the Notion page fetch fails. This is a
 * DEGRADED mode: the rubric is the product, so the Notion version is always
 * authoritative. This file exists so the engine stays runnable without a
 * network round-trip, and so tests don't need Notion credentials.
 *
 * When adaptability is degraded the service logs a warning on every call so
 * the regression shows up in observability.
 */

import type { DimensionSpec, ModeWeights, RubricConfig, ScoringMode } from "./types";

export const FALLBACK_VERSION_ID = "standard-rubric-v1.0-local-fallback";

export const META_DIMENSION: DimensionSpec = {
  key: "meta_question",
  name: "Meta-question — Feels Understood Before Informed",
  max: 40,
  description:
    "Does the recipient feel understood before they feel informed? Would they feel someone was paying attention to them specifically in the first sentence, or does the output lead with features/services/information?",
  isPass: false,
  patientFacingOnly: false,
  redistributeOnNa: false,
};

export const SUB_DIMENSIONS: DimensionSpec[] = [
  {
    key: "recognition_test",
    name: "Recognition Test",
    max: 10,
    description:
      "Would someone who knows the practice owner intimately (spouse, front desk, longtime patient) recognize the owner in this copy? Not whether there is a specific detail — whether the detail captures the soul of who this person actually is.",
    isPass: false,
    patientFacingOnly: false,
    redistributeOnNa: false,
  },
  {
    key: "patient_voice_match",
    name: "Patient Voice Match",
    max: 10,
    description:
      "Does this output use language the practice's actual patients use in their reviews? Words like 'compassionate', 'ninja accuracy', 'honest' — pulled from real review data, not invented. If review data is unavailable, mark N/A and redistribute weight.",
    isPass: false,
    patientFacingOnly: false,
    redistributeOnNa: true,
  },
  {
    key: "recipe_compliance",
    name: "Recipe Compliance",
    max: 10,
    description:
      "One finding (named, specific, plain English). One dollar figure with confidence (Theranos guardrail: omit if confidence < 80%). One action (clear, executable, no future promises). N/A for pure marketing copy (hero sections, about pages); applies to Recipe-format outputs (emails, insights, narrator outputs).",
    isPass: false,
    patientFacingOnly: false,
    redistributeOnNa: true,
  },
  {
    key: "cesar_millan",
    name: "Cesar Millan Principle",
    max: 10,
    description:
      "Does this output position Alloro as the translator and the practice owner as the hero? Or does Alloro accidentally take credit for outcomes that belong to the owner?",
    isPass: false,
    patientFacingOnly: false,
    redistributeOnNa: false,
  },
  {
    key: "mom_test",
    name: "Plain English Mom Test",
    max: 10,
    description:
      "Could a 9th grader read this in 10 seconds and act on it? No jargon, no marketing language. Banned phrases: 'cutting-edge', 'state-of-the-art', 'world-class', 'up-to-date technology', 'comprehensive', 'advanced', any LLM-generated em-dashes.",
    isPass: false,
    patientFacingOnly: false,
    redistributeOnNa: false,
  },
  {
    key: "provenance",
    name: "Provenance",
    max: 10,
    description:
      "Every factual claim links to its source. No link, no ship. Numbers cite GBP, GSC, GA4, internal change logs, or named patient reviews. N/A for marketing copy with no numeric claims.",
    isPass: false,
    patientFacingOnly: false,
    redistributeOnNa: true,
  },
  {
    key: "never_blank",
    name: "Never Blank, No Future Promises",
    max: 5,
    description:
      "If data is thin, output a Recipe-compliant data-gap statement, not a fabrication. If a number is below confidence threshold, omit it (Theranos guardrail). Never promise outcomes Alloro cannot deliver or measure.",
    isPass: true,
    patientFacingOnly: false,
    redistributeOnNa: false,
  },
  {
    key: "public_safe",
    name: "Public Safe + HIPAA + CAN-SPAM/CASL",
    max: 5,
    description:
      "No PHI, no embarrassment if shown to a GP, no spam law violations on outbound communication. For Reveal Choreography email and Lob postcard specifically: explicit CAN-SPAM and CASL compliance verified.",
    isPass: true,
    patientFacingOnly: false,
    redistributeOnNa: false,
  },
  {
    key: "fear_acknowledged",
    name: "Fear Acknowledged Before Service Listed",
    max: 5,
    description:
      "For PatientPath sites and patient-facing marketing copy: does the copy acknowledge what the patient is feeling (anxiety, pain, distrust of past dental experiences) before it lists services? N/A for internal agent outputs.",
    isPass: false,
    patientFacingOnly: true,
    redistributeOnNa: true,
  },
];

// Mode weights. 'runtime' uses defaults. seo/aeo/cro bias which dimensions
// carry more weight, because the three failure modes have the same root cause
// (stock content) but different surface signatures.
const RUNTIME_WEIGHTS: ModeWeights = {
  dimensionWeights: {},
  passThreshold: 80,
  emphasis:
    "Score against The Standard exactly as written. Feels-understood-before-informed is 40% of the composite.",
};

const SEO_WEIGHTS: ModeWeights = {
  dimensionWeights: {
    // SEO rewards uniqueness, depth, entity authority, plain-English crawlable copy.
    recognition_test: 1.5,
    patient_voice_match: 1.2,
    mom_test: 1.3,
    provenance: 1.5,
    meta_question: 0.8,
    fear_acknowledged: 0.5,
  },
  passThreshold: 75,
  emphasis:
    "SEO mode. A patient searches Google. Weight toward: uniqueness vs template-stock content, entity depth (practitioner story, credentials, location specifics), crawlable plain-English copy, cited proof. Stock sites rank nowhere.",
};

const AEO_WEIGHTS: ModeWeights = {
  dimensionWeights: {
    // AEO depends on entity disambiguation, conversational copy, credentials.
    recognition_test: 1.5,
    patient_voice_match: 1.3,
    mom_test: 1.5,
    provenance: 1.3,
    meta_question: 0.9,
    fear_acknowledged: 0.7,
  },
  passThreshold: 75,
  emphasis:
    "AEO mode. A patient asks ChatGPT/Claude/Perplexity 'best endodontist near me' or 'endodontist good with anxious patients'. Weight toward: entity disambiguation (specific practitioner story, credentials, specialty, location stated explicitly), conversational copy matching how patients ask AI, author authority signals, no marketing jargon that AI discounts.",
};

const CRO_WEIGHTS: ModeWeights = {
  dimensionWeights: {
    // CRO is what the runtime rubric directly scores: fear acknowledged, voice, recognition.
    meta_question: 1.2,
    fear_acknowledged: 2.0,
    patient_voice_match: 1.5,
    recognition_test: 1.2,
    mom_test: 1.0,
    provenance: 0.8,
  },
  passThreshold: 75,
  emphasis:
    "CRO mode. Patient has landed. Will they choose this practice? Weight toward: fear acknowledged before service listed, patient voice match from real reviews, recognition test, plain English. Anxious patients only trust copy that recognizes them.",
};

export const FALLBACK_MODE_WEIGHTS: Record<ScoringMode, ModeWeights> = {
  runtime: RUNTIME_WEIGHTS,
  seo: SEO_WEIGHTS,
  aeo: AEO_WEIGHTS,
  cro: CRO_WEIGHTS,
};

export function buildFallbackConfig(): RubricConfig {
  return {
    versionId: FALLBACK_VERSION_ID,
    metaDimension: META_DIMENSION,
    subDimensions: SUB_DIMENSIONS,
    modeWeights: FALLBACK_MODE_WEIGHTS,
    source: "fallback",
    loadedAt: new Date().toISOString(),
  };
}
