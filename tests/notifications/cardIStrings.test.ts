/**
 * Card I — banner + footer copy must pass Voice Constraints.
 *
 * Banner uses mid-dot (·) per AR-002 — em-dash banned. The card spec
 * explicitly allows substituting mid-dot when the em-dash variant
 * fails Voice Constraints.
 */

import { describe, test, expect } from "vitest";
import { checkVoice } from "../../src/services/narrator/voiceConstraints";
import { TEST_NOTIFICATION_FOOTER } from "../../src/services/notifications/environmentGuard";

const PRODUCTION_BANNER = "PRODUCTION · changes affect real customers";
const SANDBOX_BANNER = "SANDBOX · changes affect test data only";

describe("Card I approved strings pass Voice Constraints", () => {
  for (const [key, text] of Object.entries({
    PRODUCTION_BANNER,
    SANDBOX_BANNER,
    TEST_NOTIFICATION_FOOTER,
  })) {
    test(`'${key}' passes checkVoice`, () => {
      const r = checkVoice(text);
      if (!r.passed) {
        throw new Error(
          `Voice Constraints flagged the approved Card I string '${key}': ${r.violations.join("; ")}`,
        );
      }
      expect(r.passed).toBe(true);
    });
  }

  test("no em-dashes in any Card I string", () => {
    const all = `${PRODUCTION_BANNER}\n${SANDBOX_BANNER}\n${TEST_NOTIFICATION_FOOTER}`;
    expect(all).not.toMatch(/—/);
  });

  test("banner uses mid-dot separator", () => {
    expect(PRODUCTION_BANNER).toContain("·");
    expect(SANDBOX_BANNER).toContain("·");
  });
});
