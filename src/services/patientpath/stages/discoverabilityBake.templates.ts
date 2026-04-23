/**
 * Schema templates for the Discoverability Bake stage.
 *
 * The authoritative source is the Notion page "Discoverability Bake — Schema
 * Templates v1" (parented under Alloro HQ). When Notion is unavailable this
 * module returns a locally-coded fallback so the stage is always runnable.
 *
 * Template structure lives here — not in the stage — so template updates
 * propagate on the next 24h cache refresh without a code deploy
 * (adaptability per memory rule 30).
 */

import axios from "axios";
import type {
  BakePracticeMetadata,
  BakePractitionerMetadata,
  BakeReview,
} from "./discoverabilityBake";

const TEMPLATES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NOTION_API_VERSION = "2022-06-28";
const TEMPLATES_PAGE_SEARCH_QUERY = "Discoverability Bake — Schema Templates v1";

export interface BakeTemplates {
  source: "notion" | "fallback";
  versionId: string;
  faqByPageType: Record<string, Array<{ question: string; answer: string }>>;
  internalLinkAnchors: Record<string, Array<{ target: string; anchor: string; patientIntent: string }>>;
  ctaBySection: Record<string, { text: string; href: string; rationale: string }>;
  schemaTypeBySpecialty: Record<string, string[]>;
}

interface TemplatesCacheEntry {
  value: BakeTemplates;
  fetchedAt: number;
}
let templatesCache: TemplatesCacheEntry | null = null;

export function _resetTemplatesCache(): void {
  templatesCache = null;
}

export async function loadSchemaTemplates(): Promise<BakeTemplates> {
  const now = Date.now();
  if (templatesCache && now - templatesCache.fetchedAt < TEMPLATES_CACHE_TTL_MS) {
    return templatesCache.value;
  }
  const templates = await fetchFromNotion();
  templatesCache = { value: templates, fetchedAt: now };
  return templates;
}

