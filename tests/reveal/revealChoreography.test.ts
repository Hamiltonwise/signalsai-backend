import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  runRevealChoreography,
  buildIdempotencyKey,
  type RevealLogRow,
  type RevealLogStore,
} from "../../src/services/reveal/revealChoreography";
import { composeRevealEmail, checkVoice } from "../../src/services/reveal/emailTemplate";
import { composeRevealPostcard, validateAddress } from "../../src/services/reveal/lobPostcardTemplate";
import { composeRevealTiles } from "../../src/services/reveal/revealDashboardCards";
import type {
  OrgRevealContext,
  PracticeAddress,
} from "../../src/services/reveal/types";
import type { ImpactEstimate } from "../../src/services/economic/economicCalc";

// A deterministic impact estimate mirroring site.published output for an
// endodontics org with ~$1.8k case value and 45 monthly new patients.
function endodonticsImpact(): ImpactEstimate {
  return {
    dollar30d: 8100,
    dollar90d: 24300,
    dollar365d: 97200,
    confidence: 82,
    dataGapReason: null,
    allowedToShowDollar: true,
    vertical: "endodontics",
    inputsUsed: ["vertical=endodontics", "gbp_data", "practice_history"],
  };
}

function dataGapImpact(): ImpactEstimate {
  return {
    dollar30d: null,
    dollar90d: null,
    dollar365d: null,
    confidence: 55,
    dataGapReason: "Missing inputs: org_case_value, vertical, gbp_or_checkup_data",
    allowedToShowDollar: false,
    vertical: "unknown",
    inputsUsed: [],
  };
}

function orgCtx(overrides: Partial<OrgRevealContext> = {}): OrgRevealContext {
  return {
    id: 42,
    name: "Kargoli Endodontics",
    siteUrl: "https://alloro-org-42-kargoli.alloro.site",
    shortSiteUrl: "https://alloro-org-42-kargoli.alloro.site",
    recipientEmail: "owner@kargoli.example",
    recipientName: "Dr. Kargoli",
    practiceAddress: {
      line1: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78704",
      valid: false,
    },
    flagEnabled: false,
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    vertical: "endodontics",
    hasGbpData: true,
    hasCheckupData: true,
    ...overrides,
  };
}

class InMemoryLogStore implements RevealLogStore {
  private rows: RevealLogRow[] = [];
  private idCounter = 0;

  async findByIdempotencyKey(key: string): Promise<RevealLogRow | null> {
    return this.rows.find((r) => r.idempotency_key === key) ?? null;
  }

  async insert(row: Omit<RevealLogRow, "id" | "created_at">): Promise<RevealLogRow> {
    const inserted: RevealLogRow = {
      ...row,
      id: `log_${++this.idCounter}`,
      created_at: new Date(),
    };
    this.rows.push(inserted);
    return inserted;
  }

  all(): RevealLogRow[] {
    return this.rows;
  }
}

// ─── Voice check (emailTemplate.checkVoice) ─────────────────────────

