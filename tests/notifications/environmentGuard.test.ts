/**
 * Card I — environmentGuard unit tests.
 *
 * Verifies the routing decision matrix:
 *   - NODE_ENV=production: pass-through (no redirect, no footer, no event)
 *   - other env: redirect to test-notifications@getalloro.com + footer + event
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const events: Array<{ event_type: string; properties: any }> = [];

vi.mock("../../src/database/connection", () => {
  const dbFn: any = function (table: string) {
    return {
      insert(obj: any) {
        if (table === "behavioral_events") {
          events.push({ event_type: obj.event_type, properties: obj.properties });
        }
        return Promise.resolve();
      },
    };
  };
  dbFn.raw = (sql: string) => sql;
  dbFn.fn = { now: () => "NOW()" };
  return { db: dbFn };
});

import {
  guardRecipients,
  applyFooterToHtml,
  TEST_NOTIFICATION_FOOTER,
} from "../../src/services/notifications/environmentGuard";

const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  events.length = 0;
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe("guardRecipients", () => {
  test("production passes recipients through unchanged + no event + no footer", async () => {
    process.env.NODE_ENV = "production";
    const r = await guardRecipients(["customer@oneendo.example"], {
      practiceId: 39,
      notificationType: "form_submission",
      channel: "mailgun",
    });
    expect(r.recipients).toEqual(["customer@oneendo.example"]);
    expect(r.redirected).toBe(false);
    expect(r.footerToAppend).toBeNull();
    expect(events.length).toBe(0);
  });

  test("non-production redirects to test inbox + appends footer + emits event", async () => {
    process.env.NODE_ENV = "development";
    const r = await guardRecipients(["customer@oneendo.example"], {
      practiceId: 39,
      notificationType: "form_submission",
      channel: "mailgun",
    });
    expect(r.recipients).toEqual(["test-notifications@getalloro.com"]);
    expect(r.redirected).toBe(true);
    expect(r.footerToAppend).toBe(TEST_NOTIFICATION_FOOTER);
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe("notification_routed_to_test_inbox");
  });

  test("sandbox env also redirects (anything not literally 'production')", async () => {
    process.env.NODE_ENV = "sandbox";
    const r = await guardRecipients(["a@b.com", "c@d.com"], {});
    expect(r.recipients).toEqual(["test-notifications@getalloro.com"]);
    expect(r.redirected).toBe(true);
  });

  test("PRODUCTION uppercase is normalized to production", async () => {
    process.env.NODE_ENV = "PRODUCTION";
    const r = await guardRecipients(["x@y.com"], {});
    expect(r.recipients).toEqual(["x@y.com"]);
    expect(r.redirected).toBe(false);
  });
});

describe("applyFooterToHtml", () => {
  test("appends footer when present", () => {
    const out = applyFooterToHtml("<p>Body</p>", "Footer text");
    expect(out).toContain("<p>Body</p>");
    expect(out).toContain("Footer text");
  });

  test("returns body unchanged when footer is null", () => {
    const out = applyFooterToHtml("<p>Body</p>", null);
    expect(out).toBe("<p>Body</p>");
  });
});
