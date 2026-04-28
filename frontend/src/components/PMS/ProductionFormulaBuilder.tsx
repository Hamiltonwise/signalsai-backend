/**
 * ProductionFormulaBuilder Component
 *
 * Lets the user compose a production formula as an array of `+` / `-` ops
 * over column names, e.g. `Gross Revenue − Total Writeoffs − Ins. Adj. Fee.`.
 *
 * The formula targets one of three production roles (billed / collected /
 * already-summed) and is evaluated per row by the backend pipeline. We mirror
 * the backend evaluator inline to render a live preview against `sampleRow`.
 *
 * Reference analog: PMSManualEntryModal.tsx (Tailwind styling), spec D7
 * (formula shape: array of ops, first element implicit `+`).
 */

import React, { useMemo } from "react";
import { Plus, Minus, X } from "lucide-react";
import type { ProductionFormula, ProductionFormulaOp } from "../../api/pms";

interface ProductionFormulaBuilderProps {
  availableColumns: string[];
  sampleRow?: Record<string, unknown>;
  value: ProductionFormula | undefined;
  onChange: (next: ProductionFormula | undefined) => void;
}

const ALORO_ORANGE = "#C9765E";

/**
 * Mirror of backend `toNumber` from src/utils/pms/pmsAggregator.ts.
 * Coerces currency-formatted strings ("$1,234.56", "(91.6)") to numbers.
 */
function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  // Parenthesised negatives e.g. "(91.6)"
  const parenMatch = raw.match(/^\(([^)]+)\)$/);
  const inner = parenMatch ? parenMatch[1] : raw;

  // Strip currency symbols and commas, but keep leading minus
  const stripped = inner.replace(/[$,\s]/g, "");
  const parsed = Number(stripped);
  if (!Number.isFinite(parsed)) return 0;

  return parenMatch ? -parsed : parsed;
}

/**
 * Inline evaluator mirroring src/utils/pms/productionFormula.ts.
 * Pure function — no I/O, no side effects.
 */
function evaluateFormula(
  row: Record<string, unknown>,
  formula: ProductionFormula | undefined
): number {
  if (!formula || !formula.ops.length) return 0;
  let total = 0;
  formula.ops.forEach((op, idx) => {
    const value = toNumber(row[op.column]);
    const sign = idx === 0 ? 1 : op.op === "-" ? -1 : 1;
    total += sign * value;
  });
  return total;
}

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `−$${formatted}` : `$${formatted}`;
}

export const ProductionFormulaBuilder: React.FC<ProductionFormulaBuilderProps> = ({
  availableColumns,
  sampleRow,
  value,
  onChange,
}) => {
  const formula: ProductionFormula = useMemo(
    () =>
      value ?? {
        target: "production_net",
        ops: [],
      },
    [value]
  );

  const updateOp = (index: number, patch: Partial<ProductionFormulaOp>) => {
    const nextOps = formula.ops.map((op, i) =>
      i === index ? { ...op, ...patch } : op
    );
    onChange({ ...formula, ops: nextOps });
  };

  const removeOp = (index: number) => {
    const nextOps = formula.ops.filter((_, i) => i !== index);
    if (nextOps.length === 0) {
      onChange(undefined);
      return;
    }
    onChange({ ...formula, ops: nextOps });
  };

  const appendOp = (op: "+" | "-") => {
    const next: ProductionFormula = {
      ...formula,
      ops: [...formula.ops, { op, column: "" }],
    };
    onChange(next);
  };

  const previewValue = useMemo(() => {
    if (!sampleRow || !formula.ops.length) return null;
    if (formula.ops.some((o) => !o.column)) return null;
    return evaluateFormula(sampleRow, formula);
  }, [sampleRow, formula]);

  const previewExpression = useMemo(() => {
    if (!sampleRow || !formula.ops.length) return null;
    return formula.ops
      .map((op, idx) => {
        const valStr = formatCurrency(toNumber(sampleRow[op.column]));
        return idx === 0 ? valStr : `${op.op === "-" ? "−" : "+"} ${valStr}`;
      })
      .join(" ");
  }, [sampleRow, formula]);

  return (
    <div className="space-y-2">
      {/* Ops list */}
      <div className="space-y-2">
        {formula.ops.length === 0 && (
          <p className="text-xs text-gray-400 italic px-1">
            Add at least one column to start the formula.
          </p>
        )}
        {formula.ops.map((op, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {/* Op selector or implicit + */}
            {idx === 0 ? (
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 text-sm font-semibold"
                title="First column is always added"
              >
                +
              </span>
            ) : (
              <select
                value={op.op}
                onChange={(e) =>
                  updateOp(idx, { op: e.target.value as "+" | "-" })
                }
                className="h-9 w-12 rounded-lg border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
              >
                <option value="+">+</option>
                <option value="-">−</option>
              </select>
            )}

            {/* Column dropdown */}
            <select
              value={op.column}
              onChange={(e) => updateOp(idx, { column: e.target.value })}
              className="flex-1 h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
            >
              <option value="">Select column…</option>
              {availableColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeOp(idx)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-red-600 hover:border-red-200 transition-colors"
              aria-label="Remove this column from the formula"
              title="Remove column"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add / subtract buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => appendOp("+")}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Plus size={12} />
          Add column
        </button>
        <button
          type="button"
          onClick={() => appendOp("-")}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Minus size={12} />
          Subtract column
        </button>
      </div>

      {/* Live preview */}
      {sampleRow && previewValue !== null && previewExpression && (
        <div
          className="rounded-lg border bg-white px-3 py-2 text-xs"
          style={{ borderColor: `${ALORO_ORANGE}55` }}
        >
          <span className="text-gray-500">Preview (row 1):</span>{" "}
          <span className="font-mono text-gray-700">{previewExpression}</span>{" "}
          <span className="text-gray-400">=</span>{" "}
          <span
            className="font-semibold"
            style={{ color: ALORO_ORANGE }}
          >
            {formatCurrency(previewValue)}
          </span>
        </div>
      )}
    </div>
  );
};
