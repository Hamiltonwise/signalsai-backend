/**
 * Pure-logic tests for the Live Activity voice enforcement layer.
 * The DB writer + GET endpoint are exercised in the smoke test against
 * the live database.
 */

import { describe, test, expect } from "vitest";
import { enforceVoiceOrFallback } from "../../src/services/answerEngine/liveActivity";
import { checkVoice } from "../../src/services/narrator/voiceConstraints";

describe("enforceVoiceOrFallback", () => {
  test("clean text passes through unchanged", () => {
    const t = "Search rank for endodontist Memphis moved up from 8 to 4. Alloro is watching.";
    expect(enforceVoiceOrFallback(t)).toBe(t);
  });

  test("em-dash is replaced with comma in fallback", () => {
    const t = "We saw a rank shift — Alloro is watching.";
    const out = enforceVoiceOrFallback(t);
    expect(out).not.toContain("—");
    expect(checkVoice(out).passed).toBe(true);
  });

  test("Alloro-as-hero phrasing is rewritten", () => {
    const t = "We saved you from a ranking dip.";
    const out = enforceVoiceOrFallback(t);
    expect(/we saved (you|your)/i.test(out)).toBe(false);
    expect(checkVoice(out).passed).toBe(true);
  });

  test("banned word 'leverage' is stripped", () => {
    const t = "We will leverage the new query data.";
    const out = enforceVoiceOrFallback(t);
    expect(/leverage/i.test(out)).toBe(false);
  });

  test("output never empty", () => {
    const t = " ";
    const out = enforceVoiceOrFallback(t);
    expect(out.length).toBeGreaterThan(0);
  });

  test("realistic doctor-facing sentence with em-dash and 'leverage' both fixed", () => {
    const t = "Alloro will leverage your new ranking signal — watching for response.";
    const out = enforceVoiceOrFallback(t);
    expect(out).not.toContain("—");
    expect(/leverage/i.test(out)).toBe(false);
    expect(checkVoice(out).passed).toBe(true);
  });
});

describe("voice constraint contract for doctor_facing_text", () => {
  test("the doctor-facing text format used by the trigger router passes voice checks", () => {
    // Mirrors the deterministic strings composed in
    // triggerRouter.composeDoctorFacingText.
    const samples = [
      'Search rank for "emergency endodontist Memphis" moved up from 8 to 4. Alloro is watching.',
      'Impressions for "Invisalign Bend" spiked 120% (50 to 110). Alloro is watching.',
      'New patient search appeared: "GentleWave specialist near me" with 142 impressions this week. Alloro is watching for next week\'s response.',
      'An AI engine stopped citing your practice for "best endodontist Bend". Alloro is watching.',
      'A competitor took the AI citation for "best endodontist Bend". Alloro is watching.',
    ];
    for (const s of samples) {
      const v = checkVoice(s);
      expect(v.passed, `voice failed for sample: "${s}" — ${v.violations.join("; ")}`).toBe(true);
    }
  });
});
