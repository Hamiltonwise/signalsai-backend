/**
 * Cold Outbound dry-run integration tests.
 *
 * These tests inject deterministic stubs (draft generator, readability
 * checker, runPracticeAnalyzer, runPatientPathBuild) so the gate logic
 * is exercised without making any network calls. Goals:
 *   - All 12 fixtures processed (no silent drops).
 *   - Tier assignment correct, including the endo PBHS-no-referral
 *     fallback to Tier B.
 *   - Each tier produces drafts in the expected format.
 *   - Cross-tier uniqueness check fires correctly.
 *   - runPatientPathBuild called only for ortho Tier A when the prospect
 *     has no pre-attached preview.
 *   - runPracticeAnalyzer called only for Tier B when the prospect has
 *     no pre-attached findings.
 *   - mode='dry-run' is enforced.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, test, expect, beforeAll } from "vitest";

import {
  runColdOutbound,
  assignTier,
  type DraftGenerator,
  type ReadabilityChecker,
  type RunPracticeAnalyzer,
  type RunPatientPathBuild,
  type WedgeContext,
} from "../../src/services/agents/coldOutbound";
import type {
  AutoBuildPreview,
  ColdOutboundProspect,
} from "../../src/services/agents/coldOutbound.schema";
import { SAMPLE_COLD_OUTBOUND_PROSPECTS } from "./fixtures/cold-outbound-sample";

// ── Default deterministic stubs (no network) ────────────────────────

const passingReadability: ReadabilityChecker = async () => ({
  readable: true,
  issues: [],
  source: "stub",
});

/** Deterministic generator that mirrors the templateDraft logic. Used
 * across most tests so the gate logic runs against realistic copy. */
