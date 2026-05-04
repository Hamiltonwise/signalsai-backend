/**
 * Card 7 — per-query receipt composer tests (pure, no DB).
 *
 * Tests the deterministic pieces:
 *   - renderVisibilityDisplay uses mid-dot (·) separator, not em-dash
 *   - composeActionTaken composes from action_log array, action_log
 *     object, and falls back to route decision sentences
 *   - PR-005-shaped sanity: no fabricated bridge text on empty inputs
 */

import { describe, test, expect } from "vitest";

import {
  composeActionTaken,
  renderVisibilityDisplay,
} from "../../src/services/answerEngine/perQueryReceipts";

describe("renderVisibilityDisplay", () => {
  test("uses mid-dot (·) separator, never em-dash", () => {
    const out = renderVisibilityDisplay({
      googleRank: 12,
      perPlatform: [
        { platform: "google_ai_overviews", cited: true, competitor_cited: null },
        { platform: "chatgpt", cited: false, competitor_cited: null },
      ],
    });
    expect(out).toContain(" · ");
    expect(out).not.toMatch(/—/);
    expect(out).toContain("Google rank 12");
    expect(out).toContain("Cited on Google AI");
    expect(out).toContain("Not yet on ChatGPT");
  });

  test("Google rank null surfaces as 'not available'", () => {
    const out = renderVisibilityDisplay({
      googleRank: null,
      perPlatform: [],
    });
    expect(out).toContain("Google rank not available");
    expect(out).toContain("AI platforms not yet polled");
  });

  test("competitor citation is segmented from cited and not-yet groups", () => {
    const out = renderVisibilityDisplay({
      googleRank: 4,
      perPlatform: [
        { platform: "google_ai_overviews", cited: true, competitor_cited: null },
        { platform: "chatgpt", cited: false, competitor_cited: "Acme Endo" },
        { platform: "perplexity", cited: false, competitor_cited: null },
      ],
    });
    expect(out).toContain("Cited on Google AI");
    expect(out).toContain("Competitor on ChatGPT");
    expect(out).toContain("Not yet on Perplexity");
    expect(out).toContain(" · ");
  });
});

describe("composeActionTaken", () => {
  test("composes from action_log array with step + verdict", () => {
    const out = composeActionTaken({
      signalType: "gsc_impression_spike",
      actionLog: [
        { step: "research", verdict: "PASS" },
        { step: "copy", verdict: "PASS" },
        { step: "reviewer_claude", verdict: "PASS_WITH_CONCERNS" },
        { step: "deploy", verdict: "PASS" },
      ],
      routedTo: "regeneration",
      patientQuestion: "how often to clean retainers",
    });
    expect(out).toBe(
      'For "how often to clean retainers": Researched fresh content (PASS), then Drafted updated copy (PASS), then Ran Reviewer Claude (PASS_WITH_CONCERNS), then Deployed the update (PASS).',
    );
  });

  test("composes from action_log object with summary string", () => {
    const out = composeActionTaken({
      signalType: "aeo_citation_lost",
      actionLog: { summary: "Refreshed the FAQ page and re-tested AI Overviews citation." },
      routedTo: "regeneration",
      patientQuestion: "best endodontist falls church",
    });
    expect(out).toContain('For "best endodontist falls church":');
    expect(out).toContain("Refreshed the FAQ page");
  });

  test("falls back to route decision sentence when no action_log", () => {
    const out = composeActionTaken({
      signalType: "gsc_rank_delta",
      actionLog: null,
      routedTo: "regeneration",
      patientQuestion: "invisalign west orange",
    });
    expect(out).toBe(
      'Started regeneration on the page that answers "invisalign west orange".',
    );
  });

  test("watching route produces a calm watching sentence", () => {
    const out = composeActionTaken({
      signalType: "gsc_new_query",
      actionLog: null,
      routedTo: "watching",
      patientQuestion: "spark aligners cost",
    });
    expect(out).toBe('Watching "spark aligners cost". No action needed yet.');
  });

  test("noop route returns null (no fabricated text)", () => {
    const out = composeActionTaken({
      signalType: "gsc_rank_delta",
      actionLog: null,
      routedTo: "noop",
      patientQuestion: "x",
    });
    expect(out).toBeNull();
  });

  test("missing routedTo and missing action_log yields null (PR-005 safety)", () => {
    const out = composeActionTaken({
      signalType: "gsc_rank_delta",
      actionLog: null,
      routedTo: null,
      patientQuestion: "x",
    });
    expect(out).toBeNull();
  });
});
