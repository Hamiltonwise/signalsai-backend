/**
 * Referral Column Mapping
 *
 * On first upload per practice, reads CSV headers + first 10 rows, asks Haiku
 * to suggest which column is the referral source, the date, the amount, etc.
 * The practice manager confirms; the mapping is stored on the organizations
 * row. Future uploads with the same header structure auto-apply the stored
 * mapping. Future uploads with a different header structure re-prompt for
 * confirmation -- never silently ingested.
 *
 * Downstream consumers (referralSourceSync.findColumn, pms-preprocessor
 * findReferralColumn/findRevenueColumn, extractInstantFinding) keep their
 * existing fallback heuristics. This layer rewrites row keys to canonical
 * names like __mapped_source so the heuristics resolve them on the first try.
 */
import { createHash } from "crypto";
import { db } from "../database/connection";
import { runAgent } from "../agents/service.llm-runner";

export type MappingTarget =
  | "source"
  | "date"
  | "amount"
  | "count"
  | "patient"
  | "procedure"
  | "provider";

export interface ColumnMapping {
  source: string | null;
  date: string | null;
  amount: string | null;
  count: string | null;
  patient: string | null;
  procedure: string | null;
  provider: string | null;
}

export interface StoredMapping extends ColumnMapping {
  headersFingerprint: string;
  mappedAt: string;
  confirmedBy: "user" | "auto";
}

export interface MappingSuggestion {
  mapping: ColumnMapping;
  confidence: Partial<Record<MappingTarget, number>>;
  rationale: Partial<Record<MappingTarget, string>>;
  warnings: string[];
}

const MAPPING_MODEL = "claude-haiku-4-5-20251001";

/**
 * Stable fingerprint for a header set. Order- and case-insensitive so a CSV
 * exported with the same columns in a different order still matches.
 */
export function computeHeadersFingerprint(headers: string[]): string {
  const normalized = headers
    .map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ""))
    .filter((h) => h.length > 0)
    .sort()
    .join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

const SYSTEM_PROMPT = `You map referral CSV columns to canonical roles for a multi-vertical local-business platform (dental, home services, legal, vet, other). The user gives you the header row and 10 sample rows. You return JSON only.

Roles:
- source: which column names the referrer (a person, a practice, a campaign). NEVER a procedure code or treatment description.
- date: which column has the visit/referral/service date.
- amount: which column has revenue, production, fee, charge.
- count: which column has a referral count (1-many per row). Often absent.
- patient: which column has a patient/client name or ID.
- procedure: which column has a procedure/service code.
- provider: which column has the treating provider/doctor.

Rules:
1. Use null for any role that is not present.
2. NEVER pick a column whose values look like procedure codes (D####, CDT codes, CPT 5-digit numerics) for the source role.
3. Prefer headers like "Referring Doctor", "Referral Source", "Referred By", "Lead Source" for source over generic "Doctor" or "Provider".
4. Output JSON shape: { "mapping": { "source": "Header Name" | null, "date": ..., "amount": ..., "count": ..., "patient": ..., "procedure": ..., "provider": ... }, "confidence": { "source": 0.0-1.0, ... }, "rationale": { "source": "short reason", ... }, "warnings": ["..."] }
5. Confidence reflects your certainty given the sample. Below 0.7 means flag in warnings.

Output JSON only. No prose.`;

function buildUserMessage(headers: string[], sampleRows: Record<string, unknown>[]): string {
  const trimmedRows = sampleRows.slice(0, 10).map((row) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      const val = row[h];
      out[h] = val === null || val === undefined ? "" : String(val).slice(0, 80);
    }
    return out;
  });
  return [
    "Headers:",
    JSON.stringify(headers),
    "",
    "First 10 rows:",
    JSON.stringify(trimmedRows, null, 2),
  ].join("\n");
}

/**
 * Validate Haiku's structured response. Throws on missing/invalid shape.
 */
