/**
 * PMS Column Mapping types + Zod schemas.
 *
 * Single source of truth for the column-mapping contract used by:
 *   - `src/agents/monthlyAgents/PmsColumnMapper.md`         (LLM output)
 *   - `src/utils/pms/columnMappingInference.ts`             (LLM call site)
 *   - `src/utils/pms/resolveColumnMapping.ts`               (cache resolver)
 *   - `src/utils/pms/applyColumnMapping.ts` + adapters      (apply step)
 *   - `src/models/PmsColumnMappingModel.ts`                 (persistence)
 *
 * The Zod sibling (`ColumnMappingResponseSchema`) mirrors the prior-plan
 * pattern in `src/controllers/agents/types/agent-output-schemas.ts`:
 * top-level `.strict()` to fail on unknown root keys, nested objects
 * permissive so minor LLM drift doesn't hard-fail. Confidence is bound to
 * `[0, 1]` and the role enum is tightened to a literal union.
 */

import { z } from "zod";

// ---------------------------------------------------------------------
// Role enum — the contract every layer agrees on.
// ---------------------------------------------------------------------

export type ColumnRole =
  | "date"
  | "source"
  | "referring_practice"
  | "referring_doctor"
  | "patient"
  | "type"
  | "status"
  | "production_gross"
  | "production_net"
  | "production_total"
  | "writeoffs"
  | "ignore";

export const COLUMN_ROLES: readonly ColumnRole[] = [
  "date",
  "source",
  "referring_practice",
  "referring_doctor",
  "patient",
  "type",
  "status",
  "production_gross",
  "production_net",
  "production_total",
  "writeoffs",
  "ignore",
] as const;

// ---------------------------------------------------------------------
// Production formula — addition / subtraction over named columns.
// First op is implicit `+`; subsequent ops use their explicit sign.
// ---------------------------------------------------------------------

export type ProductionFormulaTarget =
  | "production_gross"
  | "production_net"
  | "production_total";

export interface ProductionFormulaOp {
  op: "+" | "-";
  column: string;
}

export interface ProductionFormula {
  target: ProductionFormulaTarget;
  ops: ProductionFormulaOp[];
}

// ---------------------------------------------------------------------
// Status filter — applied row-wise BEFORE aggregation.
// ---------------------------------------------------------------------

export interface StatusFilter {
  column: string;
  includeValues: string[];
}

// ---------------------------------------------------------------------
// Column assignment — one entry per source-file header.
// ---------------------------------------------------------------------

export interface ColumnAssignment {
  header: string;
  role: ColumnRole;
  /** AI-set on inference; user edits set 1.0. Range: [0, 1]. */
  confidence: number;
}

// ---------------------------------------------------------------------
// The persistent shape stored in `pms_column_mappings.mapping` (jsonb).
// ---------------------------------------------------------------------

export interface ColumnMapping {
  /** Source headers in original file order. */
  headers: string[];
  /** Role assignment, one entry per header. */
  assignments: ColumnAssignment[];
  /** Set when any production_* role uses the formula builder. */
  productionFormula?: ProductionFormula;
  /** Set when a `status` role is mapped. */
  statusFilter?: StatusFilter;
}

// ---------------------------------------------------------------------
// LLM response shape (validated via Zod). The LLM returns the same
// shape as `ColumnMapping` minus the `headers` echo (we already know
// the headers — the runner re-attaches them after validation).
// ---------------------------------------------------------------------

export interface ColumnMappingResponse {
  assignments: ColumnAssignment[];
  productionFormula?: ProductionFormula;
  statusFilter?: StatusFilter;
}

// ---------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------

const columnRoleSchema = z.enum([
  "date",
  "source",
  "referring_practice",
  "referring_doctor",
  "patient",
  "type",
  "status",
  "production_gross",
  "production_net",
  "production_total",
  "writeoffs",
  "ignore",
]);

const productionFormulaTargetSchema = z.enum([
  "production_gross",
  "production_net",
  "production_total",
]);

const productionFormulaOpSchema = z.object({
  op: z.enum(["+", "-"]),
  column: z.string(),
});

const productionFormulaSchema = z.object({
  target: productionFormulaTargetSchema,
  ops: z.array(productionFormulaOpSchema),
});

const statusFilterSchema = z.object({
  column: z.string(),
  includeValues: z.array(z.string()),
});

const columnAssignmentSchema = z.object({
  header: z.string(),
  role: columnRoleSchema,
  confidence: z.number().min(0).max(1),
});

/**
 * LLM output schema. Top-level `.strict()` — unknown root keys fail.
 * Nested objects stay permissive (default). Mirrors the prior-plan pattern.
 */
export const ColumnMappingResponseSchema = z
  .object({
    assignments: z.array(columnAssignmentSchema),
    productionFormula: productionFormulaSchema.optional(),
    statusFilter: statusFilterSchema.optional(),
  })
  .strict();

export type ColumnMappingResponseZ = z.infer<
  typeof ColumnMappingResponseSchema
>;
