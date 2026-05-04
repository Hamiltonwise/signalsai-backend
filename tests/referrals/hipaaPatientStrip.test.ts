/**
 * Card E (May 4 2026, re-scoped) — HIPAA-mode patient field stripping.
 *
 * The wrapper applyMappingWithCapabilities(rows, mapping, { capabilities }):
 *   capabilities.hipaa_mode === true → "John Smith" → "John"
 *   capabilities.hipaa_mode === false → unchanged
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("../../src/services/database/connection", () => ({
  db: () => ({
    where: () => ({ first: async () => null, select: async () => [] }),
  }),
}));

import {
  applyMappingWithCapabilities,
  stripPatientLastName,
} from "../../src/services/referralColumnMappingHipaa";
import type { ColumnMapping } from "../../src/services/referralColumnMapping";

const mapping: ColumnMapping = {
  source: "Referring Doctor",
  date: "Visit Date",
  amount: "Production",
  count: null,
  patient: "Patient Name",
  procedure: "Code",
  provider: null,
};

describe("stripPatientLastName", () => {
  test("'John Smith' → 'John'", () => {
    expect(stripPatientLastName("John Smith")).toBe("John");
  });
  test("'John Smith Jr.' → 'John'", () => {
    expect(stripPatientLastName("John Smith Jr.")).toBe("John");
  });
  test("single token preserved", () => {
    expect(stripPatientLastName("Madonna")).toBe("Madonna");
  });
  test("trims whitespace then drops trailing tokens", () => {
    expect(stripPatientLastName("  Carlos Rivera  ")).toBe("Carlos");
  });
  test("empty string returns empty", () => {
    expect(stripPatientLastName("")).toBe("");
  });
  test("non-string passes through unchanged", () => {
    expect(stripPatientLastName(123)).toBe(123);
    expect(stripPatientLastName(null)).toBe(null);
    expect(stripPatientLastName(undefined)).toBe(undefined);
  });
});

describe("applyMappingWithCapabilities", () => {
  const sourceRows = [
    {
      "Referring Doctor": "Dr. Lee",
      "Visit Date": "2026-04-01",
      "Production": "1200",
      "Patient Name": "John Smith",
      "Code": "D2740",
    },
    {
      "Referring Doctor": "Dr. Patel",
      "Visit Date": "2026-04-02",
      "Production": "600",
      "Patient Name": "Maria Garcia",
      "Code": "D2330",
    },
  ];

  test("hipaa_mode=true strips last names from Patient", async () => {
    const out = await applyMappingWithCapabilities(sourceRows, mapping, {
      capabilities: { hipaa_mode: true },
    });
    expect(out.length).toBe(2);
    expect(out[0]["Patient"]).toBe("John");
    expect(out[1]["Patient"]).toBe("Maria");
  });

  test("hipaa_mode=false preserves full patient name", async () => {
    const out = await applyMappingWithCapabilities(sourceRows, mapping, {
      capabilities: { hipaa_mode: false },
    });
    expect(out[0]["Patient"]).toBe("John Smith");
    expect(out[1]["Patient"]).toBe("Maria Garcia");
  });

  test("hipaa_mode=true preserves source/date/amount/procedure unchanged", async () => {
    const out = await applyMappingWithCapabilities(sourceRows, mapping, {
      capabilities: { hipaa_mode: true },
    });
    expect(out[0]["Referral Source"]).toBe("Dr. Lee");
    expect(out[0]["Date"]).toBe("2026-04-01");
    expect(out[0]["Production"]).toBe("1200");
    expect(out[0]["Procedure"]).toBe("D2740");
  });
});
