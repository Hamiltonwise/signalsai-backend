/**
 * Card 6 Sales Agent — Prospect Scanner tests.
 *
 * Stubs Google Places, Recognition Tri-Score, the DB, and the feature
 * flag service so the scanner runs offline and deterministically.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

// ── DB stub ──────────────────────────────────────────────────────────
// In-memory tables: prospects, organizations, behavioral_events, feature_flags

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
  disqualification_reason: string | null;
  source: string;
  created_at: Date;
  updated_at: Date;
}

interface DbState {
  prospects: ProspectRow[];
  organizations: Array<{ id: number; website_url: string | null; business_data: any; deleted_at: Date | null }>;
  behavioral_events: Array<{ event_type: string; properties: any; org_id: number | null; session_id: string | null }>;
  feature_flags: Array<{ flag_name: string; is_enabled: boolean; enabled_for_orgs: string }>;
  competitor_snapshots: Array<{ id: number; website_url: string }>;
  watcher_signals: Array<{ id: string; signal_type: string; data_json: any; detected_at: Date }>;
}

const dbState: DbState = {
  prospects: [],
  organizations: [],
  behavioral_events: [],
  feature_flags: [],
  competitor_snapshots: [],
  watcher_signals: [],
};

let nextProspectId = 0;
function genUuid(): string {
  nextProspectId += 1;
  return `prospect-${nextProspectId}`;
}

function resetDb(): void {
  dbState.prospects.length = 0;
  dbState.organizations.length = 0;
  dbState.behavioral_events.length = 0;
  dbState.feature_flags.length = 0;
  dbState.competitor_snapshots.length = 0;
  dbState.watcher_signals.length = 0;
  nextProspectId = 0;
}

// Knex-ish chainable query stub. Only implements what scanner+flagger use.
function makeQuery(table: keyof DbState) {
  let rows: any[] = [...(dbState[table] as any[])];
  let inserted: any[] = [];
  let pendingInsert: any[] | null = null;
  let onConflictMode = false;
  const filters: Array<(r: any) => boolean> = [];

  const chain: any = {
    where(arg: any, op?: any, val?: any) {
      if (typeof arg === "function") {
        // Knex-style nested where callback: invoke against outer chain so
        // inner whereRaw / orWhereRaw filters layer onto the same query.
        arg.call(chain);
        return chain;
      }
      if (typeof arg === "object") {
        for (const [k, v] of Object.entries(arg)) {
          filters.push((r) => r[k] === v);
        }
      } else if (op !== undefined && val !== undefined) {
        if (op === ">=") filters.push((r) => r[arg] >= val);
        else if (op === "<") filters.push((r) => r[arg] < val);
        else if (op === ">") filters.push((r) => r[arg] > val);
        else if (op === "<=") filters.push((r) => r[arg] <= val);
        else filters.push((r) => r[arg] === val);
      } else {
        filters.push((r) => r[arg] === op);
      }
      return chain;
    },
    whereNull(col: string) {
      filters.push((r) => r[col] == null);
      return chain;
    },
    whereIn(col: string, vals: any[]) {
      filters.push((r) => vals.includes(r[col]));
      return chain;
    },
    orWhere(arg: any, op?: any, val?: any) {
      // Sub-callback inside .where(function(){...}) — for our scanner the
      // OR is "last_scanned_at IS NULL OR last_scanned_at < cutoff", which
      // we simulate as "match all rows in the candidate/flagged statuses".
      // Effectively a permissive pass — the outer whereIn still filters status.
      const last = filters[filters.length - 1];
      if (last) {
        filters[filters.length - 1] = (r) => true;
      }
      return chain;
    },
    whereRaw(_sql: string, params: any[]) {
      const needle = (params?.[0] ?? "").toString().toLowerCase().replace(/^%|%$/g, "");
      filters.push((r) => {
        const text = JSON.stringify(r).toLowerCase();
        return text.includes(needle);
      });
      return chain;
    },
    orWhereRaw(sql: string, params: any[]) {
      // Stub: both predicates in our existing-client check key on the same
      // domain, so OR collapses to the same substring match. Treat as AND
      // for simplicity (equivalent for this use case).
      return chain.whereRaw(sql, params);
    },
    orWhereNull(col: string) {
      return chain.whereNull(col);
    },
    orderBy() {
      return chain;
    },
    limit() {
      return chain;
    },
    select(..._cols: any[]) {
      return Promise.resolve(rows.filter((r) => filters.every((f) => f(r))));
    },
    first(..._cols: any[]) {
      const filtered = rows.filter((r) => filters.every((f) => f(r)));
      return Promise.resolve(filtered[0] ?? undefined);
    },
    count() {
      const c = rows.filter((r) => filters.every((f) => f(r))).length;
      return Promise.resolve([{ count: c }]);
    },
    insert(data: any | any[]) {
      const items = Array.isArray(data) ? data : [data];
      pendingInsert = items;
      return chain;
    },
    onConflict() {
      onConflictMode = true;
      return chain;
    },
    ignore() {
      // Apply pending insert with conflict-skip
      if (pendingInsert) {
        for (const item of pendingInsert) {
          const exists = (dbState[table] as any[]).find(
            (r: any) => r.url === item.url
          );
          if (!exists) {
            const row = { id: genUuid(), ...item, created_at: new Date(), updated_at: new Date() };
            (dbState[table] as any[]).push(row);
            inserted.push(row);
          }
        }
        pendingInsert = null;
      }
      return Promise.resolve(inserted);
    },
    returning(_cols: any) {
      if (pendingInsert) {
        const out = [];
        for (const item of pendingInsert) {
          const row = { id: genUuid(), ...item, created_at: new Date(), updated_at: new Date() };
          (dbState[table] as any[]).push(row);
          inserted.push(row);
          out.push(row);
        }
        pendingInsert = null;
        return Promise.resolve(out);
      }
      return Promise.resolve(inserted);
    },
    update(patch: any) {
      const target = rows.filter((r) => filters.every((f) => f(r)));
      for (const r of target) Object.assign(r, patch, { updated_at: new Date() });
      return Promise.resolve(target.length);
    },
    del() {
      const remaining = (dbState[table] as any[]).filter(
        (r: any) => !filters.every((f) => f(r))
      );
      (dbState[table] as any[]).length = 0;
      (dbState[table] as any[]).push(...remaining);
      return Promise.resolve(rows.length - remaining.length);
    },
    then(resolve: any, reject: any) {
      // If awaited without a finalizer, treat as a fetch
      const filtered = rows.filter((r) => filters.every((f) => f(r)));
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
      schema: {
        hasTable: async (t: keyof DbState) => Array.isArray(dbState[t]),
      },
      raw: () => "now()",
      fn: { now: () => new Date() },
    }
  ),
}));

// ── Behavioral event recorder ────────────────────────────────────────

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: {
    create: async (data: any) => {
      dbState.behavioral_events.push({
        event_type: data.event_type,
        properties: data.properties ?? {},
        org_id: data.org_id ?? null,
        session_id: data.session_id ?? null,
      });
      return data;
    },
  },
}));

// ── Feature flag stub ────────────────────────────────────────────────

const flagState = { live: true };
vi.mock("../../src/services/featureFlags", () => ({
  isEnabled: async (_name: string) => flagState.live,
  invalidateCache: () => {},
}));

// ── Google Places stub ───────────────────────────────────────────────

vi.mock(
  "../../src/controllers/places/feature-services/GooglePlacesApiService",
  () => ({
    isApiKeyConfigured: () => true,
    textSearch: async (query: string) => {
      // Endodontist searches return 5 candidates; existing-client is mixed in.
      if (/endodontist/i.test(query) && /Los Angeles/i.test(query)) {
        return [
          { id: "p-1", websiteUri: "https://newendo1.com", displayName: { text: "New Endo 1" } },
          { id: "p-2", websiteUri: "https://newendo2.com", displayName: { text: "New Endo 2" } },
          { id: "p-3", websiteUri: "https://newendo3.com", displayName: { text: "New Endo 3" } },
          { id: "p-4", websiteUri: "https://existingclient.com", displayName: { text: "Existing Client" } },
          { id: "p-5", websiteUri: "https://newendo4.com", displayName: { text: "New Endo 4" } },
        ];
      }
      if (/orthodontist/i.test(query) && /Los Angeles/i.test(query)) {
        return [
          { id: "p-6", websiteUri: "https://newortho1.com", displayName: { text: "New Ortho 1" } },
        ];
      }
      return [];
    },
    getPlaceDetails: async () => ({ reviews: [] }),
  })
);

// ── Recognition Tri-Score stub ───────────────────────────────────────

vi.mock("../../src/services/checkup/recognitionScorer", () => ({
  scoreRecognition: async (input: { practiceUrl: string }) => ({
    practice: {
      url: input.practiceUrl,
      pageFetched: true,
      contentChars: 1000,
      seo_score: { composite: 30, dimensions: [], repair_instructions: [], rubric_version_id: "test" },
      aeo_score: { composite: 35, dimensions: [], repair_instructions: [], rubric_version_id: "test" },
      cro_score: { composite: 40, dimensions: [], repair_instructions: [], rubric_version_id: "test" },
      seo_composite: 30,
      aeo_composite: 35,
      cro_composite: 40,
      missing_examples: [
        { phrase: "ninja accuracy", sourceReview: "...", verified: true, verificationReasoning: "..." },
      ],
      patient_quotes_not_on_site: [],
      review_count: 0,
    },
    competitors: [],
    rubric_version_id: "test",
    run_timestamp: new Date().toISOString(),
    review_data_available: false,
    warnings: [],
  }),
}));

// ── ICP config stub ──────────────────────────────────────────────────

vi.mock("../../src/services/sales/icpConfig", () => ({
  loadIcpConfig: async () => ({
    config: {
      verticals: [
        {
          vertical: "endo",
          practiceSizeRange: ["solo", "small"],
          recognitionScoreThreshold: 50,
          triggerSignals: ["recognition_score_regression"],
        },
        {
          vertical: "ortho",
          practiceSizeRange: ["solo", "small"],
          recognitionScoreThreshold: 50,
          triggerSignals: ["recognition_score_regression"],
        },
      ],
      locationScope: { metros: ["Los Angeles"], excludeMarkets: [] },
      recognitionScoreThreshold: 50,
      disqualifiers: { existingClientCheck: true, optOutDomains: [], competitorReferral: true },
      source: "fallback",
      loadedAt: new Date().toISOString(),
    },
  }),
  _resetIcpCache: () => {},
  _seedIcpCache: () => {},
  _getFallbackIcp: () => ({}),
}));

// ── Tests ────────────────────────────────────────────────────────────

describe("prospectScanner", () => {
  beforeEach(() => {
    resetDb();
    flagState.live = true;
    vi.resetModules();
  });

  test("identifies new candidates and writes them to prospects", async () => {
    // Seed an existing client so disqualifier short-circuits one of the URLs
    dbState.organizations.push({
      id: 99,
      website_url: "https://existingclient.com",
      business_data: { website: "https://existingclient.com" },
      deleted_at: null,
    });

    const { runProspectScan } = await import("../../src/services/sales/prospectScanner");
    const result = await runProspectScan({ skipFlaggerHook: true });

    expect(result.mode).toBe("live");
    expect(result.candidatesDiscovered).toBe(6); // 5 endo + 1 ortho
    // 4 endo new (one is the existing client) + 1 ortho new = 5, minus 1 disqualified = 4 inserted as new
    // Existing client got inserted as 'disqualified' status so newProspects counts only candidate-status inserts
    expect(result.newProspects).toBe(5);
    expect(result.disqualifiedCount).toBe(1);
    expect(dbState.prospects.length).toBe(6); // 5 candidates + 1 disqualified row

    const candidates = dbState.prospects.filter((p) => p.status === "candidate");
    expect(candidates.length).toBe(5);
    for (const c of candidates) {
      const tri = JSON.parse(c.recognition_tri_score as string);
      expect(tri.seo).toBe(30);
      expect(tri.aeo).toBe(35);
      expect(tri.cro).toBe(40);
      expect(tri.composite).toBe(35);
    }

    const identifiedEvents = dbState.behavioral_events.filter(
      (e) => e.event_type === "sales.prospect_identified"
    );
    expect(identifiedEvents.length).toBe(5);
  });

  test("skips existing clients via disqualifier", async () => {
    dbState.organizations.push({
      id: 1,
      website_url: "https://newendo1.com",
      business_data: {},
      deleted_at: null,
    });
    dbState.organizations.push({
      id: 2,
      website_url: "https://newendo2.com",
      business_data: {},
      deleted_at: null,
    });

    const { runProspectScan } = await import("../../src/services/sales/prospectScanner");
    const result = await runProspectScan({ skipFlaggerHook: true });

    expect(result.disqualifiedCount).toBeGreaterThanOrEqual(2);
    const candidates = dbState.prospects.filter((p) => p.status === "candidate");
    const disqualifiedUrls = dbState.prospects
      .filter((p) => p.status === "disqualified")
      .map((p) => p.url);
    expect(disqualifiedUrls).toContain("https://newendo1.com");
    expect(disqualifiedUrls).toContain("https://newendo2.com");
    for (const c of candidates) {
      expect(c.url).not.toBe("https://newendo1.com");
      expect(c.url).not.toBe("https://newendo2.com");
    }
  });

  test("shadow mode does not write prospects when flag is off", async () => {
    flagState.live = false;
    const { runProspectScan } = await import("../../src/services/sales/prospectScanner");
    const result = await runProspectScan({ skipFlaggerHook: true });

    expect(result.mode).toBe("shadow");
    expect(result.candidatesDiscovered).toBeGreaterThan(0);
    expect(dbState.prospects.length).toBe(0);
    const identified = dbState.behavioral_events.filter(
      (e) => e.event_type === "sales.prospect_identified"
    );
    expect(identified.length).toBe(0);
    // Envelope events still fire
    const completed = dbState.behavioral_events.filter(
      (e) => e.event_type === "sales.prospect_scanner_completed"
    );
    expect(completed.length).toBe(1);
  });
});

// Export the stub so the flagger test can reuse the same DB state
export { dbState, resetDb, flagState };
