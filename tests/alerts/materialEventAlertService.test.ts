/**
 * Tests for the Material Event Alert Service (Card 5 Run 4).
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  _resetRubricCache,
  _seedRubricCache,
} from "../../src/services/rubric/standardRubric";
import { buildFallbackConfig } from "../../src/services/rubric/localFallback";
import { _resetFlagCache } from "../../src/services/rubric/gateFlag";
import { _resetRewriteFlagCache } from "../../src/services/rewrite/rewriteFlag";
import { _resetMaterialEventThresholdsCache } from "../../src/services/alerts/materialEventThresholds";

const archiveRows: any[] = [];
const lastAlertRows: any[] = [];
const batchCandidateRows: any[] = [];

vi.mock("../../src/database/connection", () => {
  const tableHandlers: Record<string, any> = {
    material_event_alerts: {
      where: (clause: any) => ({
        where: () => ({
          whereIn: () => ({
            first: async () => lastAlertRows.find((r) => r.practice_id === clause.practice_id && r.event_type === clause.event_type) ?? null,
          }),
          orderBy: () => ({
            first: async () => batchCandidateRows.find((r) => r.practice_id === clause.practice_id) ?? null,
          }),
        }),
      }),
      insert: (row: any) => ({
        returning: async () => {
          archiveRows.push(row);
          return [{ id: row.id ?? "archived" }];
        },
      }),
    },
    organization_users: {
      where: () => ({
        orderBy: () => ({ first: async () => ({ user_id: 42 }) }),
      }),
    },
    users: {
      where: () => ({ first: async () => ({ email: "test-owner@example.com" }) }),
    },
    narrator_outputs: {
      insert: () => ({ returning: async () => [{ id: "narrator-out" }] }),
    },
    organizations: {
      where: () => ({ first: async () => ({ id: 1, name: "Artful Orthodontics" }) }),
    },
    dream_team_tasks: {
      insert: async () => ({}),
    },
  };

  const dbFn: any = (table: string) => tableHandlers[table] ?? {
    where: () => ({ first: async () => null, whereIn: () => ({ first: async () => null }) }),
    insert: () => ({ returning: async () => [{ id: "noop" }] }),
  };
  dbFn.raw = (s: string) => s;
  dbFn.fn = { now: () => new Date() };
  return { db: dbFn };
});

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: { create: async () => ({}) },
}));

vi.mock("../../src/emails/emailService", () => ({
  sendEmail: async () => ({ success: true, messageId: "msg-fake-1" }),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class MockClient {
    messages = {
      create: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              dimensions: [
                { key: "meta_question", score: 38, reasoning: "calm opener" },
                { key: "recognition_test", score: 9, reasoning: "specific" },
                { key: "patient_voice_match", score: 9, reasoning: "ok" },
                { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A" },
                { key: "cesar_millan", score: 9, reasoning: "ok" },
                { key: "mom_test", score: 9, reasoning: "plain" },
                { key: "provenance", score: 0, na: true, reasoning: "N/A" },
                { key: "never_blank", score: 5, reasoning: "pass" },
                { key: "public_safe", score: 5, reasoning: "pass" },
              ],
              repair_instructions: [],
            }),
          },
        ],
      }),
    };
  }
  return { default: MockClient };
});

describe("Material Event Alert Service", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.FREEFORM_CONCERN_GATE_ENABLED = "true";
    process.env.MATERIAL_EVENT_ALERTS_ENABLED = "true";
    delete process.env.NOTION_TOKEN;
    _resetRubricCache();
    _seedRubricCache(buildFallbackConfig());
    _resetFlagCache();
    _resetRewriteFlagCache();
    _resetMaterialEventThresholdsCache();
    archiveRows.length = 0;
    lastAlertRows.length = 0;
    batchCandidateRows.length = 0;
  });

  test("low_rating_review at 2 stars composes, gates, and sends", async () => {
    // Force a non-quiet-hour time (UTC 2pm) so quiet hours don't defer
    const twoPmUtc = Date.UTC(2026, 3, 22, 14, 0, 0);
    const { runMaterialEventAlert } = await import(
      "../../src/services/alerts/materialEventAlertService"
    );
    const result = await runMaterialEventAlert(
      {
        orgId: 1,
        orgName: "Artful Orthodontics",
        eventType: "low_rating_review",
        occurredAt: new Date(twoPmUtc).toISOString(),
        data: { stars: 2, reviewerFirstName: "Frank", reviewText: "Long wait." },
        timezone: "UTC",
        recipientEmail: "test-owner@example.com",
      },
      { nowMs: twoPmUtc }
    );
    expect(result.composed).toBe(true);
    expect(result.passedGate).toBe(true);
    expect(result.deliveryStatus).toBe("sent");
    expect(result.sent).toBe(true);
    expect(result.subject).toMatch(/Artful Orthodontics/);
    expect(result.subject).toMatch(/2-star/);
    expect(result.oneClickActions.length).toBeGreaterThan(0);
    expect(archiveRows[0].delivery_status).toBe("sent");
  });

  test("debounce: second alert for same event_type within 24h is short-circuited", async () => {
    // Simulate that there is a recent sent alert for this practice + event type
    lastAlertRows.push({
      practice_id: 1,
      event_type: "low_rating_review",
      id: "previous-alert-id",
    });
    const { runMaterialEventAlert } = await import(
      "../../src/services/alerts/materialEventAlertService"
    );
    const result = await runMaterialEventAlert({
      orgId: 1,
      orgName: "Artful Orthodontics",
      eventType: "low_rating_review",
      occurredAt: new Date().toISOString(),
      data: { stars: 1 },
      timezone: "UTC",
    });
    expect(result.debounced).toBe(true);
    expect(result.sent).toBe(false);
    expect(result.deliveryStatus).toBe("debounced");
  });

  test("shadow mode (flag off): composes, archives, but does not send", async () => {
    delete process.env.MATERIAL_EVENT_ALERTS_ENABLED;
    const twoPmUtc = Date.UTC(2026, 3, 22, 14, 0, 0);
    const { runMaterialEventAlert } = await import(
      "../../src/services/alerts/materialEventAlertService"
    );
    const result = await runMaterialEventAlert(
      {
        orgId: 1,
        orgName: "Artful Orthodontics",
        eventType: "low_rating_review",
        occurredAt: new Date(twoPmUtc).toISOString(),
        data: { stars: 2 },
        timezone: "UTC",
      },
      { nowMs: twoPmUtc }
    );
    expect(result.shadow).toBe(true);
    expect(result.composed).toBe(true);
    expect(result.sent).toBe(false);
    expect(result.deliveryStatus).toBe("shadow");
  });

  test("quiet hours defer delivery when flag on and inside local quiet window", async () => {
    // Force quiet hours by picking a timezone where current hour is 2am.
    // Use fixed nowMs so test is deterministic.
    const twoAmUtc = Date.UTC(2026, 3, 22, 2, 0, 0); // 2am UTC
    const { runMaterialEventAlert } = await import(
      "../../src/services/alerts/materialEventAlertService"
    );
    const result = await runMaterialEventAlert(
      {
        orgId: 1,
        orgName: "Artful Orthodontics",
        eventType: "low_rating_review",
        occurredAt: new Date(twoAmUtc).toISOString(),
        data: { stars: 2 },
        timezone: "UTC",
      },
      { nowMs: twoAmUtc }
    );
    expect(result.quietHoursDeferred).toBe(true);
    expect(result.deliveryStatus).toBe("quiet_hours");
    expect(result.sent).toBe(false);
  });

  test("non-material event (4-star review) is skipped before send", async () => {
    const twoPmUtc = Date.UTC(2026, 3, 22, 14, 0, 0);
    const { runMaterialEventAlert } = await import(
      "../../src/services/alerts/materialEventAlertService"
    );
    const result = await runMaterialEventAlert(
      {
        orgId: 1,
        orgName: "Artful Orthodontics",
        eventType: "low_rating_review",
        occurredAt: new Date(twoPmUtc).toISOString(),
        data: { stars: 4 },
        timezone: "UTC",
      },
      { nowMs: twoPmUtc }
    );
    expect(result.composed).toBe(false);
    expect(result.deliveryStatus).toBe("skipped_not_material");
  });
});
