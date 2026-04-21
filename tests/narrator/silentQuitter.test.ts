import { describe, test, expect } from "vitest";
import { classify } from "../../src/services/narrator/silentQuitterDetector";

describe("Silent Quitter classifier (Mehta rule)", () => {
  test("login drop + email engagement held → success.relief_of_knowing", () => {
    const result = classify({
      baselineLoginsPerWeek: 4,
      recentLoginsPerWeek: 1,
      baselineEmailOpenRate: 0.72,
      recentEmailOpenRate: 0.68,
    });
    expect(result.classification).toBe("success.relief_of_knowing");
    expect(result.loginDrop).toBe(true);
    expect(result.emailHeld).toBe(true);
  });

  test("login drop + email engagement collapsed → churn.silent_quitter_risk", () => {
    const result = classify({
      baselineLoginsPerWeek: 4,
      recentLoginsPerWeek: 1,
      baselineEmailOpenRate: 0.72,
      recentEmailOpenRate: 0.05,
    });
    expect(result.classification).toBe("churn.silent_quitter_risk");
    expect(result.loginDrop).toBe(true);
    expect(result.emailHeld).toBe(false);
  });

  test("logins normal → no_signal (never emit alarm when owner is active)", () => {
    const result = classify({
      baselineLoginsPerWeek: 4,
      recentLoginsPerWeek: 3,
      baselineEmailOpenRate: 0.72,
      recentEmailOpenRate: 0.3,
    });
    expect(result.classification).toBe("no_signal");
    expect(result.loginDrop).toBe(false);
  });

  test("both drop but not collapsed → still churn risk (protected)", () => {
    const result = classify({
      baselineLoginsPerWeek: 4,
      recentLoginsPerWeek: 1,
      baselineEmailOpenRate: 0.72,
      recentEmailOpenRate: 0.35,
    });
    expect(result.classification).toBe("churn.silent_quitter_risk");
  });
});
