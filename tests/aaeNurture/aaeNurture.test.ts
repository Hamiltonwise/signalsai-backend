/**
 * AAE Nurture dry-run integration tests.
 *
 * These tests inject a deterministic draft generator so the gate logic
 * is exercised without making any network calls. The goal is to assert
 * the genuinely novel pieces:
 *   - All fixture records get processed (no silent drops).
 *   - Skip reasons are surfaced and accurate.
 *   - checkVoice and checkHumanAuthenticity actually run on every draft.
 *   - Cross-personalization uniqueness check fires correctly.
 *   - Confidence distribution is reasonable (mix of green/yellow).
 *   - mode='dry-run' is enforced.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, test, expect, beforeAll } from "vitest";

import {
  runAaeNurture,
  type DraftGenerator,
  type ReadabilityChecker,
} from "../../src/services/agents/aaeNurture";
import type { AaeAttendee } from "../../src/services/agents/aaeNurture.schema";
import { SAMPLE_AAE_ATTENDEES } from "./fixtures/aae-attendees-sample";

// Default deterministic readability checker: always passes. Tests that
// exercise readability inject a different stub.
const passingReadability: ReadabilityChecker = async () => ({
  readable: true,
  issues: [],
  source: "stub",
});

// ── Deterministic generator (no network) ────────────────────────────

const stubGenerator: DraftGenerator = async ({ attendee, retryFeedback }) => {
  const elements: string[] = [];

  if (attendee.boothNotes && attendee.boothNotes.trim().length > 0) {
    elements.push(`booth-conversation-note: ${attendee.boothNotes.trim()}`);
  }
  if (attendee.practiceName) elements.push(`practice: ${attendee.practiceName}`);
  if (attendee.city) {
    const loc = attendee.state ? `${attendee.city}, ${attendee.state}` : attendee.city;
    elements.push(`location: ${loc}`);
  }
  if (attendee.practiceFacts) {
    for (const f of attendee.practiceFacts) elements.push(`practice-fact: ${f}`);
  }

  if (elements.length === 0) return null;

  const sources: string[] = [];
  if (attendee.boothNotes) sources.push("booth_notes");
  if (attendee.practiceName) sources.push("practice_name");
  if (attendee.city) sources.push("city");
  if (attendee.practiceFacts) sources.push("practice_facts");

  const subject = retryFeedback
    ? `${attendee.name}, AAE follow-up [retry]`
    : `${attendee.name}, AAE follow-up`;

  // Body intentionally avoids banned phrases and em-dashes.
  // Reference at least one specific personalization signal so the body
  // contains content unique to this attendee.
  const lines: string[] = [];
  lines.push(`[DRY RUN PLACEHOLDER]`);
  lines.push("");
  lines.push(`${attendee.name},`);
  lines.push("");
  if (attendee.boothNotes) {
    lines.push(`We talked at AAE about ${attendee.boothNotes.trim()}.`);
  } else if (attendee.practiceName && attendee.city) {
    lines.push(
      `Following up after AAE on ${attendee.practiceName} in ${attendee.city}.`,
    );
  } else if (attendee.practiceName) {
    lines.push(`Following up after AAE on ${attendee.practiceName}.`);
  }
  if (attendee.practiceFacts && attendee.practiceFacts[0]) {
    lines.push(`One thing that stuck with me: ${attendee.practiceFacts[0]}.`);
  }
  lines.push(`If useful, the free Practice Analyzer at alloro.com/checkup runs against your Google profile and shows what most patients see before they call.`);
  lines.push("");
  lines.push(`Reply if useful, ignore if not.`);
  lines.push("Corey");

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
  tempOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "aae-nurture-test-"));
});

// ── Tests ────────────────────────────────────────────────────────────

describe("runAaeNurture (dry-run)", () => {
  test("rejects modes other than 'dry-run'", async () => {
    await expect(
      runAaeNurture({
        // @ts-expect-error: testing the runtime guard for an invalid mode.
        mode: "send",
        segmentFilter: "professional_us",
        touchNumber: 1,
        fixtureAttendees: SAMPLE_AAE_ATTENDEES,
      }),
    ).rejects.toThrow(/dry-run/);
  });

  test("processes exactly 10 fixture records with no silent drops", async () => {
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: SAMPLE_AAE_ATTENDEES,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "no-silent-drops",
    });
    const totalAccountedFor = result.drafts.length + result.skipped.length;
    expect(totalAccountedFor).toBe(SAMPLE_AAE_ATTENDEES.length);
    expect(SAMPLE_AAE_ATTENDEES.length).toBe(10);
  });

  test("at least 7 fixture records produce drafts (the empty one skips)", async () => {
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: SAMPLE_AAE_ATTENDEES,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "min-7-drafts",
    });
    expect(result.drafts.length).toBeGreaterThanOrEqual(7);

    // The truly empty fixture (008) has no personalization → skip.
    const skipIds = result.skipped.map((s) => s.attendeeId);
    expect(skipIds).toContain("fixture-008");
    const emptyOne = result.skipped.find((s) => s.attendeeId === "fixture-008");
    expect(emptyOne?.reason).toBe("no_personalization_data");
  });

  test("every produced draft passes checkVoice", async () => {
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: SAMPLE_AAE_ATTENDEES,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "voice-pass",
    });
    for (const d of result.drafts) {
      expect(d.gates.voice.passed, `voice failed for ${d.attendeeId}: ${d.gates.voice.violations.join("; ")}`).toBe(
        true,
      );
    }
  });

  test("every produced draft passes human authenticity (with retry path tracked)", async () => {
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: SAMPLE_AAE_ATTENDEES,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "auth-pass",
    });
    for (const d of result.drafts) {
      expect(d.gates.humanAuthenticity.passed).toBe(true);
    }
  });

  test("voice gate fails on em-dash and surfaces a skip", async () => {
    const emDashGenerator: DraftGenerator = async () => ({
      subject: "AAE follow-up",
      // U+2014 em-dash deliberately inserted to trip the voice gate.
      body: "We met at AAE — wanted to follow up about your practice in Bend.",
      personalizationElements: ["location: Bend, OR"],
      personalizationSources: ["city"],
      generatedBy: "template_fallback",
    });
    const tinyAttendee: AaeAttendee = {
      attendeeId: "voice-fail-test",
      name: "Dr. Test",
      city: "Bend",
      state: "OR",
      segment: "professional_us",
      vertical: "endodontics",
    };
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: [tinyAttendee],
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
    // First call returns AI-fingerprinted text; second returns clean text.
    const flakyGenerator: DraftGenerator = async ({ retryFeedback }) => {
      if (!retryFeedback) {
        calls.push("first");
        return {
          subject: "AAE",
          // Five hits = 100 - 40 = 60 → below the 70 threshold.
          body:
            "I'd be happy to follow up. Certainly! It's important to note we leverage cutting-edge tools. We'd love to delve into this with you.",
          personalizationElements: ["practice: Test Endo"],
          personalizationSources: ["practice_name"],
          generatedBy: "template_fallback",
        };
      }
      calls.push("retry");
      return {
        subject: "AAE follow-up",
        body:
          "Following up after AAE on Test Endo in Boise. Reply if useful, ignore if not. Corey",
        personalizationElements: ["practice: Test Endo", "location: Boise, ID"],
        personalizationSources: ["practice_name", "city"],
        generatedBy: "template_fallback",
      };
    };
    const attendee: AaeAttendee = {
      attendeeId: "retry-test",
      name: "Dr. Retry",
      practiceName: "Test Endo",
      city: "Boise",
      state: "ID",
      segment: "professional_us",
      vertical: "endodontics",
    };
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: [attendee],
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
    // Two attendees with identical personalization signals → no element
    // is unique to either → both must land Yellow.
    const dupGenerator: DraftGenerator = async ({ attendee }) => ({
      subject: `${attendee.name}, AAE follow-up`,
      body: "Following up after AAE about referral patterns in growing markets. Reply if useful, ignore if not. Corey",
      // Same elements for both attendees on purpose.
      personalizationElements: [
        "topic: referral-pattern-shifts",
        "vertical: endodontics",
      ],
      personalizationSources: ["booth_notes"],
      generatedBy: "template_fallback",
    });
    const a: AaeAttendee = {
      attendeeId: "dup-a",
      name: "Dr. Alpha",
      practiceName: "Alpha Endo",
      segment: "professional_us",
      vertical: "endodontics",
      boothNotes: "referral patterns",
    };
    const b: AaeAttendee = {
      attendeeId: "dup-b",
      name: "Dr. Beta",
      practiceName: "Beta Endo",
      segment: "professional_us",
      vertical: "endodontics",
      boothNotes: "referral patterns",
    };
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: [a, b],
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

  test("confidence distribution shows a mix (not all green, not all yellow)", async () => {
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: SAMPLE_AAE_ATTENDEES,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "mixed-confidence",
    });
    expect(result.summary.green).toBeGreaterThan(0);
    expect(result.summary.yellow).toBeGreaterThan(0);
    // Spec rubric: only Green when 2+ unique elements after cross-check.
    // Rich-note fixtures (001, 002, 003, 010) should land Green; thin
    // ones with only 1 unique element land Yellow.
    expect(result.summary.green).toBeGreaterThanOrEqual(3);
  });

  test("writes a markdown report to the chosen output dir", async () => {
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: SAMPLE_AAE_ATTENDEES,
      draftGenerator: stubGenerator,
      readabilityChecker: passingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "report-written",
    });
    expect(fs.existsSync(result.outputPath)).toBe(true);
    const contents = fs.readFileSync(result.outputPath, "utf8");
    expect(contents).toMatch(/AAE Nurture Dry-Run/);
    expect(contents).toMatch(/Drafted: \d+/);
  });

  test("readability gate runs after auth+voice and only on accepted drafts", async () => {
    // Track every text the readability checker is asked to evaluate, plus
    // the order: auth runs first, then voice, then readability. We assert
    // by checking that voice-rejected and auth-rejected drafts never reach
    // the readability checker.
    const readabilityCalls: string[] = [];
    const tracker: ReadabilityChecker = async (text) => {
      readabilityCalls.push(text);
      return { readable: true, issues: [], source: "stub" };
    };
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: SAMPLE_AAE_ATTENDEES,
      draftGenerator: stubGenerator,
      readabilityChecker: tracker,
      outputDir: tempOutputDir,
      outputBaseName: "readability-runs",
    });
    // One call per draft that survived auth + voice. None for skipped.
    expect(readabilityCalls.length).toBe(result.drafts.length);
    // Every produced draft has a readability gate result.
    for (const d of result.drafts) {
      expect(d.gates.readability.passed).toBe(true);
      expect(d.gates.readability.source).toBe("stub");
    }
  });

  test("readable=false caps confidence at Yellow even with 2+ unique elements", async () => {
    const failingReadability: ReadabilityChecker = async () => ({
      readable: false,
      issues: ["awkward phrasing in sentence 2", "subject-verb agreement issue"],
      source: "stub",
    });
    // Use a single rich-note attendee (would normally land Green).
    const richAttendee: AaeAttendee = {
      attendeeId: "readability-cap-test",
      name: "Dr. Cap",
      practiceName: "Cap Endo",
      city: "Asheville",
      state: "NC",
      segment: "professional_us",
      vertical: "endodontics",
      boothNotes: "asked about referral channel diversification",
      practiceFacts: ["only endodontist in Asheville with same-day emergency slots"],
    };
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: [richAttendee],
      draftGenerator: stubGenerator,
      readabilityChecker: failingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "readability-caps-green",
    });
    expect(result.drafts.length).toBe(1);
    const d = result.drafts[0];
    expect(d.gates.crossPersonalization.uniqueElementCount).toBeGreaterThanOrEqual(
      2,
    );
    expect(d.gates.readability.passed).toBe(false);
    expect(d.confidence).toBe("yellow");
  });

  test("readable=false issues surface in confidenceReasons", async () => {
    const failingReadability: ReadabilityChecker = async () => ({
      readable: false,
      issues: [
        "verb tense inconsistency in second sentence",
        "missing article before 'practice'",
      ],
      source: "stub",
    });
    const a: AaeAttendee = {
      attendeeId: "readability-issues-test",
      name: "Dr. Issue",
      practiceName: "Issue Endo",
      city: "Madison",
      state: "WI",
      segment: "professional_us",
      vertical: "endodontics",
      boothNotes: "asked about Garrison case",
      practiceFacts: ["uses Open Dental"],
    };
    const result = await runAaeNurture({
      mode: "dry-run",
      segmentFilter: "professional_us",
      touchNumber: 1,
      fixtureAttendees: [a],
      draftGenerator: stubGenerator,
      readabilityChecker: failingReadability,
      outputDir: tempOutputDir,
      outputBaseName: "readability-issues-surface",
    });
    expect(result.drafts.length).toBe(1);
    const d = result.drafts[0];
    const joinedReasons = d.confidenceReasons.join(" | ");
    expect(joinedReasons).toMatch(/readability gate flagged/);
    expect(joinedReasons).toMatch(/verb tense inconsistency/);
    expect(joinedReasons).toMatch(/missing article/);
  });
});
