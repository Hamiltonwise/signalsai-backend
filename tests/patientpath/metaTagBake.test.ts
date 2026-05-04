/**
 * Card 2 (artifact-side) tests — meta tag generators + Validator Framework.
 *
 * Pure unit tests. No DB. Generators are sync; the validator wrapper uses
 * the existing checkVoice from src/services/narrator/voiceConstraints.ts.
 *
 * Two reference fixtures:
 *   - Coastal-shape (Endodontist, San Luis Obispo, no DB row yet)
 *   - Garrison-shape (Orthodontist, West Orange NJ, real org_id 5)
 */

import { describe, test, expect } from "vitest";

import {
  buildPageMetaTags,
  factsFromBakePractice,
  generateCanonicalUrl,
  generateMetaDescription,
  generateOpenGraphTags,
  generateTitle,
  practitionerNounFor,
  validateMetaTagStrings,
} from "../../src/services/patientpath/stages/metaTagBake";
import type { BakePracticeMetadata } from "../../src/services/patientpath/stages/discoverabilityBake";

// ── Fixture data ────────────────────────────────────────────────────

const COASTAL_FACTS = {
  practiceName: "Coastal Endodontic Studio",
  vertical: "endodontics",
  city: "San Luis Obispo",
  state: "CA",
  baseUrl: "https://calm-beauty-2180.sites.getalloro.com",
  description:
    "Board-certified endodontist Dr. Jonathan Fu serves the Central Coast with Aloha-spirit care, GentleWave technology, and same-day emergency appointments.",
};

const GARRISON_FACTS = {
  practiceName: "Garrison Orthodontics",
  vertical: "orthodontics",
  city: "West Orange",
  state: "NJ",
  baseUrl: "https://garrison-orthodontics-005.sites.getalloro.com",
  description:
    "At Garrison Orthodontics in West Orange, NJ, Dr. Garrison Copeland provides expert orthodontic care for children, teens, and adults. We specialize in preventive, interceptive, and corrective orthodontics, as well as surgical orthodontics for complex jaw alignment issues.",
};

// ── practitionerNounFor ──────────────────────────────────────────────

describe("practitionerNounFor", () => {
  test("maps known healthcare verticals to the title-case practitioner noun", () => {
    expect(practitionerNounFor("endodontics")).toBe("Endodontist");
    expect(practitionerNounFor("orthodontics")).toBe("Orthodontist");
    expect(practitionerNounFor("general_dentistry")).toBe("Dentist");
    expect(practitionerNounFor("optometry")).toBe("Optometrist");
    expect(practitionerNounFor("chiropractic")).toBe("Chiropractor");
    expect(practitionerNounFor("veterinary")).toBe("Veterinarian");
  });

  test("returns 'Practice' for unknown or empty verticals", () => {
    expect(practitionerNounFor(undefined)).toBe("Practice");
    expect(practitionerNounFor(null)).toBe("Practice");
    expect(practitionerNounFor("")).toBe("Practice");
    expect(practitionerNounFor("not_a_real_vertical")).toBe("Practice");
  });

  test("is case-insensitive on the vertical key", () => {
    expect(practitionerNounFor("ENDODONTICS")).toBe("Endodontist");
    expect(practitionerNounFor("Orthodontics")).toBe("Orthodontist");
  });
});

// ── generateTitle ────────────────────────────────────────────────────

describe("generateTitle", () => {
  test("Coastal fixture matches the approved 58-char title", () => {
    const title = generateTitle({
      practiceName: COASTAL_FACTS.practiceName,
      vertical: COASTAL_FACTS.vertical,
      city: COASTAL_FACTS.city,
    });
    expect(title).toBe("Endodontist in San Luis Obispo | Coastal Endodontic Studio");
    expect(title.length).toBe(58);
  });

  test("Garrison fixture produces a 50 to 60 char title with correct West Orange location", () => {
    const title = generateTitle({
      practiceName: GARRISON_FACTS.practiceName,
      vertical: GARRISON_FACTS.vertical,
      city: GARRISON_FACTS.city,
    });
    expect(title).toBe("Orthodontist in West Orange | Garrison Orthodontics");
    expect(title.length).toBeGreaterThanOrEqual(50);
    expect(title.length).toBeLessThanOrEqual(60);
  });

  test("falls back when city is missing", () => {
    const title = generateTitle({
      practiceName: "Acme Endo",
      vertical: "endodontics",
      city: undefined,
    });
    expect(title).toBe("Acme Endo | Endodontist");
  });
});

// ── generateMetaDescription ──────────────────────────────────────────

