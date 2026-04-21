/**
 * Orchestrator tests — Manifest v2 Card 2.
 *
 * The chain (Research -> Copy -> QA -> Adapter) is exercised with the real
 * agent + stage module calls stubbed via vi.mock. This keeps the tests fast
 * and database-free while verifying control flow:
 *   - stages fire in the correct order
 *   - QA failure triggers Copy retry up to MAX_QA_RETRIES (3)
 *   - after 3 fails the orchestrator escalates a dream_team_task and halts
 *   - idempotency: duplicate trigger events are no-ops
 *   - shadow mode: non-test events are skipped when the flag is false
 *
 * Five synthetic verticals cover the harness packet (endo, ortho, PT, chiro,
 * vet). The full-chain run is timed to prove first proof under 10 minutes —
 * the fake stages resolve immediately, so this acts as a structural check on
 * the timing instrumentation, not a wall-clock benchmark.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

type StageCall = { stage: string; args: any };
const callLog: StageCall[] = [];

let copyAttempt = 0;
let qaAttempt = 0;

const orgFixtures: Record<number, any> = {};
const copyStoreByKey = new Map<string, any>();
const dreamTeamTasks: any[] = [];
const behavioralEvents: any[] = [];
const pagesByProject = new Map<string, any[]>();

vi.mock("../../src/database/connection", () => {
  const knex = () => {
    throw new Error("db() called in test without a table stub");
  };
  (knex as any).raw = (sql: string) => sql;
  (knex as any).fn = { now: () => new Date() };

  return {
    db: new Proxy(knex as any, {
      apply(_target, _thisArg, args) {
        return makeQueryBuilder(args[0]);
      },
      get(target, prop) {
        if (prop === "raw") return (sql: string) => sql;
        if (prop === "fn") return { now: () => new Date() };
        return (target as any)[prop];
      },
    }),
  };
});

function makeQueryBuilder(table: string): any {
  const state: any = { where: {}, inserts: null, updates: null };
  const builder: any = {
    where(conds: any) {
      Object.assign(state.where, conds || {});
      return builder;
    },
    whereNot() {
      return builder;
    },
    first(..._fields: any[]) {
      if (table === "organizations") {
        return Promise.resolve(orgFixtures[state.where.id] ?? null);
      }
      if (table === "copy_outputs") {
        const key = state.where.idempotency_key;
        return Promise.resolve(copyStoreByKey.get(key) ?? null);
      }
      if (table === "research_briefs") {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    },
    select() {
      return builder;
    },
    insert(data: any) {
      state.inserts = data;
      return {
        returning(_cols: any) {
          if (table === "dream_team_tasks") {
            dreamTeamTasks.push(data);
            return Promise.resolve([{ id: `task-${dreamTeamTasks.length}` }]);
          }
          if (table === "behavioral_events") {
            behavioralEvents.push(data);
            return Promise.resolve([{ id: `ev-${behavioralEvents.length}` }]);
          }
          return Promise.resolve([{ id: `row-${Math.random().toString(36).slice(2, 8)}` }]);
        },
        then(onFulfilled: any) {
          if (table === "dream_team_tasks") {
            dreamTeamTasks.push(data);
          }
          if (table === "behavioral_events") {
            behavioralEvents.push(data);
          }
          return Promise.resolve([{ id: `row-${Math.random().toString(36).slice(2, 8)}` }]).then(onFulfilled);
        },
      };
    },
    update(_data: any) {
      return Promise.resolve(1);
    },
    returning() {
      return Promise.resolve([]);
    },
  };
  return builder;
}

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: {
    create: async (payload: any) => {
      behavioralEvents.push(payload);
      return { id: `ev-${behavioralEvents.length}`, ...payload };
    },
  },
}));

vi.mock("../../src/services/patientpath/stages/research", () => ({
  runResearchStage: vi.fn(async (input: any) => {
    callLog.push({ stage: "research", args: input });
    return {
      briefId: `brief-${input.orgId}`,
      brief: {
        practiceProfile: {
          name: `Org ${input.orgId}`,
          specialty: "endodontics",
          city: "Austin",
          totalReviews: 12,
          averageRating: 4.9,
          reviewTrend: "stable",
          topThemes: [],
          competitorMap: [],
        },
        copyDirection: {
          irreplaceableThing: "The practice where anxious patients say I didn't feel a thing.",
          heroHeadline: "Gentle care, real results",
          problemStatement: "Many patients are nervous before their first visit.",
          socialProofQuotes: ["I didn't feel a thing", "They listened"],
          faqTopics: ["What to expect", "Insurance"],
          toneGuidance: "warm",
          fearCategories: ["pain", "cost"],
          praisePatterns: ["gentle", "clear"],
          practicePersonality: "warm",
        },
        confidenceLevel: "high",
      },
      durationMs: 50,
    };
  }),
}));

vi.mock("../../src/services/patientpath/stages/copy", () => ({
  runCopyStage: vi.fn(async (input: any) => {
    copyAttempt += 1;
    callLog.push({ stage: "copy", args: { attempt: copyAttempt, reused: Boolean(input.existingCopyId) } });
    const copyId = input.existingCopyId ?? `copy-${input.orgId}-${copyAttempt}`;
    const copyObj = {
      sections: [
        { name: "hero", headline: "Gentle care", body: "Real patient language here.", imagePrompt: "exterior" },
        { name: "problem", headline: "We hear you", body: "Words from reviews.", imagePrompt: "waiting" },
        { name: "doctor", headline: "Your specialist", body: "Empathy first.", imagePrompt: "headshot" },
        { name: "services", headline: "What we do", body: "Organized by fear.", imagePrompt: "room" },
        { name: "social_proof", headline: "Patients say", body: "Direct quotes.", imagePrompt: "smile" },
        { name: "faq", headline: "Questions", body: "Answers.", imagePrompt: "desk" },
        { name: "cta", headline: "Book now", body: "One action.", imagePrompt: "entrance" },
      ],
      schemaMarkup: { faqPage: "{}", localBusiness: "{}" },
    };
    copyStoreByKey.set(input.idempotencyKey, {
      id: copyId,
      org_id: input.orgId,
      copy_json: copyObj,
      status: "pending",
    });
    return {
      copyId,
      copy: copyObj,
      durationMs: 20,
      reused: Boolean(input.existingCopyId),
    };
  }),
}));

let qaPassPattern: boolean[] = [];

vi.mock("../../src/services/patientpath/stages/qa", () => ({
  runQaStage: vi.fn(async (input: any) => {
    qaAttempt += 1;
    const pass = qaPassPattern[qaAttempt - 1] ?? true;
    callLog.push({ stage: "qa", args: { attempt: qaAttempt, passed: pass } });
    const rec = copyStoreByKey.get([...copyStoreByKey.keys()].find((k) => copyStoreByKey.get(k).id === input.copyId) ?? "");
    if (rec) {
      rec.status = pass ? "qa_passed" : "qa_failed";
    }
    return {
      passed: pass,
      report: {
        projectId: "pid",
        pagePath: "/",
        passed: pass,
        gates: [],
        defects: pass ? [] : [{ gate: "bannedPhrase", severity: "blocker", message: "example", evidence: {} }],
        ranAt: new Date().toISOString(),
      },
      durationMs: 10,
    };
  }),
}));

vi.mock("../../src/services/patientpath/stages/adapter", () => ({
  runAdapterStage: vi.fn(async (input: any) => {
    callLog.push({ stage: "adapter", args: { copyId: input.copyId } });
    const projectId = `proj-${input.orgId}`;
    const pages = Array.isArray(input.copy?.sections) ? input.copy.sections : [];
    const existing = pagesByProject.get(projectId);
    if (existing) {
      return {
        projectId,
        pageIds: existing.map((p: any) => p.id),
        siteUrl: `https://alloro-org-${input.orgId}.alloro.site`,
        pageCount: existing.length,
        reused: true,
        durationMs: 15,
      };
    }
    const pageRows = pages.map((_: any, i: number) => ({ id: `page-${input.orgId}-${i}` }));
    pagesByProject.set(projectId, pageRows);
    return {
      projectId,
      pageIds: pageRows.map((p) => p.id),
      siteUrl: `https://alloro-org-${input.orgId}.alloro.site`,
      pageCount: pageRows.length,
      reused: false,
      durationMs: 15,
    };
  }),
}));

import { runBuildOrchestrator, MAX_QA_RETRIES } from "../../src/services/patientpath/orchestrator";

beforeEach(() => {
  callLog.length = 0;
  copyAttempt = 0;
  qaAttempt = 0;
  copyStoreByKey.clear();
  dreamTeamTasks.length = 0;
  behavioralEvents.length = 0;
  pagesByProject.clear();
  for (const k of Object.keys(orgFixtures)) delete orgFixtures[Number(k)];
  qaPassPattern = [];
});

const SYNTHETIC_ORGS = [
  { id: 1001, name: "Austin Endodontics", specialty: "endodontics", flag: true },
  { id: 1002, name: "Sunrise Orthodontics", specialty: "orthodontics", flag: true },
  { id: 1003, name: "Bayside Physical Therapy", specialty: "physical therapy", flag: true },
  { id: 1004, name: "Ridgeline Chiropractic", specialty: "chiropractic", flag: true },
  { id: 1005, name: "Companion Vet", specialty: "veterinary", flag: true },
];

function registerOrg(org: { id: number; name: string; flag: boolean }) {
  orgFixtures[org.id] = {
    id: org.id,
    name: org.name,
    patientpath_build_enabled: org.flag,
  };
}

describe("runBuildOrchestrator — full chain", () => {
  test("runs Research -> Copy -> QA -> Adapter in order on the golden path", async () => {
    const org = SYNTHETIC_ORGS[0];
    registerOrg(org);
    qaPassPattern = [true];

    const result = await runBuildOrchestrator({
      orgId: org.id,
      triggerEventId: "gold-path-1",
    });

    expect(result.status).toBe("completed");
    expect(callLog.map((c) => c.stage)).toEqual(["research", "copy", "qa", "adapter"]);
    expect(result.stages.research).toBeDefined();
    expect(result.stages.copy).toBeDefined();
    expect(result.stages.qa?.attempts).toBe(1);
    expect(result.stages.qa?.passed).toBe(true);
    expect(result.stages.adapter).toBeDefined();
  });

  test("total duration instrumentation is under 10 minutes on the golden path", async () => {
    const org = SYNTHETIC_ORGS[1];
    registerOrg(org);
    qaPassPattern = [true];

    const result = await runBuildOrchestrator({
      orgId: org.id,
      triggerEventId: "gold-path-2",
    });

    expect(result.totalMs).toBeLessThan(10 * 60 * 1000);
  });

  test("runs cleanly across 5 synthetic verticals (vertical-agnosticism)", async () => {
    const results: any[] = [];
    for (const org of SYNTHETIC_ORGS) {
      registerOrg(org);
      qaPassPattern = [true];
      callLog.length = 0;
      copyAttempt = 0;
      qaAttempt = 0;
      const r = await runBuildOrchestrator({
        orgId: org.id,
        triggerEventId: `vertical-${org.id}`,
      });
      results.push(r);
    }
    expect(results.every((r) => r.status === "completed")).toBe(true);
  });
});

describe("runBuildOrchestrator — QA retry", () => {
  test("retries Copy when QA fails; succeeds before the limit", async () => {
    const org = SYNTHETIC_ORGS[0];
    registerOrg(org);
    qaPassPattern = [false, false, true];

    const result = await runBuildOrchestrator({
      orgId: org.id,
      triggerEventId: "retry-until-pass",
    });

    expect(result.status).toBe("completed");
    expect(result.stages.qa?.attempts).toBe(3);
    const stageOrder = callLog.map((c) => c.stage);
    expect(stageOrder[0]).toBe("research");
    expect(stageOrder.filter((s) => s === "copy").length).toBe(3);
    expect(stageOrder.filter((s) => s === "qa").length).toBe(3);
    expect(stageOrder[stageOrder.length - 1]).toBe("adapter");
  });

  test("escalates to dream_team_task after 3 failing QA attempts and halts", async () => {
    const org = SYNTHETIC_ORGS[2];
    registerOrg(org);
    qaPassPattern = [false, false, false];

    const result = await runBuildOrchestrator({
      orgId: org.id,
      triggerEventId: "qa-escalate",
    });

    expect(result.status).toBe("qa_escalated");
    expect(result.stages.qa?.attempts).toBe(MAX_QA_RETRIES);
    expect(result.stages.adapter).toBeUndefined();
    expect(dreamTeamTasks.length).toBe(1);
    expect(dreamTeamTasks[0].source_type).toBe("patientpath_copy_failed");
  });
});

describe("runBuildOrchestrator — idempotency", () => {
  test("firing the same event twice produces exactly one adapter call the second time (reused project)", async () => {
    const org = SYNTHETIC_ORGS[3];
    registerOrg(org);
    qaPassPattern = [true];

    const key = "idem-same-1";
    const first = await runBuildOrchestrator({ orgId: org.id, triggerEventId: key });
    expect(first.status).toBe("completed");

    callLog.length = 0;
    copyAttempt = 0;
    qaAttempt = 0;
    qaPassPattern = [];

    const second = await runBuildOrchestrator({ orgId: org.id, triggerEventId: key });
    expect(second.status).toBe("duplicate_noop");
    expect(callLog.every((c) => c.stage === "adapter")).toBe(true);
    expect(callLog.length).toBe(1);
  });
});

describe("runBuildOrchestrator — shadow mode", () => {
  test("skips live events when patientpath_build_enabled=false", async () => {
    const org = { id: 1099, name: "Shadow Org", flag: false };
    registerOrg(org as any);

    const result = await runBuildOrchestrator({
      orgId: org.id,
      triggerEventId: "live-under-shadow",
    });

    expect(result.status).toBe("shadow_skipped");
    expect(callLog.length).toBe(0);
  });

  test("runs test events even when patientpath_build_enabled=false", async () => {
    const org = { id: 1100, name: "Shadow Test Org", flag: false };
    registerOrg(org as any);
    qaPassPattern = [true];

    const result = await runBuildOrchestrator({
      orgId: org.id,
      triggerEventId: "test-under-shadow",
      testMode: true,
    });

    expect(result.status).toBe("completed");
    expect(callLog.map((c) => c.stage)).toEqual(["research", "copy", "qa", "adapter"]);
  });
});

describe("runBuildOrchestrator — error handling", () => {
  test("missing org resolves to failed status with a descriptive error", async () => {
    const result = await runBuildOrchestrator({
      orgId: 99999,
      triggerEventId: "missing-org",
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/not found/);
  });
});
