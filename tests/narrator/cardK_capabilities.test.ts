/**
 * Card K — Vertical Capability Model tests.
 *
 * (a) Non-healthcare org with capabilities.referral_tracking = false:
 *     gp.gone_dark emits 'narrator.event_suppressed' and no narrator output.
 * (b) churn.silent_quitter_risk routes to churnRisk for both healthcare
 *     and non-healthcare orgs; output contains zero GP/patient/referral language.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

interface DbMockState {
  vocabConfig: Record<number, { capabilities: unknown }>;
  narratorOutputsInserted: Array<Record<string, unknown>>;
  behavioralEvents: Array<Record<string, unknown>>;
}

const dbState: DbMockState = {
  vocabConfig: {},
  narratorOutputsInserted: [],
  behavioralEvents: [],
};

function buildChain(table: string): any {
  const chain: any = {
    _where: {} as Record<string, unknown>,
    where(criteria: Record<string, unknown>) {
      chain._where = { ...chain._where, ...criteria };
      return chain;
    },
    async first() {
      if (table === "vocabulary_configs") {
        const orgId = chain._where.org_id as number | undefined;
        if (orgId != null && dbState.vocabConfig[orgId]) {
          return dbState.vocabConfig[orgId];
        }
        return undefined;
      }
      if (table === "organizations") {
        const id = chain._where.id as number | undefined;
        if (id == null) return undefined;
        return { id, name: `Org ${id}`, narrator_enabled: false };
      }
      return undefined;
    },
    insert(row: Record<string, unknown>) {
      const payload = Array.isArray(row) ? row[0] : row;
      if (table === "narrator_outputs") {
        dbState.narratorOutputsInserted.push(payload as Record<string, unknown>);
      }
      if (table === "behavioral_events") {
        dbState.behavioralEvents.push(payload as Record<string, unknown>);
      }
      return {
        returning: async () => [{ id: `mock-id-${Date.now()}` }],
      };
    },
  };
  return chain;
}

vi.mock("../../src/database/connection", () => {
  const db: any = (table: string) => buildChain(table);
  db.raw = (s: string) => s;
  db.fn = { now: () => new Date() };
  return { db };
});

vi.mock("../../src/services/behavioralIntelligence", () => ({
  updateEngagementScoreAsync: vi.fn(),
}));

// Redis is used by vocabLoader for cache. Stub it with a no-op client so the
// loader always reads straight from our mocked DB.
vi.mock("../../src/services/redis", () => ({
  getSharedRedis: () => ({
    get: async () => null,
    set: async () => "OK",
    del: async () => 0,
  }),
}));

vi.mock("../../src/services/siteQa/gates/freeformConcernGate", () => ({
  runFreeformConcernGate: async () => ({
    blocked: false,
    passed: true,
    score: { composite: 90, rubric_version_id: "noop" },
    repairInstructions: [],
  }),
}));

describe("Card K — narrator capability gate", () => {
  beforeEach(() => {
    dbState.vocabConfig = {};
    dbState.narratorOutputsInserted = [];
    dbState.behavioralEvents = [];
  });

  test("(a) non-healthcare org: gp.gone_dark is suppressed and emits narrator.event_suppressed", async () => {
    dbState.vocabConfig[101] = {
      capabilities: {
        referral_tracking: false,
        gp_network: false,
        hipaa_mode: false,
      },
    };

    const { processNarratorEvent } = await import(
      "../../src/services/narrator/narratorService"
    );

    const result = await processNarratorEvent({
      id: "evt-test-a",
      eventType: "gp.gone_dark",
      orgId: 101,
      properties: { gpName: "Dr. Patel", daysSilent: 75 },
      createdAt: new Date(),
    });

    expect(result.mode).toBe("suppressed");
    expect(result.suppressed).toBe(true);
    expect(result.suppressionReason).toBe("referral_tracking_disabled");
    // Owner-facing output was not produced: emit false, template marker.
    expect(result.output.emit).toBe(false);
    expect(result.output.template).toBe("_capability_suppressed");
    // No narrator_outputs row was archived.
    expect(dbState.narratorOutputsInserted.length).toBe(0);

    // Exactly one narrator.event_suppressed event was written.
    const suppressed = dbState.behavioralEvents.filter(
      (e) => e.event_type === "narrator.event_suppressed"
    );
    expect(suppressed.length).toBe(1);
    const props = JSON.parse(suppressed[0].properties as string);
    expect(props).toMatchObject({
      eventType: "gp.gone_dark",
      orgId: 101,
      reason: "referral_tracking_disabled",
    });
  });

  test("(b) churn.silent_quitter_risk uses churnRisk template for both verticals and contains no GP/patient/referral language", async () => {
    // Healthcare: default capabilities (referral_tracking = true).
    dbState.vocabConfig[201] = {
      capabilities: {
        referral_tracking: true,
        gp_network: true,
        hipaa_mode: true,
      },
    };
    // Non-healthcare: all capabilities off.
    dbState.vocabConfig[202] = {
      capabilities: {
        referral_tracking: false,
        gp_network: false,
        hipaa_mode: false,
      },
    };

    const { processNarratorEvent } = await import(
      "../../src/services/narrator/narratorService"
    );

    const healthcare = await processNarratorEvent({
      id: "evt-churn-hc",
      eventType: "churn.silent_quitter_risk",
      orgId: 201,
      properties: { loginDrop: true, emailHeld: false },
      createdAt: new Date(),
    });

    const nonHealthcare = await processNarratorEvent({
      id: "evt-churn-non",
      eventType: "churn.silent_quitter_risk",
      orgId: 202,
      properties: { loginDrop: true, emailHeld: false },
      createdAt: new Date(),
    });

    for (const result of [healthcare, nonHealthcare]) {
      expect(result.output.template).toBe("churnRisk");
      expect(result.mode).not.toBe("suppressed");
      const rendered = [
        result.output.finding,
        result.output.action,
        result.output.dollar ?? "",
      ]
        .join(" ")
        .toLowerCase();
      expect(rendered).not.toMatch(/\bgp\b/);
      expect(rendered).not.toMatch(/\bpatient\b/);
      expect(rendered).not.toMatch(/\breferral\b/);
      expect(rendered).not.toMatch(/\breferring\b/);
    }
  });
});
