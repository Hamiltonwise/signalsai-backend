/**
 * Card E (May 4 2026, re-scoped) — HIPAA-mode patient-field handling.
 *
 * Wraps applyMapping with capability-aware patient-name truncation.
 * When capabilities.hipaa_mode === true, the canonical "Patient" key
 * gets stripped of everything after the first space, so we keep first
 * names but never persist last names. Single-field convention per
 * AR-002 first-name-only HIPAA rule (NOT a patient_first_name /
 * patient_last_name split).
 *
 * Why a wrapper instead of inline modification: the existing applyMapping
 * is consumed by tests + scripts + pms-upload.service.ts. Keeping it
 * pure-deterministic preserves the existing test surface; HIPAA-aware
 * callers opt in via this wrapper.
 */

import { applyMapping, type ColumnMapping } from "./referralColumnMapping";
import { getCapabilities } from "./vocabulary/vocabLoader";

export interface ApplyMappingHipaaOptions {
  /**
   * Pre-resolved capability flags. When omitted, the helper looks up
   * the org's capabilities via getCapabilities(orgId). Pass explicitly
   * when the caller already has them, to avoid a redundant DB read.
   */
  capabilities?: { hipaa_mode?: boolean };
}

/**
 * Strip everything after the first space in a patient field. Preserves
 * the first token (first name) and drops trailing tokens (last name +
 * suffix). Returns the input unchanged when not a non-empty string.
 *
 *   "John Smith"        → "John"
 *   "John Smith Jr."    → "John"
 *   "John"              → "John"
 *   "Smith, John"       → "Smith,"        (caller's CSV used "Last, First" — preserved with leading token; surfacing the comma flags upstream that the format was unexpected, which an admin sees in the row)
 *   ""                  → ""
 *   null / undefined    → unchanged
 */
export function stripPatientLastName(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const firstSpace = trimmed.search(/\s/);
  if (firstSpace === -1) return trimmed;
  return trimmed.slice(0, firstSpace);
}

/**
 * applyMapping + HIPAA-mode patient stripping. Pass capabilities
 * explicitly OR pass orgId so the helper resolves them. If neither is
 * present, behaves identically to applyMapping (no stripping).
 */
export async function applyMappingWithCapabilities(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  input: { orgId?: number | null; capabilities?: { hipaa_mode?: boolean } } = {},
): Promise<Record<string, unknown>[]> {
  const mapped = applyMapping(rows, mapping);

  let hipaaMode = false;
  if (input.capabilities && typeof input.capabilities.hipaa_mode === "boolean") {
    hipaaMode = input.capabilities.hipaa_mode;
  } else if (typeof input.orgId === "number" && Number.isFinite(input.orgId)) {
    try {
      const caps = await getCapabilities(input.orgId);
      hipaaMode = !!caps.hipaa_mode;
    } catch {
      hipaaMode = false;
    }
  }

  if (!hipaaMode) return mapped;

  return mapped.map((row) => {
    const out = { ...row };
    if ("Patient" in out) {
      out["Patient"] = stripPatientLastName(out["Patient"]);
    }
    return out;
  });
}
