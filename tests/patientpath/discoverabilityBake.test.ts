/**
 * Tests for the Discoverability Bake stage (Card 2 patientpath).
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/services/rubric/gateFlag", () => ({
  _resetFlagCache: () => {},
  isFreeformConcernGateEnabled: async () => false,
  isRecognitionScoreEnabled: async () => false,
  isDiscoverabilityBakeEnabled: async () =>
    process.env.DISCOVERABILITY_BAKE_ENABLED === "true",
}));

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: { create: async () => ({}) },
}));

vi.mock("../../src/database/connection", () => ({
  db: Object.assign(
    () => ({
      where: () => ({ first: async () => ({}) }),
      insert: async () => ({}),
    }),
    { raw: (s: string) => s }
  ),
}));

// Force the templates loader to use the fallback (no network).
vi.mock(
  "../../src/services/patientpath/stages/discoverabilityBake.templates",
  async (importActual) => {
    const actual = (await importActual()) as any;
    return {
      ...actual,
      loadSchemaTemplates: async () => {
        const fresh = actual.loadSchemaTemplates;
        // Force fallback: unset NOTION_TOKEN in this scope.
        const prev = process.env.NOTION_TOKEN;
        delete process.env.NOTION_TOKEN;
        try {
          const result = await fresh();
          return result;
        } finally {
          if (prev) process.env.NOTION_TOKEN = prev;
        }
      },
    };
  }
);

describe("Discoverability Bake", () => {
  beforeEach(() => {
    delete process.env.DISCOVERABILITY_BAKE_ENABLED;
  });

  test("produces JSON-LD, FAQ, and internal links for each section", async () => {
    const { runDiscoverabilityBakeStage } = await import(
      "../../src/services/patientpath/stages/discoverabilityBake"
    );
    const result = await runDiscoverabilityBakeStage({
      orgId: 1,
      copyId: "copy-xyz",
      copy: {
        sections: [
          { name: "hero", headline: "A", body: "b" },
          { name: "about", headline: "A", body: "b" },
          { name: "services", headline: "A", body: "b" },
        ],
      },
      practice: {
        name: "Surf City Endodontics",
        specialty: "endodontics",
        phone: "714-555-0100",
        websiteUrl: "https://surfcityendo.com",
        address: { city: "Huntington Beach", region: "CA", country: "US" },
      },
      practitioner: {
        fullName: "Dr. Chris Olson",
        credentials: ["DDS"],
        education: ["USC School of Dentistry"],
        specialty: "Endodontics",
      },
      reviews: [
        { author: "Maria V.", text: "Great care.", rating: 5 },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.artifact.pages.length).toBe(3);
    const hero = result.artifact.pages.find((p) => p.sectionName === "hero");
    expect(hero).toBeDefined();
    expect(hero!.jsonLd.some((s: any) => s["@type"] === "Person")).toBe(true);
    expect(hero!.jsonLd.some((s: any) => s["@type"] === "FAQPage")).toBe(true);
    expect(hero!.primaryCta.text.length).toBeGreaterThan(0);
    expect(hero!.internalLinks.length).toBeGreaterThan(0);
  });

  test("shadow mode: artifact attached to copy but sections untouched", async () => {
    const { runDiscoverabilityBakeStage } = await import(
      "../../src/services/patientpath/stages/discoverabilityBake"
    );
    const input = {
      orgId: 1,
      copyId: "copy-xyz",
      copy: {
        sections: [
          { name: "hero", headline: "A", body: "b" },
        ],
      },
      practice: {
        name: "Surf City Endodontics",
        specialty: "endodontics",
      },
    };
    const result = await runDiscoverabilityBakeStage(input);
    expect(result.shadow).toBe(true);
    // Shadow: artifact attached, sections unchanged
    expect(result.copy.discoverability_bake).toBeDefined();
    expect(result.copy.sections[0].schema).toBeUndefined();
  });

  test("live mode: stamps schema onto each section", async () => {
    process.env.DISCOVERABILITY_BAKE_ENABLED = "true";
    const { runDiscoverabilityBakeStage } = await import(
      "../../src/services/patientpath/stages/discoverabilityBake"
    );
    const input = {
      orgId: 1,
      copyId: "copy-xyz",
      copy: {
        sections: [
          { name: "hero", headline: "A", body: "b" },
        ],
      },
      practice: { name: "Test", specialty: "endodontics" },
    };
    const result = await runDiscoverabilityBakeStage(input);
    expect(result.shadow).toBe(false);
    expect(result.copy.sections[0].schema).toBeDefined();
    expect(Array.isArray(result.copy.sections[0].schema.jsonLd)).toBe(true);
  });

  test("config-change-without-redeploy: loadSchemaTemplates cached but re-loadable", async () => {
    const {
      loadSchemaTemplates,
      _resetTemplatesCache,
    } = await import(
      "../../src/services/patientpath/stages/discoverabilityBake.templates"
    );
    _resetTemplatesCache();
    const first = await loadSchemaTemplates();
    _resetTemplatesCache();
    const second = await loadSchemaTemplates();
    expect(first.source).toBeDefined();
    expect(second.source).toBeDefined();
  });
});
