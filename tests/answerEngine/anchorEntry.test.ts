/**
 * Card 6 unit tests — anchor entry handler.
 *
 * Pure mock-DB tests. The handler hits four tables (organizations,
 * vocabulary_configs, aeo_test_queries, live_activity_entries,
 * behavioral_events). All five are stubbed via a per-test in-memory
 * fixture so the test exercises the handler logic without touching the
 * real DB.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// ── In-memory fixture state ─────────────────────────────────────────

interface FakeDbState {
  organizations: Array<{ id: number; name: string }>;
  vocabulary_configs: Array<{ org_id: number; vertical: string }>;
  aeo_test_queries: Array<{ vertical: string; active: boolean }>;
  live_activity_entries: Array<{
    id: string;
    practice_id: number;
    is_anchor_entry: boolean;
    doctor_facing_text?: string;
    entry_type?: string;
    entry_data?: unknown;
  }>;
  behavioral_events: Array<{
    event_type: string;
    org_id: number;
    properties: any;
  }>;
}

let state: FakeDbState;

function resetState(): void {
  state = {
    organizations: [],
    vocabulary_configs: [],
    aeo_test_queries: [],
    live_activity_entries: [],
    behavioral_events: [],
  };
}

// ── Mock the db module ──────────────────────────────────────────────

vi.mock("../../src/database/connection", () => {
  // Each call returns a tiny query builder bound to the table name.
  function tableBuilder(table: string) {
    let whereChain: Array<(row: any) => boolean> = [];
    const builder: any = {
      where(criteriaOrCol: any, val?: any) {
        if (typeof criteriaOrCol === "object") {
          whereChain.push((row) => {
            for (const k of Object.keys(criteriaOrCol)) {
              if (row[k] !== criteriaOrCol[k]) return false;
            }
            return true;
          });
        } else {
          whereChain.push((row) => row[criteriaOrCol] === val);
        }
        return builder;
      },
      andWhere(criteriaOrCol: any, val?: any) {
        return builder.where(criteriaOrCol, val);
      },
      first(...cols: string[]) {
        const rows = (state[table as keyof FakeDbState] as any[]).filter((r) =>
          whereChain.every((p) => p(r)),
        );
        const r = rows[0];
        if (!r) return Promise.resolve(undefined);
        if (cols.length === 0) return Promise.resolve(r);
        const out: any = {};
        for (const c of cols) out[c] = r[c];
        return Promise.resolve(out);
      },
      count(_alias: string) {
        const rows = (state[table as keyof FakeDbState] as any[]).filter((r) =>
          whereChain.every((p) => p(r)),
        );
        return {
          first() {
            return Promise.resolve({ count: String(rows.length) });
          },
        };
      },
      insert(obj: any) {
        const list = state[table as keyof FakeDbState] as any[];
        const id = `fake-${list.length + 1}`;
        const row = { id, ...obj };
        list.push(row);
        return {
          returning(_cols: any) {
            return Promise.resolve([{ id }]);
          },
          catch(_fn: any) {
            return Promise.resolve();
          },
          then(fn: any) {
            return Promise.resolve(fn(undefined));
          },
        };
      },
    };
    return builder;
  }

  const dbFn: any = function (table: string) {
    return tableBuilder(table);
  };
  dbFn.raw = (s: string, _binds?: any) => s;
  dbFn.fn = { now: () => "NOW()" };
  return { db: dbFn };
});

// Mock checkVoice so we control voice-pass vs voice-fail per test.
let voiceShouldPass = true;
let voiceViolations: string[] = [];
vi.mock("../../src/services/narrator/voiceConstraints", () => ({
  checkVoice: () => ({
    passed: voiceShouldPass,
    violations: voiceViolations,
    warnings: [],
  }),
}));

import { fireAnchorEntryForPractice } from "../../src/services/liveActivity/anchorEntry";

beforeEach(() => {
  resetState();
  voiceShouldPass = true;
  voiceViolations = [];
});

// ── Tests ────────────────────────────────────────────────────────────

describe("fireAnchorEntryForPractice", () => {
  test("inserts a single anchor entry for a fresh practice with vertical-matched queries", async () => {
    state.organizations.push({ id: 5, name: "Garrison Orthodontics" });
    state.vocabulary_configs.push({ org_id: 5, vertical: "orthodontics" });
    for (let i = 0; i < 25; i++) {
      state.aeo_test_queries.push({ vertical: "orthodontics", active: true });
    }

    const result = await fireAnchorEntryForPractice(5);
    expect(result.status).toBe("inserted");
    if (result.status !== "inserted") return;
    expect(result.text).toBe(
      "Alloro began watching 25 patient questions across 6 AI platforms for Garrison Orthodontics today.",
    );
    expect(result.nQueries).toBe(25);
    expect(state.live_activity_entries.length).toBe(1);
    expect(state.live_activity_entries[0].is_anchor_entry).toBe(true);

    const inserted = state.behavioral_events.find(
      (e) => e.event_type === "anchor_entry_inserted",
    );
    expect(inserted).toBeDefined();
  });

  test("idempotent — second call returns skipped_already_exists and does not insert", async () => {
    state.organizations.push({ id: 5, name: "Garrison Orthodontics" });
    state.vocabulary_configs.push({ org_id: 5, vertical: "orthodontics" });
    for (let i = 0; i < 25; i++) {
      state.aeo_test_queries.push({ vertical: "orthodontics", active: true });
    }
    // Pre-existing anchor entry
    state.live_activity_entries.push({
      id: "preexisting-anchor-123",
      practice_id: 5,
      is_anchor_entry: true,
      doctor_facing_text: "(prior)",
    });

    const result = await fireAnchorEntryForPractice(5);
    expect(result.status).toBe("skipped_already_exists");
    if (result.status !== "skipped_already_exists") return;
    expect(result.existingEntryId).toBe("preexisting-anchor-123");
    expect(state.live_activity_entries.length).toBe(1); // no new insert
    expect(
      state.behavioral_events.find((e) => e.event_type === "anchor_entry_already_exists"),
    ).toBeDefined();
  });

  test("voice constraints fail aborts the insert and logs the failure event", async () => {
    state.organizations.push({ id: 5, name: "Garrison — Orthodontics" });
    state.vocabulary_configs.push({ org_id: 5, vertical: "orthodontics" });
    for (let i = 0; i < 25; i++) {
      state.aeo_test_queries.push({ vertical: "orthodontics", active: true });
    }
    voiceShouldPass = false;
    voiceViolations = ["em-dash present (banned per standing rule)"];

    const result = await fireAnchorEntryForPractice(5);
    expect(result.status).toBe("skipped_voice_constraints_fail");
    if (result.status !== "skipped_voice_constraints_fail") return;
    expect(result.violations.join(" ")).toMatch(/em-dash/);
    expect(state.live_activity_entries.length).toBe(0);
    expect(
      state.behavioral_events.find(
        (e) => e.event_type === "anchor_entry_voice_constraints_fail",
      ),
    ).toBeDefined();
  });

  test("missing org returns skipped_no_practice without writing", async () => {
    const result = await fireAnchorEntryForPractice(9999);
    expect(result.status).toBe("skipped_no_practice");
    expect(state.live_activity_entries.length).toBe(0);
    expect(state.behavioral_events.length).toBe(0);
  });

  test("composes honest text with N=0 when practice has no vertical seed", async () => {
    state.organizations.push({ id: 7, name: "Empty Vertical Practice" });
    state.vocabulary_configs.push({ org_id: 7, vertical: "physical_therapy" });
    // No aeo_test_queries rows for physical_therapy

    const result = await fireAnchorEntryForPractice(7);
    expect(result.status).toBe("inserted");
    if (result.status !== "inserted") return;
    expect(result.nQueries).toBe(0);
    expect(result.text).toBe(
      "Alloro began watching 0 patient questions across 6 AI platforms for Empty Vertical Practice today.",
    );
  });
});
