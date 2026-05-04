/**
 * Manifest v2 Card 2 — Discoverability Bake stage.
 *
 * Runs AFTER the Copy stage and BEFORE the QA stage. Its job is to enrich
 * every generated page with the structured-data and linking primitives a
 * site needs to win SEO + AEO + CRO *from the first build* — per The
 * Standard — Runtime Principle Rubric v1, which treats those three
 * patient-acquisition dimensions as siblings with one root cause.
 *
 * What this stage produces for every page:
 *   - schema.org LocalBusiness + (Dentist|Orthodontist|Endodontist|etc.) markup
 *   - schema.org Person markup for the practitioner (credentials, education,
 *     specialty, location — enough for AI entity disambiguation)
 *   - FAQ schema for common patient questions (conversational language)
 *   - AggregateRating + Review markup from real patient reviews
 *   - internal link suggestions with patient-intent anchor text
 *   - one primary CTA per section per the Creative Heuristics Matrix
 *
 * Schema templates are loaded from Notion ("Discoverability Bake — Schema
 * Templates v1"). Fallback is in localTemplates.ts.
 *
 * Feature flag: discoverability_bake_enabled. Default false. Shadow mode:
 * the bake runs and attaches the artifact to the copy JSON under a
 * `discoverability_bake` key but leaves the page sections untouched. Live
 * mode: the artifact also gets stamped onto page-level schema fields the
 * adapter writes.
 */

import { BehavioralEventModel } from "../../../models/BehavioralEventModel";
import { isDiscoverabilityBakeEnabled } from "../../rubric/gateFlag";
import { getVocab } from "../../vocabulary/vocabLoader";
import {
  buildLocalBusinessSchema,
  buildFaqSchema,
  buildInternalLinkPlan,
  buildPersonSchema,
  buildPrimaryCtas,
  buildReviewSchema,
  loadSchemaTemplates,
  type BakeTemplates,
} from "./discoverabilityBake.templates";
import {
  buildPageMetaTags,
  factsFromBakePractice,
  type MetaTagBakeResult,
  type MetaTagSourceFacts,
} from "./metaTagBake";

export const BAKE_VERSION_ID = "discoverability-bake-v1";

export interface BakeInput {
  orgId: number;
  copyId: string;
  copy: any;
  practice: BakePracticeMetadata;
  practitioner?: BakePractitionerMetadata;
  reviews?: BakeReview[];
  /**
   * Optional meta-tag bake inputs. When provided, the bake stage produces
   * title / metaDescription / canonical / openGraph artifacts on each page.
   * When absent, bakePages skips the metaTag block (artifact.pages[].metaTags
   * stays undefined). The orchestrator pre-resolves these from organizations
   * + vocabulary_configs and passes them in.
   */
  metaTagFacts?: Pick<
    MetaTagSourceFacts,
    "vertical" | "baseUrl" | "description" | "ogImage"
  >;
}