const stubGenerator: DraftGenerator = async ({
  prospect,
  touchNumber,
  tier,
  wedge,
  retryFeedback,
}) => {
  const elements: string[] = [];

  if (prospect.practiceName) elements.push(`practice: ${prospect.practiceName}`);
  if (prospect.city) {
    const loc = prospect.state ? `${prospect.city}, ${prospect.state}` : prospect.city;
    elements.push(`location: ${loc}`);
  }
  if (prospect.gbpReviewCount !== undefined) {
    elements.push(`gbp-review-count: ${prospect.gbpReviewCount}`);
  }
  if (prospect.gbpRating !== undefined) {
    elements.push(`gbp-rating: ${prospect.gbpRating}`);
  }
  if (prospect.practiceFacts) {
    for (const f of prospect.practiceFacts) elements.push(`practice-fact: ${f}`);
  }

  if (tier === "A" && wedge.referralData) {
    const r = wedge.referralData;
    elements.push(
      `gp-referral: ${r.gpName} at ${r.gpPracticeName}, ${r.timeframe}, ~$${r.estimatedAnnualValue}/yr`,
    );
  }
  if (tier === "A" && wedge.autoBuildPreview) {
    elements.push(`auto-build-preview: ${wedge.autoBuildPreview.previewUrl}`);
  }
  if (tier === "B" && wedge.analyzerFindings) {
    const f = wedge.analyzerFindings;
    elements.push(
      `analyzer-finding: ranked #${f.rankPosition} for "${f.specialty}", ${f.competitorName} ranks above with ${f.competitorReviewDelta} more reviews`,
    );
  }

  if (elements.length === 0) return null;

  const sources: string[] = [];
  if (prospect.practiceName) sources.push("practice_name");
  if (prospect.city) sources.push("city");
  if (prospect.gbpReviewCount !== undefined) sources.push("gbp_review_count");
  if (prospect.gbpRating !== undefined) sources.push("gbp_rating");
  if (prospect.practiceFacts) sources.push("practice_facts");
  if (tier === "A" && prospect.vertical === "endodontist") sources.push("gp_referral_data");
  if (tier === "A" && prospect.vertical === "orthodontist") sources.push("auto_build_preview");
  if (tier === "B") sources.push("analyzer_findings");

  const retryTag = retryFeedback ? " [retry]" : "";
  let subject: string;
  const lines: string[] = [];
  lines.push(`[DRY RUN PLACEHOLDER. NOT FOR SEND.]`);
  lines.push("");
  lines.push(`${prospect.name},`);
  lines.push("");

  if (tier === "A" && wedge.referralData && prospect.vertical === "endodontist") {
    const r = wedge.referralData;
    subject = `${r.gpName} stopped sending you cases${retryTag}`;
    lines.push(
      `Dr. ${r.gpName} at ${r.gpPracticeName} stopped sending cases ${r.timeframe}. That gap is worth roughly $${r.estimatedAnnualValue.toLocaleString()} per year based on visible referral patterns.`,
    );
    lines.push("");
    lines.push(
      `Alloro runs a referral diagnostic that surfaces which GPs shifted, where their cases went, and what changed. Reply yes if a five-minute look would help.`,
    );
  } else if (
    tier === "A" &&
    wedge.autoBuildPreview &&
    prospect.vertical === "orthodontist"
  ) {
    const previewUrl = wedge.autoBuildPreview.previewUrl;
    const practiceLabel = prospect.practiceName ?? "your practice";
    subject = `90-second site preview for ${practiceLabel}${retryTag}`;
    lines.push(
      `I built a website preview for ${practiceLabel} in 90 seconds using your existing Google data: ${previewUrl}.`,
    );
    lines.push("");
    lines.push(
      `No catch. Take a look. If you want to keep it, Alloro handles the domain transfer. If not, no harm done.`,
    );
  } else if (tier === "B" && wedge.analyzerFindings) {
    const f = wedge.analyzerFindings;
    const cityPart = prospect.city ? ` in ${prospect.city}` : "";
    const searchTerm = prospect.city
      ? `${f.specialty} ${prospect.city}`
      : f.specialty;
    subject = `${prospect.practiceName ?? "your practice"} ranks #${f.rankPosition} for ${f.specialty}${retryTag}`;
    lines.push(
      `${prospect.practiceName ?? "Your practice"}${cityPart} currently ranks #${f.rankPosition} for "${searchTerm}". ${f.competitorName} ranks above you with ${f.competitorReviewDelta} more Google reviews.`,
    );
    lines.push("");
    lines.push(
      `Alloro's free 90-second Practice Analyzer pulls the rest of the picture. Run it at alloro.com/checkup.`,
    );
  } else if (tier === "B") {
    subject = `Free 90-second Practice Analyzer for ${prospect.practiceName ?? "your practice"}${retryTag}`;
    lines.push(
      `Alloro's Practice Analyzer pulls how ${prospect.practiceName ?? "your practice"} shows up against other ${prospect.vertical}s on Google${prospect.city ? ` in ${prospect.city}` : ""}.`,
    );
    lines.push("");
    lines.push(`Runs in 90 seconds at alloro.com/checkup. No signup.`);
  } else {
    const localPart = prospect.city
      ? ` in ${prospect.city}${prospect.state ? `, ${prospect.state}` : ""}`
      : "";
    subject = `90-second look at ${prospect.practiceName ?? "your practice"}${retryTag}`;
    lines.push(
      `Found ${prospect.practiceName ?? "your practice"}${localPart} while pulling ${prospect.vertical} data for Alloro's Practice Analyzer.`,
    );
    if (prospect.gbpReviewCount !== undefined) {
      lines.push("");
      lines.push(
        `One specific data point: ${prospect.gbpReviewCount} Google reviews on file${prospect.gbpRating ? ` at a ${prospect.gbpRating} rating` : ""}.`,
      );
    }
    lines.push("");
    lines.push(
      `If a 90-second analyzer run on the rest of your online presence would help, run it free at alloro.com/checkup. One click, no signup.`,
    );
  }

  // Touch tail.
  if (touchNumber === 2) {
    lines.push("");
    lines.push(
      `Following up on last week's note. ${prospect.vertical === "endodontist" ? "Garrison Endodontics" : "Artful Orthodontics"} ran a similar diagnostic last quarter and recovered a referral channel they did not know they had lost.`,
    );
  } else if (touchNumber === 3) {
    lines.push("");
    lines.push(
      `Last note. The free 90-second analyzer is at alloro.com/checkup. One click, no signup.`,
    );
  } else if (touchNumber === 4) {
    lines.push("");
    lines.push(
      `If a 15-minute call would help, reply with a yes and a window. Otherwise reply remove.`,
    );
  }

  lines.push("");
  lines.push(`Corey`);
  lines.push(`Founder, Alloro`);
  lines.push("");
  lines.push(`Reply remove to opt out.`);

  return {
    subject,
    body: lines.join("\n"),
    personalizationElements: elements,
    personalizationSources: sources,
    generatedBy: "template_fallback",
  };
};

