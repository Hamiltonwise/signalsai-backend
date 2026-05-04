/**
 * Card H — approved customer-visible UI strings must pass checkVoice.
 * If any of these fail, do NOT silently rewrite. The standing approval
 * in the playlist says: surface a constraint conflict to Corey.
 */

import { describe, test, expect } from "vitest";
import { checkVoice } from "../../src/services/narrator/voiceConstraints";
import { CARD_H_STRINGS } from "../../src/services/notifications/locationRouterStrings";

describe("Card H approved strings pass Voice Constraints", () => {
  for (const [key, text] of Object.entries(CARD_H_STRINGS)) {
    test(`'${key}' passes checkVoice`, () => {
      const r = checkVoice(text);
      if (!r.passed) {
        throw new Error(
          `Voice Constraints flagged the approved Card H string '${key}': ${r.violations.join("; ")}`,
        );
      }
      expect(r.passed).toBe(true);
    });
  }

  test("no em-dashes in any Card H string", () => {
    const all = Object.values(CARD_H_STRINGS).join("\n");
    expect(all).not.toMatch(/—/);
  });
});