describe("generateMetaDescription", () => {
  test("Coastal fixture description is returned verbatim (within 150 to 160 chars)", () => {
    const desc = generateMetaDescription({
      practiceName: COASTAL_FACTS.practiceName,
      vertical: COASTAL_FACTS.vertical,
      city: COASTAL_FACTS.city,
      state: COASTAL_FACTS.state,
      description: COASTAL_FACTS.description,
    });
    expect(desc).toBe(COASTAL_FACTS.description);
    // Notion card body claimed 159; actual is 152. Both fit the 150-160 band.
    expect(desc.length).toBeGreaterThanOrEqual(150);
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  test("Garrison long description includes whole sentences only, stays under 160, never trims mid-clause", () => {
    const desc = generateMetaDescription({
      practiceName: GARRISON_FACTS.practiceName,
      vertical: GARRISON_FACTS.vertical,
      city: GARRISON_FACTS.city,
      state: GARRISON_FACTS.state,
      description: GARRISON_FACTS.description,
    });
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(desc.endsWith(".")).toBe(true);
    // Must still mention the practice and the location (verified facts)
    expect(desc).toContain("Garrison Orthodontics");
    expect(desc).toContain("West Orange");
    // Hard requirement: never end mid-clause. PR-005 forbids fabricated bridge
    // text. The first complete sentence is the floor; we accept a shorter
    // result over a grammatically broken one.
    expect(desc).not.toMatch(/\b(in|of|with|and|or|to|for|at|on|by|from)\.$/);
  });

  test("synthesizes a fallback when description is missing, using only verified facts", () => {
    const desc = generateMetaDescription({
      practiceName: "Test Endo",
      vertical: "endodontics",
      city: "Boise",
      state: "ID",
      description: undefined,
    });
    expect(desc).toContain("Endodontist");
    expect(desc).toContain("Boise, ID");
    expect(desc).toContain("Test Endo");
    expect(desc).not.toMatch(/board-certified|award-winning|best in/i);
  });
});

// ── generateCanonicalUrl ─────────────────────────────────────────────

describe("generateCanonicalUrl", () => {
  test("root path returns the base alone with no trailing slash", () => {
    expect(
      generateCanonicalUrl({ baseUrl: "https://example.sites.getalloro.com", pagePath: "/" }),
    ).toBe("https://example.sites.getalloro.com");
    expect(
      generateCanonicalUrl({ baseUrl: "https://example.sites.getalloro.com/", pagePath: "" }),
    ).toBe("https://example.sites.getalloro.com");
  });

  test("subpath is normalized with a single leading slash", () => {
    expect(
      generateCanonicalUrl({ baseUrl: "https://example.sites.getalloro.com", pagePath: "services" }),
    ).toBe("https://example.sites.getalloro.com/services");
    expect(
      generateCanonicalUrl({ baseUrl: "https://example.sites.getalloro.com/", pagePath: "/about" }),
    ).toBe("https://example.sites.getalloro.com/about");
  });
});

// ── generateOpenGraphTags ────────────────────────────────────────────

describe("generateOpenGraphTags", () => {
  test("populates og:* and twitter:* fields", () => {
    const og = generateOpenGraphTags({
      title: "Endodontist in San Luis Obispo | Coastal Endodontic Studio",
      metaDescription: COASTAL_FACTS.description,
      canonical: COASTAL_FACTS.baseUrl,
      ogImage: "https://example.com/logo.png",
    });
    expect(og["og:title"]).toMatch(/Endodontist/);
    expect(og["og:description"]).toBe(COASTAL_FACTS.description);
    expect(og["og:url"]).toBe(COASTAL_FACTS.baseUrl);
    expect(og["og:image"]).toBe("https://example.com/logo.png");
    expect(og["og:type"]).toBe("website");
    expect(og["twitter:card"]).toBe("summary_large_image");
    expect(og["twitter:title"]).toMatch(/Endodontist/);
    expect(og["twitter:description"]).toBe(COASTAL_FACTS.description);
  });

  test("omitted og:image yields summary card not summary_large_image", () => {
    const og = generateOpenGraphTags({
      title: "x",
      metaDescription: "y",
      canonical: "https://x",
      ogImage: undefined,
    });
    expect(og["og:image"]).toBe("");
    expect(og["twitter:card"]).toBe("summary");
  });
});

// ── validateMetaTagStrings ──────────────────────────────────────────

describe("validateMetaTagStrings", () => {
  test("Coastal approved title + meta pass all three validators", () => {
    const result = validateMetaTagStrings(
      {
        title: "Endodontist in San Luis Obispo | Coastal Endodontic Studio",
        metaDescription: COASTAL_FACTS.description,
      },
      COASTAL_FACTS.description,
    );
    expect(result.passed).toBe(true);
    expect(result.brandVoice.passed).toBe(true);
    expect(result.emDash.passed).toBe(true);
    expect(result.factualCitation.passed).toBe(true);
  });

  test("em-dash in title is caught and surfaces as em-dash violation, not brand voice", () => {
    const result = validateMetaTagStrings(
      {
        title: "Endodontist in SLO — Coastal Endodontic Studio",
        metaDescription: COASTAL_FACTS.description,
      },
      COASTAL_FACTS.description,
    );
    expect(result.passed).toBe(false);
    expect(result.emDash.passed).toBe(false);
    expect(result.emDash.violations.join(" ")).toMatch(/em-dash/i);
  });

  test("banned brand-voice term is caught even when factual claims are valid", () => {
    const result = validateMetaTagStrings(
      {
        title: "x",
        metaDescription:
          "World-class endodontic care for the Central Coast. Modern, comfortable visits with our specialty team for the new and returning patient base.",
      },
      "World-class endodontic care for the Central Coast.",
    );
    expect(result.brandVoice.passed).toBe(false);
    expect(result.brandVoice.violations.join(" ")).toMatch(/world-class/i);
  });

  test("PR-005 fact-lock catches 'board-certified' claim not present in source", () => {
    const result = validateMetaTagStrings(
      {
        title: "Endodontist in SLO | Test Practice",
        metaDescription:
          "Board-certified endodontists serve the Central Coast with modern care for new and returning patients seeking a calm dental practice.",
      },
      "Endodontist in San Luis Obispo who provides root canals.", // source does NOT mention board-certified
    );
    expect(result.factualCitation.passed).toBe(false);
    expect(result.factualCitation.violations.join(" ")).toMatch(/board-certified/);
  });

  test("PR-005 fact-lock allows 'board-certified' claim when source contains it", () => {
    const result = validateMetaTagStrings(
      {
        title: "Endodontist in SLO | Test Practice",
        metaDescription:
          "Board-certified endodontists serve the Central Coast with modern care for new and returning patients seeking a calm dental practice.",
      },
      "Board-certified endodontists serving SLO.",
    );
    expect(result.factualCitation.passed).toBe(true);
  });
});

// ── buildPageMetaTags (orchestrator) ─────────────────────────────────

describe("buildPageMetaTags", () => {
  test("Coastal hero page produces complete artifact with all four fields and PASS validation", () => {
    const result = buildPageMetaTags({
      facts: COASTAL_FACTS,
      pagePath: "/",
    });
    expect(result.title).toBe("Endodontist in San Luis Obispo | Coastal Endodontic Studio");
    expect(result.metaDescription).toBe(COASTAL_FACTS.description);
    expect(result.canonical).toBe(COASTAL_FACTS.baseUrl);
    expect(result.openGraph["og:title"]).toBe(result.title);
    expect(result.openGraph["og:url"]).toBe(result.canonical);
    expect(result.validation.passed).toBe(true);
    expect(result.lengthWarnings).toEqual([]);
    expect(result.sourceFactsUsed.descriptionPresent).toBe(true);
    expect(result.sourceFactsUsed.city).toBe("San Luis Obispo");
  });

  test("Garrison services page produces a complete artifact with subpath canonical", () => {
    const result = buildPageMetaTags({
      facts: GARRISON_FACTS,
      pagePath: "/services",
    });
    expect(result.title).toBe("Orthodontist in West Orange | Garrison Orthodontics");
    expect(result.canonical).toBe(`${GARRISON_FACTS.baseUrl}/services`);
    expect(result.metaDescription.length).toBeLessThanOrEqual(160);
    expect(result.metaDescription).toContain("Garrison Orthodontics");
    expect(result.validation.passed).toBe(true);
  });

  test("missing description falls through to the synthesized fallback (no fabricated claims)", () => {
    const result = buildPageMetaTags({
      facts: { ...GARRISON_FACTS, description: undefined },
      pagePath: "/",
    });
    expect(result.metaDescription).toContain("Orthodontist");
    expect(result.metaDescription).toContain("West Orange");
    expect(result.validation.factualCitation.passed).toBe(true);
  });
});

// ── factsFromBakePractice ────────────────────────────────────────────

describe("factsFromBakePractice", () => {
  test("translates a BakePracticeMetadata + vertical into MetaTagSourceFacts", () => {
    const practice: BakePracticeMetadata = {
      name: "Garrison Orthodontics",
      address: { city: "West Orange", region: "NJ", country: "US" },
      description: "Orthodontic care in West Orange.",
    };
    const facts = factsFromBakePractice({
      practice,
      vertical: "orthodontics",
      baseUrl: "https://garrison.sites.getalloro.com",
    });
    expect(facts.practiceName).toBe("Garrison Orthodontics");
    expect(facts.vertical).toBe("orthodontics");
    expect(facts.city).toBe("West Orange");
    expect(facts.state).toBe("NJ");
    expect(facts.description).toBe("Orthodontic care in West Orange.");
    expect(facts.baseUrl).toBe("https://garrison.sites.getalloro.com");
  });
});