describe("emailTemplate voice check", () => {
  test("forbidden phrases are caught (case-insensitive)", () => {
    const cases = [
      "Your site is LIVE NOW",
      "We've done it",
      "Our best-in-class engine",
      "state-of-the-art technology",
      "a world-class reveal",
      "the launch is ready",
      "cutting-edge approach",
    ];
    for (const body of cases) {
      const result = checkVoice("subject", body);
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  test("clean seed body passes all forbidden checks", () => {
    const seed = [
      "Your new practice home is ready. Seven pages, written in your voice, at https://example.alloro.site.",
      "We built it while you worked. Ranked it against the three competitors your patients are actively comparing you to.",
      "Category-benchmark first-year lift for a practice in your position lands near $97k, with roughly $8k in the first thirty days. Conservative read, not a promise.",
      "A card is on its way to your office. You will know it when you see it.",
      "View your site: https://example.alloro.site",
      "No action required.",
    ].join(" ");
    const result = checkVoice("Your practice home is ready.", seed);
    expect(result.violations).toEqual([]);
    expect(result.recipeCompliance.hasFinding).toBe(true);
    expect(result.recipeCompliance.hasDollarOrGap).toBe(true);
    expect(result.recipeCompliance.hasAction).toBe(true);
    expect(result.recipeCompliance.complete).toBe(true);
    expect(result.passed).toBe(true);
  });
});

describe("composeRevealEmail", () => {
  test("dollar line included when impact has values", () => {
    const composed = composeRevealEmail(orgCtx(), endodonticsImpact());
    expect(composed.voiceCheck.passed).toBe(true);
    expect(composed.subject).toBe("Your practice home is ready.");
    expect(composed.bodyText).toMatch(/\$\d/);
    expect(composed.bodyText).toMatch(/Conservative read/);
  });

  test("data-gap frame used when impact has null dollars (Theranos guardrail)", () => {
    const composed = composeRevealEmail(orgCtx(), dataGapImpact());
    expect(composed.voiceCheck.passed).toBe(true);
    expect(composed.bodyText).not.toMatch(/\$\d/);
    expect(composed.bodyText).toMatch(/signal.*connected|data.*connected|year-one impact/i);
  });

  test("body contains site URL and view-your-site action", () => {
    const composed = composeRevealEmail(orgCtx(), endodonticsImpact());
    expect(composed.bodyText).toContain("alloro-org-42-kargoli.alloro.site");
    expect(composed.bodyText).toMatch(/View your site/i);
  });
});

// ─── Address validation (Harness Packet edge cases) ─────────────────

describe("validateAddress", () => {
  test("accepts a valid address", () => {
    const r = validateAddress({
      line1: "123 Main",
      city: "Austin",
      state: "TX",
      zip: "78704",
      valid: false,
    });
    expect(r.valid).toBe(true);
    expect(r.state).toBe("TX");
  });

  test("rejects missing zip", () => {
    const r = validateAddress({
      line1: "123 Main",
      city: "Austin",
      state: "TX",
      zip: "",
      valid: false,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/missing_zip/);
  });

  test("rejects invalid state abbreviation", () => {
    const r = validateAddress({
      line1: "123 Main",
      city: "Austin",
      state: "Texas",
      zip: "78704",
      valid: false,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/invalid_state/);
  });

  test("rejects invalid zip format", () => {
    const r = validateAddress({
      line1: "123 Main",
      city: "Austin",
      state: "TX",
      zip: "ABCDE",
      valid: false,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/invalid_zip/);
  });

  test("null address yields valid=false with reason", () => {
    const r = validateAddress(null);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("no_address_on_file");
  });
});

describe("composeRevealPostcard (Lob template)", () => {
  test("long practice name is truncated on the front", () => {
    const longName = "Coastal Specialty Endodontics & Microsurgery of the Greater Gulf Region";
    const composed = composeRevealPostcard(orgCtx({ name: longName }));
    expect(composed.front).toContain("…");
  });

  test("apostrophes are preserved (Lob renders them verbatim)", () => {
    const composed = composeRevealPostcard(orgCtx({ name: "Dr. O'Brien's Practice" }));
    expect(composed.front).toContain("O'Brien");
  });

  test("ampersands in practice name are HTML-escaped", () => {
    const composed = composeRevealPostcard(orgCtx({ name: "Smith & Jones" }));
    expect(composed.front).toContain("Smith &amp; Jones");
  });

  test("postcard marked address_valid=false when address is missing", () => {
    const composed = composeRevealPostcard(
      orgCtx({ practiceAddress: null })
    );
    expect(composed.addressValid).toBe(false);
  });

  test("postcard addressValid=true when address validates", () => {
    const validAddr: PracticeAddress = {
      line1: "123 Main",
      city: "Austin",
      state: "TX",
      zip: "78704",
      valid: false,
    };
    const composed = composeRevealPostcard(
      orgCtx({ practiceAddress: validAddr })
    );
    expect(composed.addressValid).toBe(true);
  });
});

// ─── Dashboard tiles ────────────────────────────────────────────────

describe("composeRevealTiles", () => {
  test("three tiles emitted in render order", () => {
    const tiles = composeRevealTiles(orgCtx(), endodonticsImpact());
    expect(tiles.tiles.length).toBe(3);
    expect(tiles.tiles.map((t) => t.renderOrder)).toEqual([1, 2, 3]);
    expect(tiles.tiles.map((t) => t.kind)).toEqual([
      "reveal_hero",
      "reveal_competitor_context",
      "reveal_impact_window",
    ]);
  });

  test("impact tile shows data-gap frame when dollars are null", () => {
    const tiles = composeRevealTiles(orgCtx(), dataGapImpact());
    const impact = tiles.tiles.find((t) => t.kind === "reveal_impact_window")!;
    expect(impact.body).toMatch(/signal not connected|data is connected/i);
    expect(impact.body).not.toMatch(/\$\d/);
  });

  test("hero tile links to site URL", () => {
    const tiles = composeRevealTiles(orgCtx(), endodonticsImpact());
    const hero = tiles.tiles.find((t) => t.kind === "reveal_hero")!;
    expect(hero.cta?.href).toContain("alloro-org-42-kargoli.alloro.site");
  });
});

// ─── Orchestration: dry-run + idempotency + fan-out ─────────────────

describe("runRevealChoreography (orchestration)", () => {
  const realFetch = global.fetch;
  let emailFn: ReturnType<typeof vi.fn>;
  let lobFn: ReturnType<typeof vi.fn>;
  let tileFn: ReturnType<typeof vi.fn>;
  let logStore: InMemoryLogStore;

  beforeEach(() => {
    emailFn = vi.fn().mockResolvedValue({
      sent: false,
      messageId: null,
      sentAt: null,
      skipped: "dry_run",
    });
    lobFn = vi.fn().mockResolvedValue({
      sent: false,
      postcardId: null,
      sentAt: null,
      skipped: "dry_run",
    });
    tileFn = vi.fn().mockResolvedValue({
      rendered: false,
      renderedAt: null,
      skipped: "dry_run",
    });
    logStore = new InMemoryLogStore();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "psc_test" }),
    }) as any;
  });

  test("shadow mode: flag off -> mode='dry_run', no external sends, composed payload archived", async () => {
    const result = await runRevealChoreography(
      { orgId: 42, sitePublishedEventId: "evt_1" },
      {
        loadOrgContext: async () => orgCtx({ flagEnabled: false }),
        emailSender: emailFn,
        lobSender: lobFn,
        tileRenderer: tileFn,
        impactCalculator: () => endodonticsImpact(),
        logStore,
      }
    );

    expect(result.mode).toBe("dry_run");
    expect(result.composed).not.toBeNull();
    expect(result.composed?.email.voiceCheck.passed).toBe(true);
    expect(result.fanOut.emailSentAt).toBeNull();
    expect(result.fanOut.lobSentAt).toBeNull();
    expect(result.fanOut.dashboardRenderedAt).toBeNull();
    expect(emailFn).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), "dry_run");
    expect(lobFn).toHaveBeenCalledWith(expect.any(Object), "dry_run");
    expect(tileFn).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), "dry_run");
    expect(logStore.all().length).toBe(1);
    expect(logStore.all()[0].mode).toBe("dry_run");
  });

  test("live mode: flag on -> email + lob + dashboard all invoked with mode='live'", async () => {
    emailFn.mockResolvedValue({
      sent: true,
      messageId: "mg_123",
      sentAt: new Date(),
    });
    lobFn.mockResolvedValue({
      sent: true,
      postcardId: "psc_abc",
      sentAt: new Date(),
    });
    tileFn.mockResolvedValue({
      rendered: true,
      renderedAt: new Date(),
    });

    const result = await runRevealChoreography(
      { orgId: 42, sitePublishedEventId: "evt_2" },
      {
        loadOrgContext: async () => orgCtx({ flagEnabled: true }),
        emailSender: emailFn,
        lobSender: lobFn,
        tileRenderer: tileFn,
        impactCalculator: () => endodonticsImpact(),
        logStore,
      }
    );

    expect(result.mode).toBe("live");
    expect(result.fanOut.emailSentAt).toBeInstanceOf(Date);
    expect(result.fanOut.emailMessageId).toBe("mg_123");
    expect(result.fanOut.lobPostcardId).toBe("psc_abc");
    expect(result.fanOut.dashboardRenderedAt).toBeInstanceOf(Date);
    expect(emailFn).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), "live");
    expect(lobFn).toHaveBeenCalledWith(expect.any(Object), "live");
  });

  test("idempotency: second invocation with same (orgId, eventId) is a no-op", async () => {
    const deps = {
      loadOrgContext: async () => orgCtx({ flagEnabled: false }),
      emailSender: emailFn,
      lobSender: lobFn,
      tileRenderer: tileFn,
      impactCalculator: () => endodonticsImpact(),
      logStore,
    };

    const r1 = await runRevealChoreography({ orgId: 42, sitePublishedEventId: "evt_3" }, deps);
    expect(r1.idempotent).toBe(false);
    expect(emailFn).toHaveBeenCalledTimes(1);

    const r2 = await runRevealChoreography({ orgId: 42, sitePublishedEventId: "evt_3" }, deps);
    expect(r2.idempotent).toBe(true);
    // No additional sends on the second call
    expect(emailFn).toHaveBeenCalledTimes(1);
    expect(lobFn).toHaveBeenCalledTimes(1);
    expect(tileFn).toHaveBeenCalledTimes(1);
    expect(logStore.all().length).toBe(1);
  });

  test("forceDryRun overrides flag=true to dry_run (safety override)", async () => {
    const result = await runRevealChoreography(
      { orgId: 42, sitePublishedEventId: "evt_4", forceDryRun: true },
      {
        loadOrgContext: async () => orgCtx({ flagEnabled: true }),
        emailSender: emailFn,
        lobSender: lobFn,
        tileRenderer: tileFn,
        impactCalculator: () => endodonticsImpact(),
        logStore,
      }
    );
    expect(result.mode).toBe("dry_run");
  });

  test("missing org yields graceful degradation, no fan-out attempted", async () => {
    const result = await runRevealChoreography(
      { orgId: 999, sitePublishedEventId: "evt_5" },
      {
        loadOrgContext: async () => null,
        emailSender: emailFn,
        lobSender: lobFn,
        tileRenderer: tileFn,
        impactCalculator: () => endodonticsImpact(),
        logStore,
      }
    );
    expect(result.error).toMatch(/org_not_found/);
    expect(emailFn).not.toHaveBeenCalled();
    expect(lobFn).not.toHaveBeenCalled();
    expect(tileFn).not.toHaveBeenCalled();
  });

  test("invalid address in live mode: Lob skipped with address_invalid reason", async () => {
    lobFn.mockImplementation(async (composed: any, mode: string) => {
      if (!composed.addressValid) {
        return {
          sent: false,
          postcardId: null,
          sentAt: null,
          skipped: "address_invalid",
          error: "cannot_mail: address failed validation",
        };
      }
      return { sent: true, postcardId: "psc_ok", sentAt: new Date() };
    });
    emailFn.mockResolvedValue({ sent: true, messageId: "m_1", sentAt: new Date() });
    tileFn.mockResolvedValue({ rendered: true, renderedAt: new Date() });

    const result = await runRevealChoreography(
      { orgId: 42, sitePublishedEventId: "evt_6" },
      {
        loadOrgContext: async () =>
          orgCtx({
            flagEnabled: true,
            practiceAddress: { line1: "", city: "", state: "", zip: "", valid: false },
          }),
        emailSender: emailFn,
        lobSender: lobFn,
        tileRenderer: tileFn,
        impactCalculator: () => endodonticsImpact(),
        logStore,
      }
    );

    expect(result.mode).toBe("live");
    expect(result.fanOut.emailSentAt).toBeInstanceOf(Date); // email still fires
    expect(result.fanOut.lobSentAt).toBeNull(); // lob gracefully degraded
    expect(result.fanOut.dashboardRenderedAt).toBeInstanceOf(Date); // dashboard still renders
  });
});

