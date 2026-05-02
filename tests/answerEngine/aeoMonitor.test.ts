/**
 * Pure-logic tests for the AEO Monitor. These tests exercise the SerpAPI
 * citation matcher and the citation-delta classifier without DB or
 * network. The full runAeoMonitor() loop is exercised in the smoke test.
 */

import { describe, test, expect } from "vitest";
import {
  matchCitationInSerpApiOverview,
  classifyCitationDelta,
  type AeoMonitorPractice,
} from "../../src/services/answerEngine/aeoMonitor";
import type { CitationResult } from "../../src/services/answerEngine/types";

const PRACTICE: AeoMonitorPractice = {
  id: 1,
  name: "Garrison Orthodontics",
  domain: "garrisonorthodontics.com",
  city: "Memphis",
  state: "TN",
  specialty: "orthodontics",
  competitorNames: ["Memphis Smile Co", "MidSouth Orthodontics"],
};

describe("matchCitationInSerpApiOverview", () => {
  test("cited=true when source link contains practice domain", () => {
    const overview = {
      references: [
        { title: "Memphis ortho", link: "https://garrisonorthodontics.com/about" },
      ],
    };
    const r = matchCitationInSerpApiOverview(overview, PRACTICE);
    expect(r.cited).toBe(true);
    expect(r.citation_url).toContain("garrisonorthodontics.com");
    expect(r.citation_position).toBe(1);
  });

  test("cited=true when source title contains practice name", () => {
    const overview = {
      references: [
        { title: "Garrison Orthodontics Memphis", link: "https://example.com" },
      ],
    };
    const r = matchCitationInSerpApiOverview(overview, PRACTICE);
    expect(r.cited).toBe(true);
  });

  test("competitor_cited when known competitor is the only match", () => {
    const overview = {
      references: [
        { title: "Memphis Smile Co reviews", link: "https://memphissmileco.com" },
      ],
    };
    const r = matchCitationInSerpApiOverview(overview, PRACTICE);
    expect(r.cited).toBe(false);
    expect(r.competitor_cited).toBe("memphis smile co");
  });

  test("cited=false and no competitor when neither appears", () => {
    const overview = {
      references: [
        { title: "Some unrelated practice", link: "https://random-clinic.com" },
      ],
    };
    const r = matchCitationInSerpApiOverview(overview, PRACTICE);
    expect(r.cited).toBe(false);
    expect(r.competitor_cited).toBeUndefined();
  });

  test("empty references returns cited=false", () => {
    const r = matchCitationInSerpApiOverview({}, PRACTICE);
    expect(r.cited).toBe(false);
  });

  test("position is the 1-indexed order of the practice match", () => {
    const overview = {
      references: [
        { title: "Other practice A", link: "https://a.com" },
        { title: "Other practice B", link: "https://b.com" },
        { title: "Garrison", link: "https://garrisonorthodontics.com" },
      ],
    };
    const r = matchCitationInSerpApiOverview(overview, PRACTICE);
    expect(r.cited).toBe(true);
    expect(r.citation_position).toBe(3);
  });

  test("uses 'sources' alias when present instead of 'references'", () => {
    const overview = {
      sources: [{ title: "Garrison Orthodontics", link: "https://x.com" }],
    };
    const r = matchCitationInSerpApiOverview(overview, PRACTICE);
    expect(r.cited).toBe(true);
  });
});

describe("classifyCitationDelta", () => {
  function citation(
    cited: boolean,
    competitor_cited?: string,
  ): CitationResult {
    return {
      cited,
      competitor_cited,
      raw_response: {},
      latency_ms: 10,
    };
  }

  test("first-ever check with cited=true emits aeo_citation_new", () => {
    const c = classifyCitationDelta(null, citation(true));
    expect(c.signalType).toBe("aeo_citation_new");
  });

  test("first-ever check with cited=false emits no signal", () => {
    const c = classifyCitationDelta(null, citation(false));
    expect(c.signalType).toBe(null);
  });

  test("transition cited true → false emits aeo_citation_lost (action)", () => {
    const c = classifyCitationDelta(
      { cited: true, citation_url: null, competitor_cited: null },
      citation(false),
    );
    expect(c.signalType).toBe("aeo_citation_lost");
    expect(c.severity).toBe("action");
  });

  test("transition cited false → true emits aeo_citation_new", () => {
    const c = classifyCitationDelta(
      { cited: false, citation_url: null, competitor_cited: null },
      citation(true),
    );
    expect(c.signalType).toBe("aeo_citation_new");
  });

  test("competitor swap emits aeo_citation_competitor", () => {
    const c = classifyCitationDelta(
      { cited: false, citation_url: null, competitor_cited: "competitor a" },
      citation(false, "competitor b"),
    );
    expect(c.signalType).toBe("aeo_citation_competitor");
    expect(c.severity).toBe("action");
  });

  test("no change emits no signal", () => {
    const c = classifyCitationDelta(
      { cited: true, citation_url: "https://x.com", competitor_cited: null },
      citation(true),
    );
    expect(c.signalType).toBe(null);
  });

  test("same competitor cited two runs in a row does not re-fire", () => {
    const c = classifyCitationDelta(
      { cited: false, citation_url: null, competitor_cited: "competitor a" },
      citation(false, "competitor a"),
    );
    expect(c.signalType).toBe(null);
  });
});
