/**
 * Card 5 — AI Visibility module copy validation.
 *
 * The three approved Card 5 strings must pass the Voice Constraints
 * checker (Brand Voice + Em-Dash combined per AR-002). This is the
 * gate the playlist's Standing Approvals reference: if a Card 5 string
 * flags Voice Constraints, the build halts and reports rather than
 * silently rewriting an approved string.
 */

import { describe, test, expect } from "vitest";
import { checkVoice } from "../../src/services/narrator/voiceConstraints";

const HEADER_TEMPLATE_25 =
  "Alloro is watching 25 patient questions across 6 AI platforms for your practice. Each is a moment a patient could find you. Green: AI Overviews cite you. Amber: a competitor is cited. Gray: Alloro is on it.";

const COUNTER_LABELS = ["Cited", "Competitor up", "Alloro on it"];

const GRAY_CELL_TOOLTIP =
  "Alloro is improving your site to compound this signal. When there's something specific worth your attention, you'll see it here.";

describe("Card 5 strings pass Voice Constraints", () => {
  test("module header (rendered with N=25) passes Brand Voice + Em-Dash gates", () => {
    const r = checkVoice(HEADER_TEMPLATE_25);
    if (!r.passed) {
      throw new Error(
        `Voice Constraints flagged the approved Card 5 header: ${r.violations.join("; ")}`,
      );
    }
    expect(r.passed).toBe(true);
    expect(r.violations).toEqual([]);
  });

  test("each counter label passes Voice Constraints", () => {
    for (const label of COUNTER_LABELS) {
      const r = checkVoice(label);
      expect(r.passed, `counter label "${label}" violations: ${r.violations.join("; ")}`).toBe(
        true,
      );
    }
  });

  test("gray-cell tooltip passes Voice Constraints", () => {
    const r = checkVoice(GRAY_CELL_TOOLTIP);
    if (!r.passed) {
      throw new Error(
        `Voice Constraints flagged the approved Card 5 tooltip: ${r.violations.join("; ")}`,
      );
    }
    expect(r.passed).toBe(true);
  });

  test("no em-dashes in any Card 5 string", () => {
    const all = [HEADER_TEMPLATE_25, ...COUNTER_LABELS, GRAY_CELL_TOOLTIP].join("\n");
    expect(all).not.toMatch(/—/);
  });

  test("no banned phrases (sanity sweep)", () => {
    const all = [HEADER_TEMPLATE_25, ...COUNTER_LABELS, GRAY_CELL_TOOLTIP].join(" ");
    const banned = [
      /\bworld-class\b/i,
      /\bcutting-edge\b/i,
      /\bstate-of-the-art\b/i,
      /\bgame-changing\b/i,
      /\brevolutionary\b/i,
      /\bindustry-leading\b/i,
      /\bturnkey\b/i,
      /\bsynergy\b/i,
      /\bsupercharge\b/i,
      /\belevate\b/i,
      /\bleverage\b/i,
      /\bunlock\b/i,
      /\bbest-in-class\b/i,
    ];
    for (const re of banned) {
      expect(all, `banned phrase ${re.source} detected`).not.toMatch(re);
    }
  });
});