// ─── Voice calibration sample (Gold Question 4 + Harness Packet) ────

describe("voice calibration sample (10 composed emails)", () => {
  test("10 orgs across edge cases produce 10/10 voice-clean emails", () => {
    const samples: Array<{ label: string; org: OrgRevealContext; impact: ImpactEstimate }> = [
      { label: "endo with full data", org: orgCtx(), impact: endodonticsImpact() },
      { label: "endo data-gap", org: orgCtx(), impact: dataGapImpact() },
      { label: "ortho with dollars", org: orgCtx({ name: "Nova Orthodontics", vertical: "orthodontics" }), impact: endodonticsImpact() },
      { label: "short name", org: orgCtx({ name: "Lee Endo" }), impact: endodonticsImpact() },
      { label: "long name", org: orgCtx({ name: "The Specialty Endodontic Microsurgery Institute of Greater Austin" }), impact: endodonticsImpact() },
      { label: "apostrophe name", org: orgCtx({ name: "O'Brien Endodontics" }), impact: endodonticsImpact() },
      { label: "ampersand name", org: orgCtx({ name: "Smith & Jones" }), impact: endodonticsImpact() },
      { label: "no siteUrl (falls back to dashboard)", org: orgCtx({ siteUrl: null, shortSiteUrl: null }), impact: endodonticsImpact() },
      { label: "new practice <14 days, low confidence -> data gap", org: orgCtx({ createdAt: new Date() }), impact: dataGapImpact() },
      { label: "veterinary", org: orgCtx({ vertical: "veterinary" }), impact: endodonticsImpact() },
    ];

    const failures: Array<{ label: string; violations: string[] }> = [];
    for (const s of samples) {
      const composed = composeRevealEmail(s.org, s.impact);
      if (!composed.voiceCheck.passed) {
        failures.push({ label: s.label, violations: composed.voiceCheck.violations });
      }
    }
    expect(failures).toEqual([]);
  });
});

// ─── idempotency key shape ──────────────────────────────────────────

describe("buildIdempotencyKey", () => {
  test("combines orgId + eventId deterministically", () => {
    expect(buildIdempotencyKey(42, "evt_x")).toBe("reveal:42:evt_x");
    expect(buildIdempotencyKey(42, null)).toBe("reveal:42:no_event_id");
    expect(buildIdempotencyKey(42, undefined)).toBe("reveal:42:no_event_id");
  });
});