async function fetchFromNotion(): Promise<BakeTemplates> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return fallbackTemplates("no_notion_token");

  try {
    // Try to locate the page by name via the Search API.
    const searchResp = await axios.post(
      "https://api.notion.com/v1/search",
      {
        query: TEMPLATES_PAGE_SEARCH_QUERY,
        filter: { property: "object", value: "page" },
        page_size: 5,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    const pageId: string | undefined = searchResp.data?.results?.[0]?.id;
    if (!pageId) return fallbackTemplates("page_not_found");

    // Walk blocks to look for a fenced JSON block tagged alloro:bake-templates.
    const blocksResp = await axios.get(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_API_VERSION,
        },
        timeout: 8000,
      }
    );
    const blocks: any[] = blocksResp.data?.results ?? [];
    let body = "";
    for (const b of blocks) {
      const data = b?.[b.type];
      if (!data) continue;
      if (Array.isArray(data.rich_text)) {
        body += data.rich_text.map((r: any) => r.plain_text ?? "").join("") + "\n";
      } else if (data.language && Array.isArray(data.rich_text)) {
        body += data.rich_text.map((r: any) => r.plain_text ?? "").join("") + "\n";
      }
      if (b.type === "code" && Array.isArray(b.code?.rich_text)) {
        body += b.code.rich_text.map((r: any) => r.plain_text ?? "").join("") + "\n";
      }
    }

    const match = body.match(/alloro:bake-templates\s+([\s\S]+?)(?=```|$)/);
    if (!match) return fallbackTemplates("config_block_not_found");

    const parsed = JSON.parse(match[1]);
    return {
      source: "notion",
      versionId: parsed.versionId ?? "bake-templates-notion",
      faqByPageType: parsed.faqByPageType ?? fallbackFaq(),
      internalLinkAnchors: parsed.internalLinkAnchors ?? fallbackInternalLinks(),
      ctaBySection: parsed.ctaBySection ?? fallbackCtas(),
      schemaTypeBySpecialty: parsed.schemaTypeBySpecialty ?? fallbackSchemaTypes(),
    };
  } catch {
    return fallbackTemplates("fetch_error");
  }
}

function fallbackTemplates(_reason: string): BakeTemplates {
  return {
    source: "fallback",
    versionId: "bake-templates-v1-local-fallback",
    faqByPageType: fallbackFaq(),
    internalLinkAnchors: fallbackInternalLinks(),
    ctaBySection: fallbackCtas(),
    schemaTypeBySpecialty: fallbackSchemaTypes(),
  };
}

// ─── fallback content ───────────────────────────────────────────────

function fallbackFaq(): BakeTemplates["faqByPageType"] {
  return {
    hero: [
      {
        question: "Will this hurt?",
        answer:
          "The numbing is slow and thorough before anything starts. Patients who normally need anxiety medication to walk into a dental office have told us they didn't need it here.",
      },
      {
        question: "Do I need a referral?",
        answer:
          "No. If you're in pain or you've been told you might need a root canal, you can call us directly. We'll get you in fast.",
      },
      {
        question: "What does it cost?",
        answer:
          "Cost depends on your insurance and the specific tooth. We'll give you the number before any treatment, and we won't recommend a procedure you don't need.",
      },
    ],
    about: [
      {
        question: "Why did you become an endodontist?",
        answer:
          "Most of it is listening. Patients come in scared, often in pain, usually after a long wait. The job is making sure they feel heard before anything else happens.",
      },
    ],
    services: [
      {
        question: "How long does a root canal take?",
        answer:
          "Most teeth take one visit of about ninety minutes. More complex cases are two visits. We'll tell you upfront.",
      },
    ],
  };
}

function fallbackInternalLinks(): BakeTemplates["internalLinkAnchors"] {
  return {
    hero: [
      { target: "/about", anchor: "meet your doctor", patientIntent: "trust-building" },
      { target: "/services", anchor: "what a visit looks like", patientIntent: "reduce-uncertainty" },
      { target: "/contact", anchor: "same-day appointments", patientIntent: "urgent-relief" },
    ],
    about: [
      { target: "/", anchor: "book your appointment", patientIntent: "conversion" },
      { target: "/services", anchor: "how we handle anxiety", patientIntent: "fear-reduction" },
    ],
    services: [
      { target: "/about", anchor: "why patients choose us", patientIntent: "social-proof" },
      { target: "/contact", anchor: "call for emergencies", patientIntent: "urgent-relief" },
    ],
    reviews: [
      { target: "/about", anchor: "the people behind the reviews", patientIntent: "trust-building" },
    ],
    faq: [
      { target: "/contact", anchor: "still have questions — call", patientIntent: "reduce-uncertainty" },
    ],
    contact: [
      { target: "/", anchor: "back to home", patientIntent: "navigation" },
    ],
  };
}

function fallbackCtas(): BakeTemplates["ctaBySection"] {
  return {
    hero: {
      text: "Book a call",
      href: "/contact",
      rationale: "Primary conversion CTA on the highest-traffic section. One primary per section per Creative Heuristics Matrix.",
    },
    about: {
      text: "See what a visit looks like",
      href: "/services",
      rationale: "Move the reader from trust-building context into action-oriented content.",
    },
    services: {
      text: "Call for same-day appointments",
      href: "tel:",
      rationale: "Patients on services pages are often in pain — the primary action is call, not form.",
    },
    reviews: {
      text: "Meet the doctor",
      href: "/about",
      rationale: "A patient impressed by reviews wants to see who is behind them.",
    },
    faq: {
      text: "Book a call",
      href: "/contact",
      rationale: "FAQ readers have residual hesitation — one more answer surface is the CTA.",
    },
    contact: {
      text: "Call now",
      href: "tel:",
      rationale: "Contact page is the conversion surface.",
    },
  };
}

function fallbackSchemaTypes(): BakeTemplates["schemaTypeBySpecialty"] {
  return {
    endodontics: ["LocalBusiness", "Dentist", "MedicalBusiness"],
    orthodontics: ["LocalBusiness", "Dentist", "Orthodontist", "MedicalBusiness"],
    oral_surgery: ["LocalBusiness", "Dentist", "MedicalBusiness"],
    pediatric_dentistry: ["LocalBusiness", "Dentist", "MedicalBusiness"],
    periodontics: ["LocalBusiness", "Dentist", "MedicalBusiness"],
    prosthodontics: ["LocalBusiness", "Dentist", "MedicalBusiness"],
    physical_therapy: ["LocalBusiness", "PhysicalTherapy", "MedicalBusiness"],
    chiropractic: ["LocalBusiness", "Chiropractor", "MedicalBusiness"],
    veterinary: ["LocalBusiness", "VeterinaryCare"],
    default: ["LocalBusiness", "MedicalBusiness"],
  };
}

// ─── builder functions ──────────────────────────────────────────────

/**
 * Vertical-neutral LocalBusiness schema builder (Card J).
 *
 * Routes to the correct schema.org sub-type by `schemaSubType`:
 *   - "Dentist"      → produces the legacy Dentist output (identical shape
 *                      to the prior buildDentistSchema for healthcare orgs).
 *   - "LegalService" → LegalService. `buildLocalBusinessSchema` never emits
 *                      the Dentist sub-type for non-healthcare orgs.
 *   - any other      → used as the schema `@type` verbatim, falling back to
 *                      the template's schemaTypeBySpecialty list when the
 *                      sub-type matches a known specialty key.
 *
 * `buildDentistSchema` stays exported as a thin back-compat wrapper so
 * existing callers that always wanted the Dentist path continue to work.
 */
export function buildLocalBusinessSchema(
  schemaSubType: string,
  practice: BakePracticeMetadata,
  templates: BakeTemplates,
  reviews: BakeReview[]
): Record<string, unknown> {
  const specialtyKey = (practice.specialty ?? practice.practiceType ?? "default")
    .toLowerCase()
    .replace(/[^a-z]/g, "_");

  // Prefer the explicit schemaSubType. Fall back to the templates map when
  // the sub-type exactly matches a known specialty key (e.g., "Dentist"
  // lowercased matches `dentist` → the full healthcare type array).
  let schemaTypes: string[];
  if (schemaSubType === "Dentist") {
    schemaTypes =
      templates.schemaTypeBySpecialty[specialtyKey] ??
      templates.schemaTypeBySpecialty["default"];
  } else {
    schemaTypes = ["LocalBusiness", schemaSubType];
  }

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length
      : null;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaTypes.length === 1 ? schemaTypes[0] : schemaTypes,
    name: practice.name,
    url: practice.websiteUrl,
    telephone: practice.phone,
    email: practice.email,
    address: practice.address
      ? {
          "@type": "PostalAddress",
          streetAddress: practice.address.streetAddress,
          addressLocality: practice.address.city,
          addressRegion: practice.address.region,
          postalCode: practice.address.postalCode,
          addressCountry: practice.address.country ?? "US",
        }
      : undefined,
    geo:
      practice.lat != null && practice.lng != null
        ? {
            "@type": "GeoCoordinates",
            latitude: practice.lat,
            longitude: practice.lng,
          }
        : undefined,
    openingHoursSpecification: (practice.hours ?? []).map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    })),
    aggregateRating:
      avgRating != null
        ? {
            "@type": "AggregateRating",
            ratingValue: Math.round(avgRating * 10) / 10,
            reviewCount: reviews.length,
          }
        : undefined,
  };
  return pruneUndef(schema);
}

/** Back-compat: always produces the healthcare Dentist sub-type. */
export function buildDentistSchema(
  practice: BakePracticeMetadata,
  templates: BakeTemplates,
  reviews: BakeReview[]
): Record<string, unknown> {
  return buildLocalBusinessSchema("Dentist", practice, templates, reviews);
}

export function buildPersonSchema(
  practitioner: BakePractitionerMetadata,
  practice: BakePracticeMetadata,
  _templates: BakeTemplates
): Record<string, unknown> {
  const person: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: practitioner.fullName,
    jobTitle: practitioner.specialty ?? practice.specialty ?? null,
    honorificSuffix: practitioner.credentials?.join(", "),
    alumniOf: (practitioner.education ?? []).map((school) => ({
      "@type": "EducationalOrganization",
      name: school,
    })),
    worksFor: {
      "@type": "LocalBusiness",
      name: practice.name,
      url: practice.websiteUrl,
    },
    description: practitioner.bio,
    workLocation: practice.address
      ? {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: practice.address.city,
            addressRegion: practice.address.region,
          },
        }
      : undefined,
  };
  return pruneUndef(person);
}

export function buildFaqSchema(
  section: { name?: string },
  _practice: BakePracticeMetadata,
  templates: BakeTemplates
): Record<string, unknown> | null {
  const sectionName = (section.name ?? "").toLowerCase();
  const faq = templates.faqByPageType[sectionName];
  if (!faq || faq.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };
}

export function buildReviewSchema(
  reviews: BakeReview[],
  practice: BakePracticeMetadata,
  _templates: BakeTemplates
): Record<string, unknown> | null {
  if (reviews.length === 0) return null;
  const items = reviews.slice(0, 5).map((r) => ({
    "@type": "Review",
    author: { "@type": "Person", name: r.author },
    datePublished: r.reviewDate,
    reviewBody: r.text,
    reviewRating: {
      "@type": "Rating",
      ratingValue: r.rating,
      bestRating: 5,
    },
    itemReviewed: { "@type": "LocalBusiness", name: practice.name },
  }));
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items,
  };
}

export function buildInternalLinkPlan(
  sectionName: string,
  allSectionNames: string[],
  templates: BakeTemplates
): Array<{ anchor: string; target: string; patientIntent: string }> {
  const key = sectionName.toLowerCase();
  const plan = templates.internalLinkAnchors[key] ?? [];
  // Filter to link only to sections that actually exist in this copy set.
  const availableSlugs = new Set<string>([
    "/",
    ...allSectionNames.map((n) => (n?.toLowerCase() === "hero" ? "/" : `/${n?.toLowerCase()}`)),
  ]);
  return plan.filter(
    (p) => availableSlugs.has(p.target) || availableSlugs.has(p.target.split("#")[0])
  );
}

export function buildPrimaryCtas(
  sectionName: string,
  practice: BakePracticeMetadata,
  templates: BakeTemplates
): { text: string; href: string; rationale: string } {
  const key = sectionName.toLowerCase();
  const base = templates.ctaBySection[key] ?? templates.ctaBySection["hero"];
  const href = base.href === "tel:" && practice.phone ? `tel:${practice.phone.replace(/[^0-9+]/g, "")}` : base.href;
  return { ...base, href };
}

function pruneUndef(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}
