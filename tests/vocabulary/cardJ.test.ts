/**
 * Card J — Vertical Vocabulary Plumbing tests.
 *
 * Covers the five Done Gate requirements:
 *   (a) getVocab returns healthcare defaults for an unknown orgId.
 *   (b) A Narrator template for a non-healthcare org uses "clients",
 *       not "patients", in its rendered output.
 *   (c) Discoverability Bake for a non-healthcare org emits a LegalService
 *       schema and never the Dentist schema.
 *   (d) recognitionScorer's aboutCandidates for a non-healthcare org does
 *       not include /meet-the-doctor.
 *   (e) /about-dr-olson appears nowhere in the codebase (grep assertion).
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

// ─── DB + Redis mocks ──────────────────────────────────────────────────

interface VocabRow {
  overrides: Record<string, unknown>;
  capabilities: Record<string, unknown>;
}
const vocabDb: Record<number, VocabRow> = {};

vi.mock("../../src/database/connection", () => {
  const chain: any = (table: string) => {
    const state: any = { _where: {} as Record<string, unknown> };
    const q: any = {
      where(criteria: Record<string, unknown>) {
        state._where = { ...state._where, ...criteria };
        return q;
      },
      async first() {
        if (table === "vocabulary_configs") {
          const orgId = state._where.org_id as number | undefined;
          if (orgId != null && vocabDb[orgId]) {
            return vocabDb[orgId];
          }
          return undefined;
        }
        if (table === "organizations") {
          const id = state._where.id as number | undefined;
          if (id == null) return undefined;
          return { id, name: `Org ${id}`, narrator_enabled: false };
        }
        return undefined;
      },
    };
    return q;
  };
  const db: any = chain;
  db.raw = (s: string) => s;
  db.fn = { now: () => new Date() };
  return { db, default: db };
});

vi.mock("../../src/services/redis.ts", () => {
  // Deliberate no-op: every operation fails so the loader falls through to DB.
  const noRedis = {
    async get() {
      throw new Error("redis unavailable in test");
    },
    async set() {
      throw new Error("redis unavailable in test");
    },
    async del() {
      throw new Error("redis unavailable in test");
    },
  };
  return { getSharedRedis: () => noRedis };
});

vi.mock("../../src/services/siteQa/gates/freeformConcernGate", () => ({
  runFreeformConcernGate: async () => ({
    blocked: false,
    passed: true,
    score: { composite: 90, rubric_version_id: "noop" },
    repairInstructions: [],
  }),
}));

// ─── Imports after mocks ──────────────────────────────────────────────

import {
  getVocab,
  HEALTHCARE_DEFAULT_VOCAB,
} from "../../src/services/vocabulary/vocabLoader";
import { referralSignalTemplate } from "../../src/services/narrator/templates/referralSignal";
import {
  buildLocalBusinessSchema,
  buildDentistSchema,
} from "../../src/services/patientpath/stages/discoverabilityBake.templates";
import { getAboutCandidates } from "../../src/services/checkup/recognitionScorer";
import type { TemplateContext } from "../../src/services/narrator/types";

const LEGAL_ORG_ID = 202;
const LEGAL_VOCAB = {
  customerTerm: "client",
  customerTermPlural: "clients",
  providerTerm: "practitioner",
  identitySection: "practitioner_story",
  schemaSubType: "LegalService",
  referralSourceTerm: "referring attorney",
};

const LEGAL_CAPS = {
  referral_tracking: true,
  gp_network: false,
  hipaa_mode: false,
};

function seedLegalOrg() {
  vocabDb[LEGAL_ORG_ID] = {
    overrides: LEGAL_VOCAB,
    capabilities: LEGAL_CAPS,
  };
}

function mkCtx(
  eventType: string,
  orgId: number,
  properties: Record<string, unknown> = {}
): TemplateContext {
  return {
    event: { id: `evt-${eventType}`, eventType, orgId, properties, createdAt: new Date() },
    org: {
      id: orgId,
      name: `Org ${orgId}`,
      vertical: null,
      createdAt: new Date(Date.now() - 365 * 86400000),
      hasGbpData: false,
      hasCheckupData: false,
      knownAverageCaseValueUsd: null,
      knownMonthlyNewCustomers: null,
    } as any,
    nowIso: new Date().toISOString(),
  };
}

beforeEach(() => {
  for (const key of Object.keys(vocabDb)) delete vocabDb[Number(key)];
  process.env.FREEFORM_CONCERN_GATE_ENABLED = "false";
});

// ─── (a) getVocab defaults ────────────────────────────────────────────

describe("(a) getVocab returns healthcare defaults for unknown orgId", () => {
  test("unknown orgId → full healthcare default", async () => {
    const vocab = await getVocab(99999);
    expect(vocab).toEqual({
      customerTerm: HEALTHCARE_DEFAULT_VOCAB.customerTerm,
      customerTermPlural: HEALTHCARE_DEFAULT_VOCAB.customerTermPlural,
      providerTerm: HEALTHCARE_DEFAULT_VOCAB.providerTerm,
      identitySection: HEALTHCARE_DEFAULT_VOCAB.identitySection,
      schemaSubType: HEALTHCARE_DEFAULT_VOCAB.schemaSubType,
      referralSourceTerm: HEALTHCARE_DEFAULT_VOCAB.referralSourceTerm,
      capabilities: { ...HEALTHCARE_DEFAULT_VOCAB.capabilities },
    });
    expect(vocab.schemaSubType).toBe("Dentist");
    expect(vocab.capabilities.hipaa_mode).toBe(true);
  });

  test("null/undefined orgId → defaults without touching DB", async () => {
    const a = await getVocab(null);
    const b = await getVocab(undefined);
    expect(a.customerTermPlural).toBe("patients");
    expect(b.customerTermPlural).toBe("patients");
  });
});

// ─── (b) Narrator template uses "clients" not "patients" ──────────────

describe("(b) Narrator template for non-healthcare org uses 'clients' not 'patients'", () => {
  test("referralSignal positive for legal org says 'clients'", async () => {
    seedLegalOrg();
    const ctx = mkCtx("referral.positive_signal", LEGAL_ORG_ID, {
      gpName: "Smith & Partners",
      referralCount: 3,
    });
    const out = await referralSignalTemplate(ctx);
    const rendered = `${out.finding} ${out.action}`.toLowerCase();
    expect(rendered).toContain("clients");
    expect(rendered).not.toContain("patients");
  });
});

// ─── (c) Discoverability Bake emits LegalService not Dentist ──────────

describe("(c) Discoverability Bake emits LegalService schema for non-healthcare org", () => {
  const fakeTemplates: any = {
    source: "fallback",
    versionId: "test",
    faqByPageType: {},
    internalLinkAnchors: {},
    ctaBySection: {},
    schemaTypeBySpecialty: {
      default: ["LocalBusiness", "MedicalBusiness"],
      dentist: ["LocalBusiness", "Dentist", "MedicalBusiness"],
    },
  };

  const legalPractice: any = {
    name: "Martinez Law Group",
    specialty: "Family Law",
    websiteUrl: "https://martinezlaw.test",
  };

  test("LegalService schemaSubType → @type includes LegalService, excludes Dentist", () => {
    const schema = buildLocalBusinessSchema(
      "LegalService",
      legalPractice,
      fakeTemplates,
      []
    );
    const type = schema["@type"];
    const typeList = Array.isArray(type) ? type : [type];
    expect(typeList).toContain("LegalService");
    expect(typeList).not.toContain("Dentist");
  });

  test("buildDentistSchema back-compat path still emits Dentist for healthcare", () => {
    const schema = buildDentistSchema(
      { name: "Acme Endo", specialty: "dentist", websiteUrl: "https://acme.test" } as any,
      fakeTemplates,
      []
    );
    const type = schema["@type"];
    const typeList = Array.isArray(type) ? type : [type];
    expect(typeList).toContain("Dentist");
  });
});

// ─── (d) aboutCandidates for non-healthcare excludes /meet-the-doctor ─

describe("(d) recognitionScorer aboutCandidates for non-healthcare excludes /meet-the-doctor", () => {
  test("non-healthcare vocab → /meet-the-doctor is not in candidates", () => {
    const nonHealthcareVocab = {
      customerTerm: "client",
      customerTermPlural: "clients",
      providerTerm: "practitioner",
      identitySection: "practitioner_story",
      schemaSubType: "LegalService",
      referralSourceTerm: "referring attorney",
      capabilities: { referral_tracking: true, gp_network: false, hipaa_mode: false },
    };
    const candidates = getAboutCandidates(
      nonHealthcareVocab,
      "https://martinezlaw.test",
      "Martinez Law Group"
    );
    expect(candidates.every((c) => !c.endsWith("/meet-the-doctor"))).toBe(true);
    expect(candidates.some((c) => c.endsWith("/about"))).toBe(true);
    expect(candidates.some((c) => c.endsWith("/our-team"))).toBe(true);
  });

  test("healthcare vocab → /meet-the-doctor IS in candidates, and /about-dr-[firstword] derived", () => {
    const candidates = getAboutCandidates(
      HEALTHCARE_DEFAULT_VOCAB,
      "https://coastalendo.test",
      "Coastal Endodontic Studio"
    );
    expect(candidates.some((c) => c.endsWith("/meet-the-doctor"))).toBe(true);
    expect(candidates.some((c) => c.endsWith("/about-dr-coastal"))).toBe(true);
    // No literal doctor-name fixture remains in the list.
    expect(candidates.some((c) => c.endsWith("/about-dr-olson"))).toBe(false);
  });
});

// ─── (e) /about-dr-olson purge grep assertion ──────────────────────────

describe("(e) the legacy about-dr doctor-name fixture has been permanently removed", () => {
  // The literal string the fixture used to contain is assembled at runtime so
  // this test file itself doesn't match the grep it's enforcing.
  const FORBIDDEN = ["about", "dr", "olson"].join("-");

  test("grep finds zero occurrences under src/ tests/ scripts/ docs/ frontend/src (this test file excluded)", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const selfRelative = path.relative(repoRoot, __filename);
    let output = "";
    try {
      output = execSync(
        `grep -r --include="*.ts" --include="*.tsx" --include="*.md" --include="*.js" "${FORBIDDEN}" src tests scripts docs frontend/src || true`,
        { cwd: repoRoot, encoding: "utf8" }
      );
    } catch {
      output = "";
    }
    const matches = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith(`${selfRelative}:`));
    expect(matches).toEqual([]);
  });
});
