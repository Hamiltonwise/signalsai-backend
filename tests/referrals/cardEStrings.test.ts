/**
 * Card E (May 4 2026, re-scoped) — approved customer-visible strings must
 * pass Voice Constraints (Brand Voice + Em-Dash). Per playlist Standing
 * Approvals: if checkVoice flags, halt and report rather than rewrite.
 */

import { describe, test, expect } from "vitest";
import { checkVoice } from "../../src/services/narrator/voiceConstraints";
import { CARD_E_STRINGS } from "../../src/services/referrals/columnMappingStrings";

const NAME = "1Endo";

const dynamicStrings = [
  CARD_E_STRINGS.modal_title,
  CARD_E_STRINGS.modal_title_with_practice(NAME),
  CARD_E_STRINGS.helper_first_time(7, NAME),
  CARD_E_STRINGS.helper_re_confirmation(NAME, 7, 9),
  CARD_E_STRINGS.retroactive_cleanup_notification(42),
];

const staticStrings = [
  CARD_E_STRINGS.role_label_source,
  CARD_E_STRINGS.role_label_date,
  CARD_E_STRINGS.role_label_amount,
  CARD_E_STRINGS.role_label_count,
  CARD_E_STRINGS.role_label_patient,
  CARD_E_STRINGS.role_label_procedure,
  CARD_E_STRINGS.role_label_provider,
  CARD_E_STRINGS.role_desc_source,
  CARD_E_STRINGS.role_desc_date,
  CARD_E_STRINGS.role_desc_amount,
  CARD_E_STRINGS.role_desc_count,
  CARD_E_STRINGS.role_desc_patient,
  CARD_E_STRINGS.role_desc_procedure,
  CARD_E_STRINGS.role_desc_provider,
  CARD_E_STRINGS.save_button,
  CARD_E_STRINGS.cancel_button,
  CARD_E_STRINGS.validation_source_required,
];

describe("Card E strings pass Voice Constraints", () => {
  for (const text of [...dynamicStrings, ...staticStrings]) {
    test(`"${text.slice(0, 50)}..." passes checkVoice`, () => {
      const r = checkVoice(text);
      if (!r.passed) {
        throw new Error(
          `Voice Constraints flagged Card E string: ${r.violations.join("; ")}\nText: ${text}`,
        );
      }
      expect(r.passed).toBe(true);
    });
  }

  test("no em-dashes in any Card E string (static or dynamic)", () => {
    const all = [...staticStrings, ...dynamicStrings].join("\n");
    expect(all).not.toMatch(/—/);
  });
});
