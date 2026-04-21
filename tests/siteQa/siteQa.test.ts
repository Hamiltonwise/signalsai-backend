import { describe, test, expect } from "vitest";
import { runSiteQa } from "../../src/services/siteQa/siteQaAgent";
import { runAiContentArtifactGate } from "../../src/services/siteQa/gates/aiContentArtifact";
import { runPlaceholderTextGate } from "../../src/services/siteQa/gates/placeholderText";
import { runBannedPhraseGate } from "../../src/services/siteQa/gates/bannedPhrase";
import { runPunctuationFormattingGate } from "../../src/services/siteQa/gates/punctuationFormatting";
import { runCopyrightYearGate } from "../../src/services/siteQa/gates/copyrightYear";
import { runStructuralCompletenessGate } from "../../src/services/siteQa/gates/structuralCompleteness";
import { runAltTextSanityGate } from "../../src/services/siteQa/gates/altTextSanity";
import { runTemplateCollisionGate, type CollisionFetcher } from "../../src/services/siteQa/gates/templateCollision";
import {
  coastalSections,
  coastalFooter,
  arcsSections,
  arcsFooter,
  cleanSections,
  cleanFooter,
} from "./fixtures";
import type { SiteQaContext } from "../../src/services/siteQa/types";

const CURRENT_YEAR = new Date().getUTCFullYear();

function ctx(overrides: Partial<SiteQaContext> = {}): SiteQaContext {
  return {
    projectId: overrides.projectId ?? "test-project",
    pagePath: overrides.pagePath ?? "/",
    sections: overrides.sections ?? [],
    orgName: overrides.orgName,
    orgId: overrides.orgId,
    currentYear: overrides.currentYear ?? CURRENT_YEAR,
    footer: overrides.footer,
    useLlm: overrides.useLlm ?? false,
  };
}

// ─── Per-gate unit tests ────────────────────────────────────────────

describe("aiContentArtifact gate", () => {
  test("catches Claude responded + timestamp", () => {
    const result = runAiContentArtifactGate(
      ctx({ sections: [{ type: "t", text: "2:32 PM / Claude responded: save y…" }] })
    );
    expect(result.passed).toBe(false);
    const labels = result.defects.map((d) => d.message);
    expect(labels.some((l) => l.includes("Claude responded"))).toBe(true);
    expect(labels.some((l) => l.includes("Timestamp"))).toBe(true);
  });

  test("passes clean copy", () => {
    const result = runAiContentArtifactGate(
      ctx({ sections: [{ type: "t", text: "Board-certified endodontist. Same-day emergency care." }] })
    );
    expect(result.passed).toBe(true);
  });
});

describe("placeholderText gate", () => {
  test("catches Doctors Block / Services Block duplicates", () => {
    const result = runPlaceholderTextGate(
      ctx({
        sections: [
          { type: "h", text: "Doctors Block Doctors Block" },
          { type: "h", text: "Services Block Services Block" },
        ],
      })
    );
    expect(result.passed).toBe(false);
    expect(result.defects.length).toBeGreaterThanOrEqual(2);
  });
});

describe("bannedPhrase gate", () => {
  test("catches state-of-the-art", () => {
    const result = runBannedPhraseGate(
      ctx({ sections: [{ type: "h", text: "We use state-of-the-art microendodontics." }] })
    );
    expect(result.passed).toBe(false);
    expect(result.defects[0].message).toMatch(/state-of-the-art/);
  });

  test("catches up-to-date technology", () => {
    const result = runBannedPhraseGate(
      ctx({ sections: [{ type: "h", text: "Our office features up-to-date technology." }] })
    );
    expect(result.passed).toBe(false);
  });
});

describe("punctuationFormatting gate", () => {
  test("catches missing space after comma", () => {
    const result = runPunctuationFormattingGate(
      ctx({ sections: [{ type: "h", text: "Expert Root Canal Care,Close to Home." }] })
    );
    expect(result.passed).toBe(false);
  });

  test("catches missing space after period", () => {
    const result = runPunctuationFormattingGate(
      ctx({ sections: [{ type: "h", text: "Save Your Tooth.Trust the Specialists." }] })
    );
    expect(result.passed).toBe(false);
  });

  test("catches em-dash", () => {
    const result = runPunctuationFormattingGate(
      ctx({ sections: [{ type: "h", text: "We care — deeply — about you." }] })
    );
    expect(result.passed).toBe(false);
  });
});

describe("copyrightYear gate", () => {
  test("catches stale year in footer", () => {
    const result = runCopyrightYearGate(
      ctx({ footer: "© 2025 Coastal", currentYear: 2026 })
    );
    expect(result.passed).toBe(false);
    expect(result.defects[0].message).toMatch(/2025/);
  });

  test("passes current year in footer", () => {
    const result = runCopyrightYearGate(
      ctx({ footer: "© 2026 Coastal", currentYear: 2026 })
    );
    expect(result.passed).toBe(true);
  });
});

describe("structuralCompleteness gate", () => {
  test("catches service card without description", () => {
    const result = runStructuralCompletenessGate(
      ctx({
        sections: [
          {
            type: "services",
            data: {
              services: [{ title: "Root Canal Therapy" }],
            },
          },
        ],
      })
    );
    expect(result.passed).toBe(false);
    expect(result.defects[0].message).toMatch(/description/);
  });

  test("catches doctor card without photo", () => {
    const result = runStructuralCompletenessGate(
      ctx({
        sections: [
          {
            type: "doctors",
            data: {
              doctors: [{ name: "Dr. Smith" }],
            },
          },
        ],
      })
    );
    expect(result.passed).toBe(false);
    expect(result.defects[0].message).toMatch(/photo/);
  });

  test("catches location without hours", () => {
    const result = runStructuralCompletenessGate(
      ctx({
        sections: [
          {
            type: "locations",
            data: {
              locations: [{ name: "Main office", address: "12 Main St" }],
            },
          },
        ],
      })
    );
    expect(result.passed).toBe(false);
    expect(result.defects[0].message).toMatch(/hours/);
  });
});

