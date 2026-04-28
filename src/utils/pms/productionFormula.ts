import type { ProductionFormula } from "../../types/pmsMapping";

/**
 * Production formula evaluator.
 *
 * Walks an array of `{ op, column }` ops in order, treating the first op as
 * an implicit `+` regardless of its declared sign. Missing columns are
 * coerced to 0. Negative values keep their sign (so e.g. subtracting a
 * negative writeoff equals addition).
 *
 * Pure function — no I/O.
 *
 * NOTE on `toNumber`: the spec asks us to reuse the `toNumber()` helper
 * from `src/utils/pms/pmsAggregator.ts`. That helper is currently a
 * private const (not exported). Modifying `pmsAggregator.ts` is outside
 * this phase's scope (a later integration agent owns the existing PMS
 * service files). To avoid coupling the foundation phase to that change,
 * we duplicate the helper here verbatim with a comment. When the
 * integration agent lands, that agent SHOULD promote `toNumber` to a
 * shared util and remove this copy. — D.
 */

/**
 * Convert various value types to number.
 * Mirrors `pmsAggregator.ts:toNumber()` byte-for-byte. See note above.
 */
function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Evaluate a production formula against a row.
 *
 * Examples (using the m.csv-style row {Gross: 49, Writeoffs: 0, Adj: 28}):
 *   formula = { ops: [{op:"+",column:"Gross"}, {op:"-",column:"Writeoffs"}] }
 *     → 49 - 0 = 49
 *   formula = { ops: [{op:"+",column:"Gross"}, {op:"-",column:"Writeoffs"}, {op:"-",column:"Adj"}] }
 *     → 49 - 0 - 28 = 21
 *
 * If `formula` is undefined or has no ops, returns 0. The first op's sign
 * is ignored (treated as `+`); only subsequent ops respect their sign.
 *
 * @param row - The data row, keyed by source-file header name.
 * @param formula - The formula spec from `ColumnMapping.productionFormula`.
 */
export function evaluateFormula(
  row: Record<string, unknown>,
  formula: ProductionFormula | undefined
): number {
  if (!formula || !Array.isArray(formula.ops) || formula.ops.length === 0) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < formula.ops.length; i++) {
    const { op, column } = formula.ops[i];
    const raw = row[column];
    const value = toNumber(raw);

    if (i === 0) {
      // First op is implicit `+` regardless of declared sign.
      total += value;
    } else if (op === "-") {
      total -= value;
    } else {
      total += value;
    }
  }

  return total;
}