export interface BakePracticeMetadata {
  name: string;
  specialty?: string;
  practiceType?: string;
  phone?: string;
  email?: string;
  websiteUrl?: string;
  /**
   * Practice description sourced from organizations.business_data.description.
   * Used as the verbatim meta description per PR-005 fact-lock when
   * present.
   */
  description?: string;
  address?: {
    streetAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  lat?: number;
  lng?: number;
  hours?: Array<{ dayOfWeek: string; opens: string; closes: string }>;
}

export interface BakePractitionerMetadata {
  fullName: string;
  credentials?: string[];
  education?: string[];
  specialty?: string;
  yearsInPractice?: number;
  bio?: string;
}

export interface BakeReview {
  author: string;
  text: string;
  rating: number;
  reviewDate?: string;
}

export interface BakedSchemaArtifact {
  bakeVersionId: string;
  templatesSource: "notion" | "fallback";
  pages: Array<{
    path: string;
    sectionName: string;
    jsonLd: Record<string, unknown>[];
    faq?: Record<string, unknown>;
    reviews?: Record<string, unknown>;
    internalLinks: Array<{ anchor: string; target: string; patientIntent: string }>;
    primaryCta: { text: string; href: string; rationale: string };
    /**
     * Card 2 (artifact-side) addition. Populated when BakeInput.metaTagFacts
     * is provided. Card 2b (Hamiltonwise/website-renderer) reads this off
     * sections[i].schema.metaTags to stamp the rendered head tags.
     */
    metaTags?: MetaTagBakeResult;
  }>;
  entitySummary: {
    localBusiness: Record<string, unknown>;
    practitioner: Record<string, unknown> | null;
  };
}

export interface BakeStageResult {
  passed: boolean;
  artifact: BakedSchemaArtifact;
  /** copy JSON with the bake artifact attached (and, in live mode, schema stamped onto sections). */
  copy: any;
  durationMs: number;
  shadow: boolean;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────

export async function runDiscoverabilityBakeStage(
  input: BakeInput
): Promise<BakeStageResult> {
  const start = Date.now();
  const warnings: string[] = [];

  const flagOn = await isDiscoverabilityBakeEnabled(input.orgId);
  const templates = await loadSchemaTemplates();
  if (templates.source === "fallback") {
    warnings.push("Schema templates loaded from local fallback — Notion unavailable.");
  }

  const vocab = await getVocab(input.orgId);
  const artifact = bakePages(input, templates, vocab.schemaSubType);

  // Attach artifact to the copy JSON. Always present (runtime observability);
  // the adapter reads it only when the flag is on.
  const bakedCopy = {
    ...input.copy,
    discoverability_bake: artifact,
  };

  if (flagOn) {
    stampSectionsWithSchema(bakedCopy, artifact);
  }

  await BehavioralEventModel.create({
    event_type: flagOn
      ? "discoverability_bake.completed"
      : "discoverability_bake.shadow",
    org_id: input.orgId,
    properties: {
      copy_id: input.copyId,
      bake_version: BAKE_VERSION_ID,
      templates_source: templates.source,
      pages_baked: artifact.pages.length,
      warnings: warnings.length,
    },
  }).catch(() => {});

  // Card 2 (artifact-side): per-page meta tag generation event. Fires
  // once per page that produced a meta tag artifact, so downstream
  // observability can detect length-band warnings or validation drift.
  if (input.metaTagFacts) {
    for (const page of artifact.pages) {
      if (!page.metaTags) continue;
      await BehavioralEventModel.create({
        event_type: "meta_tag_artifact_generated",
        org_id: input.orgId,
        properties: {
          page_path: page.path,
          page_type: page.sectionName,
          title_len: page.metaTags.title.length,
          description_len: page.metaTags.metaDescription.length,
          length_warnings: page.metaTags.lengthWarnings,
          validation_passed: page.metaTags.validation.passed,
          brand_voice_violations: page.metaTags.validation.brandVoice.violations,
          em_dash_violations: page.metaTags.validation.emDash.violations,
          factual_citation_violations: page.metaTags.validation.factualCitation.violations,
        },
      }).catch(() => {});
    }
  }

  return {
    passed: true,
    artifact,
    copy: bakedCopy,
    durationMs: Date.now() - start,
    shadow: !flagOn,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────

function bakePages(
  input: BakeInput,
  templates: BakeTemplates,
  schemaSubType: string
): BakedSchemaArtifact {
  const sections: Array<{ name?: string; headline?: string; body?: string }> = Array.isArray(input.copy?.sections)
    ? input.copy.sections
    : [];

  const localBusiness = buildLocalBusinessSchema(
    schemaSubType,
    input.practice,
    templates,
    input.reviews ?? []
  );
  const practitioner = input.practitioner
    ? buildPersonSchema(input.practitioner, input.practice, templates)
    : null;

  const entitySummary = { localBusiness, practitioner };

  const pages = sections.map((section, index) => {
    const sectionName = section.name ?? `section-${index}`;
    const path = sectionName.toLowerCase() === "hero" ? "/" : `/${slug(sectionName)}`;

    const jsonLd: Record<string, unknown>[] = [localBusiness];
    if (practitioner) jsonLd.push(practitioner);

    const faq = buildFaqSchema(section, input.practice, templates);
    if (faq) jsonLd.push(faq);

    const reviews = buildReviewSchema(input.reviews ?? [], input.practice, templates);
    if (reviews) jsonLd.push(reviews);

    const internalLinks = buildInternalLinkPlan(
      sectionName,
      sections.map((s) => s.name ?? ""),
      templates
    );
    const primaryCta = buildPrimaryCtas(sectionName, input.practice, templates);

    let metaTags: MetaTagBakeResult | undefined;
    if (input.metaTagFacts) {
      const facts = factsFromBakePractice({
        practice: input.practice,
        vertical: input.metaTagFacts.vertical,
        baseUrl: input.metaTagFacts.baseUrl,
        description: input.metaTagFacts.description ?? input.practice.description,
        ogImage: input.metaTagFacts.ogImage,
      });
      metaTags = buildPageMetaTags({ facts, pagePath: path });
    }

    return {
      path,
      sectionName,
      jsonLd,
      faq: faq ?? undefined,
      reviews: reviews ?? undefined,
      internalLinks,
      primaryCta,
      metaTags,
    };
  });

  return {
    bakeVersionId: BAKE_VERSION_ID,
    templatesSource: templates.source,
    pages,
    entitySummary,
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function stampSectionsWithSchema(copy: any, artifact: BakedSchemaArtifact): void {
  if (!Array.isArray(copy?.sections)) return;
  for (let i = 0; i < copy.sections.length; i++) {
    const page = artifact.pages[i];
    if (!page) continue;
    copy.sections[i] = {
      ...copy.sections[i],
      schema: {
        jsonLd: page.jsonLd,
        internalLinks: page.internalLinks,
        primaryCta: page.primaryCta,
        // Card 2 (artifact-side): metaTags hand-off slot for Card 2b's
        // renderer in Hamiltonwise/website-renderer to read.
        metaTags: page.metaTags,
      },
    };
  }
}