// ── Per-test temp output dir ────────────────────────────────────────

let tempOutputDir: string;
beforeAll(() => {
  tempOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "cold-outbound-test-"));
});

// ── Tests ───────────────────────────────────────────────────────────

describe("runColdOutbound (dry-run)", () => {
  test("rejects modes other than 'dry-run'", async () => {
    await expect(
      runColdOutbound({
        mode: "draft",
        vertical: "endodontist",
        touchNumber: 1,
        fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      }),
    ).rejects.toThrow(/dry-run/);
  });

  test("processes all 12 fixtures with no silent drops (across both verticals)", async () => {
    const endoResult = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "no-drops-endo",
    });
    const orthoResult = await runColdOutbound({
      mode: "dry-run",
      vertical: "orthodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "no-drops-ortho",
    });
    const endoTotal = endoResult.drafts.length + endoResult.skipped.length;
    const orthoTotal = orthoResult.drafts.length + orthoResult.skipped.length;
    const endoCount = SAMPLE_COLD_OUTBOUND_PROSPECTS.filter(
      (p) => p.vertical === "endodontist",
    ).length;
    const orthoCount = SAMPLE_COLD_OUTBOUND_PROSPECTS.filter(
      (p) => p.vertical === "orthodontist",
    ).length;
    expect(endoTotal).toBe(endoCount);
    expect(orthoTotal).toBe(orthoCount);
    expect(endoCount + orthoCount).toBe(12);
  });

  test("tier assignment: endo PBHS + referral data → Tier A", () => {
    const p = SAMPLE_COLD_OUTBOUND_PROSPECTS.find((x) => x.prospectId === "co-001")!;
    const t = assignTier(p);
    expect(t.tier).toBe("A");
    expect(t.fallbackFrom).toBeUndefined();
    expect(t.reason).toMatch(/endo Tier A/);
  });

  test("tier assignment: endo PBHS + NO referral data → Tier B (with fallback marker)", () => {
    const p = SAMPLE_COLD_OUTBOUND_PROSPECTS.find((x) => x.prospectId === "co-011")!;
    const t = assignTier(p);
    expect(t.tier).toBe("B");
    expect(t.fallbackFrom).toBe("A");
    expect(t.reason).toMatch(/no GP referral data/i);
  });

  test("tier assignment: ortho PBHS + low GBP completeness → Tier A", () => {
    const p = SAMPLE_COLD_OUTBOUND_PROSPECTS.find((x) => x.prospectId === "co-004")!;
    const t = assignTier(p);
    expect(t.tier).toBe("A");
    expect(t.fallbackFrom).toBeUndefined();
    expect(t.reason).toMatch(/ortho Tier A/);
  });

  test("tier assignment: ortho TDO + high GBP completeness → Tier B", () => {
    const p = SAMPLE_COLD_OUTBOUND_PROSPECTS.find((x) => x.prospectId === "co-007")!;
    const t = assignTier(p);
    expect(t.tier).toBe("B");
    expect(t.fallbackFrom).toBe("A");
    expect(t.reason).toMatch(/GBP completeness/);
  });

  test("tier assignment: no agency footer → Tier C", () => {
    const p = SAMPLE_COLD_OUTBOUND_PROSPECTS.find((x) => x.prospectId === "co-009")!;
    const t = assignTier(p);
    expect(t.tier).toBe("C");
    expect(t.fallbackFrom).toBeUndefined();
  });

  test("endo Tier A draft body cites GP name + dollar figure", async () => {
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "tier-a-endo-format",
    });
    const tierADrafts = result.drafts.filter((d) => d.tier === "A");
    expect(tierADrafts.length).toBeGreaterThan(0);
    for (const d of tierADrafts) {
      expect(d.body).toMatch(/Dr\.\s+\w+/);
      expect(d.body).toMatch(/\$[\d,]+/);
    }
  });

  test("ortho Tier A draft body cites preview URL", async () => {
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "orthodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "tier-a-ortho-format",
    });
    const tierADrafts = result.drafts.filter((d) => d.tier === "A");
    expect(tierADrafts.length).toBeGreaterThan(0);
    for (const d of tierADrafts) {
      expect(d.body).toMatch(/preview\.alloro\.com/);
    }
  });

  test("Tier B draft body cites rank + competitor", async () => {
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "tier-b-format",
    });
    // Tier B endo prospects (co-005, co-006) have analyzerFindings inline.
    const tierBwithFindings = result.drafts.filter(
      (d) => d.tier === "B" && d.gates.crossPersonalization.uniqueElementCount > 0,
    );
    const withRankCitation = tierBwithFindings.filter((d) =>
      /ranks?\s+#\d+/.test(d.body),
    );
    expect(withRankCitation.length).toBeGreaterThan(0);
  });

  test("Tier C draft body cites alloro.com/checkup", async () => {
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "tier-c-format",
    });
    const tierCDrafts = result.drafts.filter((d) => d.tier === "C");
    expect(tierCDrafts.length).toBeGreaterThan(0);
    for (const d of tierCDrafts) {
      expect(d.body).toMatch(/alloro\.com\/checkup/);
    }
  });

  test("auto-build path: runPatientPathBuild stub invoked only for ortho Tier A with no preview", async () => {
    const calls: string[] = [];
    const trackingPatientPathBuild: RunPatientPathBuild = async ({ prospectData }) => {
      calls.push(prospectData.name);
      return {
        previewUrl: "https://preview.alloro.com/test/auto",
        builtAt: new Date().toISOString(),
      } satisfies AutoBuildPreview;
    };

    // Strip pre-attached previews from ortho Tier A fixtures to force the stub call.
    const fixturesNoPreview: ColdOutboundProspect[] = SAMPLE_COLD_OUTBOUND_PROSPECTS.map(
      (p) => {
        if (p.vertical === "orthodontist" && p.autoBuildPreview) {
          const { autoBuildPreview, ...rest } = p;
          return rest as ColdOutboundProspect;
        }
        return p;
      },
    );

    const orthoResult = await runColdOutbound({
      mode: "dry-run",
      vertical: "orthodontist",
      touchNumber: 1,
      fixtureProspects: fixturesNoPreview,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      patientPathBuild: trackingPatientPathBuild,
      outputDir: tempOutputDir,
      outputBaseName: "patient-path-stub-ortho",
    });

    // Only ortho Tier A prospects (co-003, co-004) should have triggered the stub.
    expect(calls).toContain("Dr. Carlos Mendez");
    expect(calls).toContain("Dr. Naomi Patel");
    expect(calls.length).toBe(2);

    // Now run on endodontists. Stub should NOT be called.
    calls.length = 0;
    await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      patientPathBuild: trackingPatientPathBuild,
      outputDir: tempOutputDir,
      outputBaseName: "patient-path-stub-endo",
    });
    expect(calls.length).toBe(0);

    // And the ortho drafts that DID trigger the stub recorded it in stubsCalled.
    const stubbedDrafts = orthoResult.drafts.filter((d) =>
      d.stubsCalled.includes("runPatientPathBuild"),
    );
    expect(stubbedDrafts.length).toBe(2);
  });

  test("analyzer path: runPracticeAnalyzer stub invoked only for Tier B prospects without findings", async () => {
    const analyzerCalls: string[] = [];
    const trackingAnalyzer: RunPracticeAnalyzer = async ({ orgGbp }) => {
      analyzerCalls.push(orgGbp);
      return {
        rankPosition: 7,
        specialty: "endodontist",
        competitorName: "Test Competitor",
        competitorReviewDelta: 25,
      };
    };

    // Strip analyzer findings from Tier B fixtures to force the stub call.
    const fixturesNoFindings: ColdOutboundProspect[] = SAMPLE_COLD_OUTBOUND_PROSPECTS.map(
      (p) => {
        if (p.analyzerFindings) {
          const { analyzerFindings, ...rest } = p;
          return rest as ColdOutboundProspect;
        }
        return p;
      },
    );

    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: fixturesNoFindings,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      practiceAnalyzer: trackingAnalyzer,
      outputDir: tempOutputDir,
      outputBaseName: "analyzer-stub-endo",
    });

    // Endo Tier B prospects: co-005, co-006, plus co-011 (Tier A fallback to Tier B).
    expect(analyzerCalls.length).toBe(3);
    const tierBStubbed = result.drafts.filter(
      (d) => d.tier === "B" && d.stubsCalled.includes("runPracticeAnalyzer"),
    );
    expect(tierBStubbed.length).toBe(3);
    // Tier A endo (co-001, co-002) should not invoke the analyzer.
    const tierADraftsCallingAnalyzer = result.drafts.filter(
      (d) => d.tier === "A" && d.stubsCalled.includes("runPracticeAnalyzer"),
    );
    expect(tierADraftsCallingAnalyzer.length).toBe(0);
    // Tier C should not invoke the analyzer either.
    const tierCDraftsCallingAnalyzer = result.drafts.filter(
      (d) => d.tier === "C" && d.stubsCalled.includes("runPracticeAnalyzer"),
    );
    expect(tierCDraftsCallingAnalyzer.length).toBe(0);
  });

  test("co-012 (no signal) lands in skipped with no_personalization_data", async () => {
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "skip-empty",
    });
    const skipped = result.skipped.find((s) => s.prospectId === "co-012");
    expect(skipped).toBeDefined();
    expect(skipped?.reason).toBe("no_personalization_data");
  });

  test("every produced draft passes voice + auth gates", async () => {
    const endoResult = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "gates-endo",
    });
    const orthoResult = await runColdOutbound({
      mode: "dry-run",
      vertical: "orthodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "gates-ortho",
    });
    for (const d of [...endoResult.drafts, ...orthoResult.drafts]) {
      expect(d.gates.voice.passed, `voice failed for ${d.prospectId}: ${d.gates.voice.violations.join("; ")}`).toBe(true);
      expect(d.gates.humanAuthenticity.passed, `auth failed for ${d.prospectId}: ${d.gates.humanAuthenticity.flags.join("; ")}`).toBe(true);
    }
  });

  test("voice gate fails on em-dash and surfaces a skip", async () => {
    const emDashGenerator: DraftGenerator = async () => ({
      subject: "follow-up",
      // U+2014 em-dash deliberately inserted.
      body: "Found your practice — wanted to follow up.",
      personalizationElements: ["practice: Test"],
      personalizationSources: ["practice_name"],
      generatedBy: "template_fallback",
    });
    const tinyProspect: ColdOutboundProspect = {
      prospectId: "voice-fail",
      name: "Dr. Test",
      practiceName: "Test Endo",
      city: "Bend",
      state: "OR",
      vertical: "endodontist",
      pmsAgencyFooter: null,
    };
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: [tinyProspect],
      draftGenerator: emDashGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "em-dash-fail",
    });
    expect(result.drafts.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toBe("voice_violation");
    expect(result.skipped[0].detail).toMatch(/em-dash/i);
  });

  test("human authenticity retry fires on a flagged first draft", async () => {
    const calls: string[] = [];
    const flakyGenerator: DraftGenerator = async ({ retryFeedback }) => {
      if (!retryFeedback) {
        calls.push("first");
        return {
          subject: "test",
          body:
            "I'd be happy to follow up. Certainly! It's important to note we leverage cutting-edge tools. We'd love to delve into this with you.",
          personalizationElements: ["practice: Test Endo"],
          personalizationSources: ["practice_name"],
          generatedBy: "template_fallback",
        };
      }
      calls.push("retry");
      return {
        subject: "follow-up",
        body:
          "Found Test Endo in Boise. Replied with a yes if a 90-second analyzer run would help. Reply remove to opt out. Corey, Founder, Alloro.",
        personalizationElements: ["practice: Test Endo", "location: Boise, ID"],
        personalizationSources: ["practice_name", "city"],
        generatedBy: "template_fallback",
      };
    };
    const prospect: ColdOutboundProspect = {
      prospectId: "retry-test",
      name: "Dr. Retry",
      practiceName: "Test Endo",
      city: "Boise",
      state: "ID",
      vertical: "endodontist",
      pmsAgencyFooter: null,
    };
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: [prospect],
      draftGenerator: flakyGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "retry-fires",
    });
    expect(calls).toEqual(["first", "retry"]);
    expect(result.drafts.length).toBe(1);
    expect(result.drafts[0].gates.humanAuthenticity.retried).toBe(true);
  });

  test("cross-personalization check flags two near-identical drafts as Yellow", async () => {
    // Identical personalization signals across two prospects → no element
    // is unique to either → both must land Yellow.
    const dupGenerator: DraftGenerator = async ({ prospect }) => ({
      subject: "follow-up",
      body: `Found a practice in your city. Reply if a 90-second analyzer run would help. Corey, Founder, Alloro. Reply remove to opt out. (${prospect.prospectId})`,
      personalizationElements: [
        "topic: tier-c-generic-prospecting",
        "channel: cold-outbound",
      ],
      personalizationSources: ["practice_name"],
      generatedBy: "template_fallback",
    });
    const a: ColdOutboundProspect = {
      prospectId: "dup-a",
      name: "Dr. Alpha",
      practiceName: "Alpha Endo",
      city: "Austin",
      state: "TX",
      vertical: "endodontist",
      pmsAgencyFooter: null,
    };
    const b: ColdOutboundProspect = {
      prospectId: "dup-b",
      name: "Dr. Beta",
      practiceName: "Beta Endo",
      city: "Austin",
      state: "TX",
      vertical: "endodontist",
      pmsAgencyFooter: null,
    };
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: [a, b],
      draftGenerator: dupGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "cross-personalization",
    });
    expect(result.drafts.length).toBe(2);
    for (const d of result.drafts) {
      expect(d.confidence).toBe("yellow");
      expect(d.gates.crossPersonalization.uniqueElementCount).toBe(0);
      expect(d.gates.crossPersonalization.sharedElements.length).toBeGreaterThan(0);
    }
  });

  test("readable=false caps confidence at Yellow even with 2+ unique elements", async () => {
    const failingReadability: ReadabilityChecker = async () => ({
      readable: false,
      issues: ["awkward phrasing in sentence 2"],
      source: "stub",
    });
    const richProspect: ColdOutboundProspect = {
      prospectId: "rd-cap-test",
      name: "Dr. Cap",
      practiceName: "Cap Endo",
      city: "Asheville",
      state: "NC",
      vertical: "endodontist",
      pmsAgencyFooter: null,
      gbpReviewCount: 142,
      gbpRating: 4.7,
      practiceFacts: [
        "single-doctor practice, microscope-equipped",
        "ABE diplomate",
      ],
    };
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: [richProspect],
      draftGenerator: stubGenerator,
      readabilityChecker: failingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "rd-cap",
    });
    expect(result.drafts.length).toBe(1);
    const d = result.drafts[0];
    expect(d.gates.crossPersonalization.uniqueElementCount).toBeGreaterThanOrEqual(2);
    expect(d.gates.readability.passed).toBe(false);
    expect(d.confidence).toBe("yellow");
    expect(d.confidenceReasons.join(" ")).toMatch(/readability gate flagged/);
  });

  test("writes a markdown report to the chosen output dir", async () => {
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "report-written",
    });
    expect(fs.existsSync(result.outputPath)).toBe(true);
    const contents = fs.readFileSync(result.outputPath, "utf8");
    expect(contents).toMatch(/Cold Outbound Dry-Run/);
    expect(contents).toMatch(/Tier A: \d+/);
    expect(contents).toMatch(/Drafted: \d+/);
  });

  test("readability gate runs after auth+voice and only on accepted drafts", async () => {
    const readabilityCalls: string[] = [];
    const tracker: ReadabilityChecker = async (text) => {
      readabilityCalls.push(text);
      return { readable: true, issues: [], source: "stub" };
    };
    const result = await runColdOutbound({
      mode: "dry-run",
      vertical: "endodontist",
      touchNumber: 1,
      fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
      draftGenerator: stubGenerator,
      readabilityChecker: tracker,
      outputDir: tempOutputDir,
      outputBaseName: "readability-runs",
    });
    expect(readabilityCalls.length).toBe(result.drafts.length);
    for (const d of result.drafts) {
      expect(d.gates.readability.passed).toBe(true);
      expect(d.gates.readability.source).toBe("stub");
    }
  });

  test("WedgeContext type narrows correctly for tier A endo", () => {
    // Compile-time sanity check: the WedgeContext shape is exported.
    const ctx: WedgeContext = {
      tier: "A",
      vertical: "endodontist",
      referralData: {
        gpName: "Test",
        gpPracticeName: "Test Group",
        timeframe: "in March 2026",
        estimatedAnnualValue: 10000,
      },
    };
    expect(ctx.tier).toBe("A");
  });
});
