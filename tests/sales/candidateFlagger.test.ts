/**
 * Card 6 Sales Agent — Candidate Flagger tests.
 *
 * Covers:
 *   - Flagger applies score-threshold + trigger-signal rule (regression
 *     in triggerSignals satisfies the signal requirement on score-changed
 *     path; cold-identified path still requires an external signal).
 *   - Self-serve checkup integration inserts as warm prospect AND flags
 *     immediately, regardless of Tri-Score threshold.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

// In-memory DB shared across tests in this file.
interface ProspectRow {
  id: string;
  url: string;
  vertical: string;
  location: string | null;
  status: string;
  recognition_tri_score: any;
  missing_examples: any;
  identified_at: Date;
  last_scanned_at: Date | null;
  flagged_at: Date | null;
  source: string;
  created_at: Date;
  updated_at: Date;
}

interface DbState {
  prospects: ProspectRow[];
  behavioral_events: Array<{ event_type: string; properties: any }>;
  watcher_signals: Array<{ id: string; signal_type: string; data_json: any; detected_at: Date }>;
}

const dbState: DbState = { prospects: [], behavioral_events: [], watcher_signals: [] };

let nextId = 0;
function genUuid(): string {
  nextId += 1;
  return `prospect-${nextId}`;
}

function reset(): void {
  dbState.prospects.length = 0;
  dbState.behavioral_events.length = 0;
  dbState.watcher_signals.length = 0;
  nextId = 0;
}

function makeQuery(table: keyof DbState) {
  let pendingInsert: any[] | null = null;
  const filters: Array<(r: any) => boolean> = [];
  const inserted: any[] = [];

  const chain: any = {
    where(arg: any, op?: any, val?: any) {
      if (typeof arg === "object") {
        for (const [k, v] of Object.entries(arg)) filters.push((r) => r[k] === v);
      } else if (op !== undefined && val !== undefined) {
        if (op === ">=") filters.push((r) => r[arg] >= val);
        else if (op === "<") filters.push((r) => r[arg] < val);
        else filters.push((r) => r[arg] === val);
      } else {
        filters.push((r) => r[arg] === op);
      }
      return chain;
    },
    whereIn(col: string, vals: any[]) {
      filters.push((r) => vals.includes(r[col]));
      return chain;
    },
    whereNull(col: string) {
      filters.push((r) => r[col] == null);
      return chain;
    },
    whereRaw(_sql: string, params: any[]) {
      const needle = (params?.[0] ?? "").toString().toLowerCase().replace(/^%|%$/g, "");
      filters.push((r) => JSON.stringify(r).toLowerCase().includes(needle));
      return chain;
    },
    first(..._cols: any[]) {
      const filtered = (dbState[table] as any[]).filter((r) => filters.every((f) => f(r)));
      return Promise.resolve(filtered[0] ?? undefined);
    },
    insert(data: any | any[]) {
      pendingInsert = Array.isArray(data) ? data : [data];
      return chain;
    },
    returning(_cols: any) {
      const out: any[] = [];
      if (pendingInsert) {
        for (const item of pendingInsert) {
          const row = { id: genUuid(), ...item, created_at: new Date(), updated_at: new Date() };
          (dbState[table] as any[]).push(row);
          out.push(row);
          inserted.push(row);
        }
        pendingInsert = null;
      }
      return Promise.resolve(out);
    },
    update(patch: any) {
      const target = (dbState[table] as any[]).filter((r) => filters.every((f) => f(r)));
      for (const r of target) Object.assign(r, patch, { updated_at: new Date() });
      return Promise.resolve(target.length);
    },
    select(..._cols: any[]) {
      const filtered = (dbState[table] as any[]).filter((r) => filters.every((f) => f(r)));
      return Promise.resolve(filtered);
    },
    then(resolve: any, reject: any) {
      const filtered = (dbState[table] as any[]).filter((r) => filters.every((f) => f(r)));
      Promise.resolve(filtered).then(resolve, reject);
      return chain;
    },
  };
  return chain;
}

vi.mock("../../src/database/connection", () => ({
  db: Object.assign(
    (table: keyof DbState) => makeQuery(table),
    {
      schema: { hasTable: async (t: keyof DbState) => Array.isArray(dbState[t]) },
      raw: () => "now()",
      fn: { now: () => new Date() },
    }
  ),
}));

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: {
    create: async (data: any) => {
      dbState.behavioral_events.push({ event_type: data.event_type, properties: data.properties ?? {} });
      return data;
    },
  },
}));

const flagState = { live: true };
vi.mock("../../src/services/featureFlags", () => ({
  isEnabled: async () => flagState.live,
  invalidateCache: () => {},
}));

vi.mock("../../src/services/sales/icpConfig", () => ({
  loadIcpConfig: async () => ({
    config: {
      verticals: [
        {
          vertical: "endo",
          practiceSizeRange: ["solo"],
          recognitionScoreThreshold: 50,
          triggerSignals: ["recognition_score_regression"],
        },
        {
          vertical: "ortho",
          practiceSizeRange: ["solo"],
          recognitionScoreThreshold: 50,
          triggerSignals: ["competitor_activity"], // does NOT include regression
        },
      ],
      locationScope: { metros: ["LA"], excludeMarkets: [] },
      recognitionScoreThreshold: 50,
      disqualifiers: { existingClientCheck: false, optOutDomains: [], competitorReferral: false },
      source: "fallback",
      loadedAt: new Date().toISOString(),
    },
  }),
  _resetIcpCache: () => {},
  _seedIcpCache: () => {},
}));

describe("candidateFlagger", () => {
  beforeEach(() => {
    reset();
    flagState.live = true;
    vi.resetModules();
  });

  test("score-changed path: regression-as-signal vertical promotes to flagged when score is below threshold", async () => {
    const prospect: ProspectRow = {
      id: "p-endo-1",
      url: "https://endo-prospect.com",
      vertical: "endo",
      location: "LA",
      status: "candidate",
      recognition_tri_score: JSON.stringify({ seo: 60, aeo: 60, cro: 60, composite: 60 }),
      missing_examples: JSON.stringify([]),
      identified_at: new Date(),
      last_scanned_at: new Date(),
      flagged_at: null,
      source: "watcher_scan",
      created_at: new Date(),
      updated_at: new Date(),
    };
    dbState.prospects.push(prospect);

    const { runFlaggerOnScoreChanged } = await import("../../src/services/sales/candidateFlagger");
    const outcome = await runFlaggerOnScoreChanged({
      prospectId: "p-endo-1",
      url: "https://endo-prospect.com",
      vertical: "endo",
      triScore: { seo: 30, aeo: 35, cro: 40, composite: 35 },
    });

    expect(outcome.result).toBe("flagged");
    expect(outcome.reason).toBe("score_change_threshold_match");
    const updated = dbState.prospects.find((p) => p.id === "p-endo-1");
    expect(updated?.status).toBe("flagged");
    const flaggedEvents = dbState.behavioral_events.filter(
      (e) => e.event_type === "sales.prospect_flagged_for_outreach"
    );
    expect(flaggedEvents.length).toBe(1);
  });

  test("identified path: skipped when score above threshold", async () => {
    const { runFlaggerOnIdentified } = await import("../../src/services/sales/candidateFlagger");
    const outcome = await runFlaggerOnIdentified({
      prospectId: "p-endo-2",
      url: "https://strong-endo.com",
      vertical: "endo",
      triScore: { seo: 70, aeo: 75, cro: 80, composite: 75 },
      source: "watcher_scan",
    });
    expect(outcome.result).toBe("skipped");
    expect(outcome.reason).toBe("score_above_threshold");
  });

  test("identified path: skipped when no recent trigger signal even if score is below threshold", async () => {
    // Ortho rule does NOT include recognition_score_regression in triggerSignals
    // and there is no watcher_signal for the URL.
    const { runFlaggerOnIdentified } = await import("../../src/services/sales/candidateFlagger");
    const outcome = await runFlaggerOnIdentified({
      prospectId: "p-ortho-1",
      url: "https://weak-ortho.com",
      vertical: "ortho",
      triScore: { seo: 30, aeo: 30, cro: 30, composite: 30 },
      source: "watcher_scan",
    });
    expect(outcome.result).toBe("skipped");
    expect(outcome.reason).toBe("no_recent_trigger_signal");
  });

  test("checkup-integration: inserts warm prospect AND flags it regardless of score", async () => {
    const { runFlaggerOnCheckupCompleted } = await import("../../src/services/sales/candidateFlagger");
    const outcome = await runFlaggerOnCheckupCompleted({
      url: "https://warm-prospect.com",
      vertical: "endo",
      location: "Phoenix",
      triScore: { seo: 80, aeo: 85, cro: 90, composite: 85 }, // above threshold!
    });

    expect(outcome.result).toBe("flagged");
    expect(outcome.reason).toBe("checkup_self_serve_intent");

    const inserted = dbState.prospects.find((p) => p.url === "https://warm-prospect.com");
    expect(inserted).toBeDefined();
    expect(inserted?.source).toBe("checkup_self_serve");
    expect(inserted?.status).toBe("flagged");

    const identified = dbState.behavioral_events.filter(
      (e) => e.event_type === "sales.prospect_identified"
    );
    expect(identified.length).toBe(1);
    expect(identified[0].properties.source).toBe("checkup_self_serve");
    const flagged = dbState.behavioral_events.filter(
      (e) => e.event_type === "sales.prospect_flagged_for_outreach"
    );
    expect(flagged.length).toBe(1);
  });
});