function validateSuggestion(parsed: unknown, headers: string[]): MappingSuggestion {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Mapping suggestion was not a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  const rawMapping = (obj.mapping || {}) as Record<string, unknown>;
  const validHeaders = new Set(headers);
  const targets: MappingTarget[] = ["source", "date", "amount", "count", "patient", "procedure", "provider"];

  const mapping: ColumnMapping = {
    source: null, date: null, amount: null, count: null, patient: null, procedure: null, provider: null,
  };
  for (const t of targets) {
    const v = rawMapping[t];
    if (typeof v === "string" && validHeaders.has(v)) {
      mapping[t] = v;
    }
  }

  const confidence: Partial<Record<MappingTarget, number>> = {};
  const rawConf = (obj.confidence || {}) as Record<string, unknown>;
  for (const t of targets) {
    const v = rawConf[t];
    if (typeof v === "number" && v >= 0 && v <= 1) confidence[t] = v;
  }

  const rationale: Partial<Record<MappingTarget, string>> = {};
  const rawRat = (obj.rationale || {}) as Record<string, unknown>;
  for (const t of targets) {
    const v = rawRat[t];
    if (typeof v === "string") rationale[t] = v.slice(0, 240);
  }

  const warnings = Array.isArray(obj.warnings)
    ? (obj.warnings as unknown[]).filter((w): w is string => typeof w === "string").slice(0, 10)
    : [];

  return { mapping, confidence, rationale, warnings };
}

/**
 * Ask Haiku to suggest a mapping. Returns the suggestion -- caller decides
 * whether to ingest immediately, surface confirmation UI, or both.
 */
export async function suggestColumnMapping(
  headers: string[],
  sampleRows: Record<string, unknown>[],
): Promise<MappingSuggestion> {
  if (!headers.length) {
    return {
      mapping: { source: null, date: null, amount: null, count: null, patient: null, procedure: null, provider: null },
      confidence: {},
      rationale: {},
      warnings: ["No columns detected in upload"],
    };
  }
  const result = await runAgent({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: buildUserMessage(headers, sampleRows),
    model: MAPPING_MODEL,
    maxTokens: 800,
    temperature: 0,
    prefill: "{",
  });
  return validateSuggestion(result.parsed, headers);
}

/**
 * Read the stored mapping for an org, if any.
 */
export async function getStoredMapping(orgId: number): Promise<StoredMapping | null> {
  const row = await db("organizations")
    .where({ id: orgId })
    .select("referral_column_mapping")
    .first();
  if (!row || !row.referral_column_mapping) return null;
  const stored = typeof row.referral_column_mapping === "string"
    ? JSON.parse(row.referral_column_mapping)
    : row.referral_column_mapping;
  return stored as StoredMapping;
}

/**
 * Persist a confirmed mapping and the headers fingerprint it was confirmed against.
 */
export async function storeMapping(
  orgId: number,
  mapping: ColumnMapping,
  headersFingerprint: string,
  confirmedBy: "user" | "auto" = "user",
): Promise<void> {
  const payload: StoredMapping = {
    ...mapping,
    headersFingerprint,
    mappedAt: new Date().toISOString(),
    confirmedBy,
  };
  await db("organizations")
    .where({ id: orgId })
    .update({ referral_column_mapping: JSON.stringify(payload) });
}

/**
 * Apply a mapping to raw rows. Returns rows where mapped roles are accessible
 * under both their original header (preserved) and a canonical __mapped_<role>
 * key. The downstream heuristic detectors fall back on substring matching --
 * the canonical key with a leading underscore is detected by their existing
 * "source", "date", "production", etc. patterns.
 */
export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
): Record<string, unknown>[] {
  const targets: MappingTarget[] = ["source", "date", "amount", "count", "patient", "procedure", "provider"];
  // Map canonical role to header that the existing heuristics will recognize.
  const canonicalKey: Record<MappingTarget, string> = {
    source: "Referral Source",
    date: "Date",
    amount: "Production",
    count: "Number of Referrals",
    patient: "Patient",
    procedure: "Procedure",
    provider: "Provider",
  };
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const t of targets) {
      const sourceHeader = mapping[t];
      if (!sourceHeader) continue;
      if (Object.prototype.hasOwnProperty.call(row, sourceHeader)) {
        const target = canonicalKey[t];
        // Only set if the canonical key isn't already in the row (don't clobber).
        if (!Object.prototype.hasOwnProperty.call(out, target)) {
          out[target] = row[sourceHeader];
        }
      }
    }
    return out;
  });
}

const PROCEDURE_CODE_PATTERN = /^(?:D\d{4}[A-Z]?|\d{4,5})$/i;

/**
 * Heuristic: does a value look like a procedure code rather than a name?
 * D#### is dental CDT; 4-5 digit numerics catch CPT codes. Used by the
 * retroactive cleanup job to find Saif's bad rows.
 */
export function looksLikeProcedureCode(value: string): boolean {
  if (!value) return false;
  return PROCEDURE_CODE_PATTERN.test(value.trim());
}
