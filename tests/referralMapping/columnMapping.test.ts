import { describe, it, expect } from "vitest";
import {
  computeHeadersFingerprint,
  applyMapping,
  looksLikeProcedureCode,
  type ColumnMapping,
} from "../../src/services/referralColumnMapping";

const EMPTY_MAPPING: ColumnMapping = {
  source: null, date: null, amount: null, count: null, patient: null, procedure: null, provider: null,
};

describe("computeHeadersFingerprint", () => {
  it("is order-independent", () => {
    const a = computeHeadersFingerprint(["Date", "Source", "Amount"]);
    const b = computeHeadersFingerprint(["Source", "Amount", "Date"]);
    expect(a).toBe(b);
  });

  it("is case- and whitespace-insensitive", () => {
    const a = computeHeadersFingerprint(["Referral Source", "DATE", "amount"]);
    const b = computeHeadersFingerprint(["referralsource", "Date", "Amount"]);
    expect(a).toBe(b);
  });

  it("changes when a header is added or removed", () => {
    const a = computeHeadersFingerprint(["Date", "Source", "Amount"]);
    const b = computeHeadersFingerprint(["Date", "Source", "Amount", "Procedure"]);
    expect(a).not.toBe(b);
  });

  it("handles empty header set", () => {
    expect(computeHeadersFingerprint([])).toBeTruthy();
    expect(computeHeadersFingerprint([])).toBe(computeHeadersFingerprint([""]));
  });
});

describe("applyMapping", () => {
  it("rewrites mapped headers to canonical keys", () => {
    const rows = [
      { "Referring Doctor": "Dr. Smith", "First Visit Date": "2026-01-15", "Production": "$200" },
    ];
    const mapping: ColumnMapping = {
      ...EMPTY_MAPPING,
      source: "Referring Doctor",
      date: "First Visit Date",
      amount: "Production",
    };
    const out = applyMapping(rows, mapping);
    expect(out[0]["Referral Source"]).toBe("Dr. Smith");
    expect(out[0]["Date"]).toBe("2026-01-15");
    expect(out[0]["Production"]).toBe("$200");
    // Original keys are preserved
    expect(out[0]["Referring Doctor"]).toBe("Dr. Smith");
  });

  it("does not clobber an existing canonical key", () => {
    const rows = [
      { "Referral Source": "Existing", "Referring Doctor": "Other" },
    ];
    const mapping: ColumnMapping = { ...EMPTY_MAPPING, source: "Referring Doctor" };
    const out = applyMapping(rows, mapping);
    expect(out[0]["Referral Source"]).toBe("Existing");
  });

  it("ignores roles set to null", () => {
    const rows = [{ A: "1", B: "2" }];
    const mapping: ColumnMapping = { ...EMPTY_MAPPING, source: null };
    const out = applyMapping(rows, mapping);
    expect(out).toEqual(rows);
  });

  it("ignores mapped headers that don't exist in the row", () => {
    const rows = [{ A: "1" }];
    const mapping: ColumnMapping = { ...EMPTY_MAPPING, source: "Nonexistent" };
    const out = applyMapping(rows, mapping);
    expect(out[0]["Referral Source"]).toBeUndefined();
  });
});

describe("looksLikeProcedureCode", () => {
  it("matches CDT codes (D####)", () => {
    expect(looksLikeProcedureCode("D1110")).toBe(true);
    expect(looksLikeProcedureCode("d2740")).toBe(true);
    expect(looksLikeProcedureCode("D9223A")).toBe(true);
  });

  it("matches 4-5 digit numerics (CPT)", () => {
    expect(looksLikeProcedureCode("99213")).toBe(true);
    expect(looksLikeProcedureCode("1234")).toBe(true);
  });

  it("does not match practice names or doctor names", () => {
    expect(looksLikeProcedureCode("Dr. Smith Family Practice")).toBe(false);
    expect(looksLikeProcedureCode("Smithtown Dental")).toBe(false);
    expect(looksLikeProcedureCode("Google")).toBe(false);
    expect(looksLikeProcedureCode("Self / Direct")).toBe(false);
  });

  it("does not match short numerics that could be addresses or counts", () => {
    expect(looksLikeProcedureCode("123")).toBe(false);
    expect(looksLikeProcedureCode("12")).toBe(false);
  });

  it("handles whitespace", () => {
    expect(looksLikeProcedureCode("  D1110  ")).toBe(true);
  });

  it("returns false for empty strings", () => {
    expect(looksLikeProcedureCode("")).toBe(false);
  });
});
