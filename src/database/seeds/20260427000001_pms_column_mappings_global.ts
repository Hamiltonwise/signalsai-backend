/**
 * Global library seed for the PMS column-mapping system.
 *
 * Seeds two engineering-curated mappings (per spec D4):
 *
 *   1. Alloro 4-col template — pre-aggregated. Each row is one referral.
 *      Roles: source, type, production_total, date.
 *      `require_confirmation = false`: this is the canonical Alloro shape;
 *      Tier-2 hits silently apply with no banner.
 *
 *   2. Open Dental–style procedure log (derived from m.csv).
 *      Roles: date, patient, status (filter "Done"), referring_practice,
 *      referring_doctor, formula production_net = +Gross −Writeoffs −AdjFee.
 *      `require_confirmation = true`: the user MUST verify on first use
 *      because procedure-log shapes vary per vendor.
 *
 * Idempotent: the partial unique index
 * `(header_signature) WHERE is_global = true` makes re-runs no-ops via
 * `seedGlobal`'s "find then insert" pattern.
 *
 * Usage (per knex CLI):
 *   npx knex seed:run --specific=20260427000001_pms_column_mappings_global.ts
 */

import type { Knex } from "knex";
import { signHeaders } from "../../utils/pms/headerSignature";
import { PmsColumnMappingModel } from "../../models/PmsColumnMappingModel";
import type { ColumnMapping } from "../../types/pmsMapping";

// ---------------------------------------------------------------------
// Entry 1 — Alloro 4-col template
// ---------------------------------------------------------------------
//
// Original header capture order (file): "Treatment Date", "Source",
// "Type", "Production". The signature is computed against the
// post-`normalizeHeader` form; in this case the inputs to signHeaders
// are already in normalized form (no spaces / punctuation), but we
// still pass them through to keep the call shape consistent with
// runtime resolution.

const ALLORO_TEMPLATE_NORMALIZED_HEADERS = [
  "treatmentdate",
  "source",
  "type",
  "production",
];

const ALLORO_TEMPLATE_MAPPING: ColumnMapping = {
  headers: ["Treatment Date", "Source", "Type", "Production"],
  assignments: [
    { header: "Treatment Date", role: "date", confidence: 1.0 },
    { header: "Source", role: "source", confidence: 1.0 },
    { header: "Type", role: "type", confidence: 1.0 },
    { header: "Production", role: "production_total", confidence: 1.0 },
  ],
};

// ---------------------------------------------------------------------
// Entry 2 — Open Dental–style procedure log (derived from m.csv)
// ---------------------------------------------------------------------

const OPEN_DENTAL_HEADERS = [
  "Treatment Date",
  "Procedure",
  "Status",
  "Gross Revenue",
  "Ins. Adj. Fee.",
  "Total Writeoffs",
  "Patient",
  "Provider",
  "Location",
  "Referring Practice",
  "Referring User",
];

const OPEN_DENTAL_MAPPING: ColumnMapping = {
  headers: OPEN_DENTAL_HEADERS,
  assignments: [
    { header: "Treatment Date", role: "date", confidence: 1.0 },
    { header: "Procedure", role: "ignore", confidence: 1.0 },
    { header: "Status", role: "status", confidence: 1.0 },
    { header: "Gross Revenue", role: "ignore", confidence: 1.0 },
    { header: "Ins. Adj. Fee.", role: "ignore", confidence: 1.0 },
    { header: "Total Writeoffs", role: "ignore", confidence: 1.0 },
    { header: "Patient", role: "patient", confidence: 1.0 },
    { header: "Provider", role: "ignore", confidence: 1.0 },
    { header: "Location", role: "ignore", confidence: 1.0 },
    { header: "Referring Practice", role: "referring_practice", confidence: 1.0 },
    { header: "Referring User", role: "referring_doctor", confidence: 1.0 },
  ],
  productionFormula: {
    target: "production_net",
    ops: [
      { op: "+", column: "Gross Revenue" },
      { op: "-", column: "Total Writeoffs" },
      { op: "-", column: "Ins. Adj. Fee." },
    ],
  },
  statusFilter: {
    column: "Status",
    includeValues: ["Done"],
  },
};

export async function seed(knex: Knex): Promise<void> {
  // Compute signatures via the same pure function used at runtime, so the
  // seeded keys match what the resolver will look up.
  const alloroTemplateSig = signHeaders(ALLORO_TEMPLATE_NORMALIZED_HEADERS);
  const openDentalSig = signHeaders(OPEN_DENTAL_HEADERS);

  await PmsColumnMappingModel.seedGlobal(
    alloroTemplateSig,
    ALLORO_TEMPLATE_MAPPING,
    /* requireConfirmation */ false,
    knex
  );

  await PmsColumnMappingModel.seedGlobal(
    openDentalSig,
    OPEN_DENTAL_MAPPING,
    /* requireConfirmation */ true,
    knex
  );

  console.log(
    `[seed pms_column_mappings] alloro_template=${alloroTemplateSig} ` +
      `open_dental=${openDentalSig}`
  );
}
