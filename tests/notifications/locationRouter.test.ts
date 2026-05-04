/**
 * Card H — locationRouter unit tests (May 4 2026).
 *
 * Mocked DB; tests the routing decision matrix:
 *   - location_id null → fallback + emit event (noLocation=true)
 *   - location_id present + config rows → use configured addresses
 *   - location_id present + no config rows → fallback + emit event
 *   - email normalization (trim, lowercase, dedupe, drop invalid)
 *   - bulk-config copies all three notification_type rows
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

interface FakeDbState {
  rows: Array<{
    id: number;
    location_id: number;
    notification_type: string;
    email_addresses: string[];
  }>;
  events: Array<{ event_type: string; org_id: number | null; properties: any }>;
}

let state: FakeDbState;
function reset(): void {
  state = { rows: [], events: [] };
}

vi.mock("../../src/database/connection", () => {
  const dbFn: any = function (table: string) {
    let chain: Array<(r: any) => boolean> = [];
    return {
      where(criteria: any) {
        chain.push((r) => {
          for (const k of Object.keys(criteria)) {
            if (r[k] !== criteria[k]) return false;
          }
          return true;
        });
        return this;
      },
      andWhere(criteria: any) {
        return this.where(criteria);
      },
      first(_col?: string) {
        if (table === "location_notification_config") {
          const r = state.rows.find((row) => chain.every((p) => p(row)));
          return Promise.resolve(r);
        }
        return Promise.resolve(undefined);
      },
      select(..._cols: string[]) {
        if (table === "location_notification_config") {
          const filtered = state.rows.filter((row) => chain.every((p) => p(row)));
          return Promise.resolve(filtered);
        }
        return Promise.resolve([]);
      },
      insert(obj: any) {
        if (table === "behavioral_events") {
          state.events.push({
            event_type: obj.event_type,
            org_id: obj.org_id ?? null,
            properties: obj.properties,
          });
        }
        return Promise.resolve();
      },
    };
  };
  dbFn.raw = (sql: string, _binds?: any[]) => {
    if (sql.includes("INSERT INTO location_notification_config")) {
      // UPSERT semantics: replace email_addresses for the (location, type) pair
      const [locId, ntype, addrs] = _binds ?? [];
      const existing = state.rows.find(
        (r) => r.location_id === locId && r.notification_type === ntype,
      );
      if (existing) {
        existing.email_addresses = addrs as string[];
      } else {
        state.rows.push({
          id: state.rows.length + 1,
          location_id: locId,
          notification_type: ntype,
          email_addresses: addrs as string[],
        });
      }
    }
    return sql;
  };
  dbFn.fn = { now: () => "NOW()" };
  return { db: dbFn };
});

import {
  resolveNotificationRecipients,
  setLocationNotificationConfig,
  getLocationNotificationConfig,
  copyLocationNotificationConfig,
} from "../../src/services/notifications/locationRouter";

beforeEach(() => reset());

describe("resolveNotificationRecipients", () => {
  test("location_id null → fallback + behavioral_event with noLocation=true", async () => {
    const r = await resolveNotificationRecipients({
      locationId: null,
      notificationType: "form_submission",
      fallbackRecipients: ["fallback@example.com"],
      practiceId: 39,
    });
    expect(r.recipients).toEqual(["fallback@example.com"]);
    expect(r.usedFallback).toBe(true);
    expect(r.noLocation).toBe(true);
    expect(state.events.length).toBe(1);
    expect(state.events[0].event_type).toBe("notification_fallback_to_global");
  });

  test("location_id present + config rows → use configured addresses", async () => {
    state.rows.push({
      id: 1,
      location_id: 14,
      notification_type: "form_submission",
      email_addresses: ["fallschurch@oneendo.example"],
    });
    const r = await resolveNotificationRecipients({
      locationId: 14,
      notificationType: "form_submission",
      fallbackRecipients: ["fallback@example.com"],
      practiceId: 39,
    });
    expect(r.recipients).toEqual(["fallschurch@oneendo.example"]);
    expect(r.usedFallback).toBe(false);
    expect(state.events.length).toBe(0);
  });

  test("location_id present + empty config row → fallback + emit event", async () => {
    state.rows.push({
      id: 1,
      location_id: 14,
      notification_type: "form_submission",
      email_addresses: [],
    });
    const r = await resolveNotificationRecipients({
      locationId: 14,
      notificationType: "form_submission",
      fallbackRecipients: ["fallback@example.com"],
      practiceId: 39,
    });
    expect(r.recipients).toEqual(["fallback@example.com"]);
    expect(r.usedFallback).toBe(true);
    expect(state.events.length).toBe(1);
    expect(state.events[0].event_type).toBe("notification_fallback_to_global");
    expect(state.events[0].org_id).toBe(39);
  });
});

describe("setLocationNotificationConfig", () => {
  test("normalizes addresses: trim, lowercase, dedupe, drop invalid", async () => {
    await setLocationNotificationConfig({
      locationId: 14,
      notificationType: "form_submission",
      emailAddresses: [
        "  Office@OneEndo.com  ",
        "office@oneendo.com",
        "manager@oneendo.com",
        "",
        "not-an-email",
        "MANAGER@oneendo.com",
      ],
    });
    const row = state.rows.find(
      (r) => r.location_id === 14 && r.notification_type === "form_submission",
    );
    expect(row?.email_addresses).toEqual([
      "office@oneendo.com",
      "manager@oneendo.com",
    ]);
  });
});

describe("copyLocationNotificationConfig", () => {
  test("copies all three notification_type rows from source to target", async () => {
    state.rows.push(
      {
        id: 1,
        location_id: 14,
        notification_type: "form_submission",
        email_addresses: ["a@x.com"],
      },
      {
        id: 2,
        location_id: 14,
        notification_type: "referral_received",
        email_addresses: ["b@x.com"],
      },
      {
        id: 3,
        location_id: 14,
        notification_type: "review_alert",
        email_addresses: ["c@x.com"],
      },
    );
    const out = await copyLocationNotificationConfig({
      sourceLocationId: 14,
      targetLocationId: 15,
    });
    const targetForms = out.find((r) => r.notification_type === "form_submission");
    expect(targetForms?.email_addresses).toEqual(["a@x.com"]);
    expect(out.find((r) => r.notification_type === "referral_received")?.email_addresses).toEqual(
      ["b@x.com"],
    );
    expect(out.find((r) => r.notification_type === "review_alert")?.email_addresses).toEqual([
      "c@x.com",
    ]);
  });
});

describe("getLocationNotificationConfig", () => {
  test("missing rows surface as empty arrays for all three types", async () => {
    const out = await getLocationNotificationConfig(99999);
    expect(out.length).toBe(3);
    for (const row of out) {
      expect(row.email_addresses).toEqual([]);
    }
    const types = out.map((r) => r.notification_type).sort();
    expect(types).toEqual(["form_submission", "referral_received", "review_alert"]);
  });
});