describe("altTextSanity gate (deterministic patterns)", () => {
  test("catches duplicate in alt text", async () => {
    const result = await runAltTextSanityGate(
      ctx({
        sections: [
          {
            type: "gallery",
            data: { images: [{ alt: "Duplicate outdoor portrait" }] },
          },
        ],
      })
    );
    expect(result.passed).toBe(false);
  });

  test("passes descriptive alt text", async () => {
    const result = await runAltTextSanityGate(
      ctx({
        sections: [
          {
            type: "gallery",
            data: { images: [{ alt: "Dr. Reyes reviewing X-rays with a patient" }] },
          },
        ],
      })
    );
    expect(result.passed).toBe(true);
  });
});

describe("templateCollision gate", () => {
  const stubFetcher = (colliding: Set<string>): CollisionFetcher => ({
    async fingerprintExistsElsewhere(hash: string): Promise<boolean> {
      return colliding.has(hash);
    },
  });

  test("flags verbatim copy shared across sites", async () => {
    // We don't know the hash up-front, so use an always-collides fetcher
    const fetcher: CollisionFetcher = {
      async fingerprintExistsElsewhere() {
        return true;
      },
    };
    const result = await runTemplateCollisionGate(
      ctx({
        sections: [
          {
            type: "about",
            data: {
              body: "We take the time to answer every question, so you feel confident and comfortable before, during, and after treatment.",
            },
          },
        ],
      }),
      fetcher
    );
    expect(result.passed).toBe(false);
  });

  test("passes when no collision", async () => {
    const fetcher: CollisionFetcher = {
      async fingerprintExistsElsewhere() {
        return false;
      },
    };
    const result = await runTemplateCollisionGate(
      ctx({
        sections: [
          { type: "about", data: { body: "Practice-specific copy nobody else on the planet could write." } },
        ],
      }),
      fetcher
    );
    expect(result.passed).toBe(true);
  });

  test("ignores short spans under 10 words", async () => {
    const fetcher: CollisionFetcher = {
      async fingerprintExistsElsewhere() {
        return true;
      },
    };
    const result = await runTemplateCollisionGate(
      ctx({ sections: [{ type: "h", text: "Short copy." }] }),
      fetcher
    );
    expect(result.passed).toBe(true);
  });
});

// ─── Integration: Coastal & ARCS fixtures ──────────────────────────

const alwaysCollides: CollisionFetcher = {
  async fingerprintExistsElsewhere() {
    return true;
  },
};

describe("integration: Coastal (calm-beauty-2180)", () => {
  test("catches every expected defect", async () => {
    const report = await runSiteQa(
      ctx({
        projectId: "calm-beauty-2180",
        pagePath: "/",
        sections: coastalSections,
        footer: coastalFooter,
        orgName: "Coastal Endodontic Studio",
        currentYear: 2026,
        useLlm: false,
      }),
      { collisionFetcher: alwaysCollides }
    );

    const messages = report.defects.map((d) => `${d.gate}: ${d.message} :: ${d.evidence.text ?? ""}`);
    const joined = messages.join(" | ");

    expect(report.passed).toBe(false);
    expect(joined).toMatch(/Claude responded/);
    expect(joined).toMatch(/Timestamp/);
    expect(joined.toLowerCase()).toMatch(/state-of-the-art/);
    expect(joined).toMatch(/Missing space/);
    expect(joined).toMatch(/2025/);
    expect(joined.toLowerCase()).toMatch(/duplication|duplicate/);
    expect(joined).toMatch(/template collision/i);
  });
});

describe("integration: ARCS (calm-clinic-3597)", () => {
  test("catches every expected defect", async () => {
    const report = await runSiteQa(
      ctx({
        projectId: "calm-clinic-3597",
        pagePath: "/",
        sections: arcsSections,
        footer: arcsFooter,
        orgName: "ARCS",
        currentYear: 2026,
        useLlm: false,
      }),
      { collisionFetcher: alwaysCollides }
    );

    const messages = report.defects.map((d) => `${d.gate}: ${d.message} :: ${d.evidence.text ?? ""}`);
    const joined = messages.join(" | ");

    expect(report.passed).toBe(false);
    expect(joined).toMatch(/Doctors Block/);
    expect(joined).toMatch(/Services Block/);
    expect(joined).toMatch(/Missing space/);
    expect(joined).toMatch(/description/);
    expect(joined.toLowerCase()).toMatch(/up-to-date technology/);
    expect(joined).toMatch(/template collision/i);
  });
});

describe("integration: clean site", () => {
  test("passes all deterministic gates", async () => {
    const report = await runSiteQa(
      ctx({
        projectId: "clean-site",
        pagePath: "/",
        sections: cleanSections,
        footer: cleanFooter,
        orgName: "Reyes Orthodontics",
        currentYear: CURRENT_YEAR,
        useLlm: false,
      }),
      {
        collisionFetcher: {
          async fingerprintExistsElsewhere() {
            return false;
          },
        },
      }
    );
    const blockingGates = report.gates
      .filter((g) => !g.passed)
      .map((g) => `${g.gate}: ${g.defects.map((d) => d.message).join(", ")}`);
    expect(report.passed, `unexpected defects: ${blockingGates.join(" | ")}`).toBe(true);
  });
});
