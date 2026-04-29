import type { ColumnMapping, ColumnRole } from "../../types/pmsMapping";
import { evaluateFormula } from "./productionFormula";

const UNKNOWN_MONTH = "unknown";

const findHeaderForRole = (
  mapping: ColumnMapping,
  role: ColumnRole
): string | undefined => mapping.assignments.find((a) => a.role === role)?.header;

const hasRole = (mapping: ColumnMapping, role: ColumnRole): boolean =>
  mapping.assignments.some((a) => a.role === role);

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export function parseDateToMonth(dateStr: string, fallback = UNKNOWN_MONTH): string {
  const trimmed = dateStr.trim();
  if (!trimmed) return fallback;

  const isoMatch = trimmed.match(/^(\d{4})[\-\/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}`;
  }

  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}`;
  }

  const monthNames: Record<string, string> = {
    january: "01", jan: "01", february: "02", feb: "02", march: "03", mar: "03",
    april: "04", apr: "04", may: "05", june: "06", jun: "06",
    july: "07", jul: "07", august: "08", aug: "08", september: "09", sep: "09",
    october: "10", oct: "10", november: "11", nov: "11", december: "12", dec: "12",
  };
  const monthYearMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{4})/);
  if (monthYearMatch) {
    const mm = monthNames[monthYearMatch[1].toLowerCase()];
    if (mm) return `${monthYearMatch[2]}-${mm}`;
  }

  const shortMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (shortMatch) {
    return `${shortMatch[2]}-${shortMatch[1].padStart(2, "0")}`;
  }

  return fallback;
}

export function getRowProduction(
  row: Record<string, unknown>,
  mapping: ColumnMapping
): number {
  const productionHeader = findHeaderForRole(mapping, "production_total");
  const useFormula = hasRole(mapping, "production_total")
    ? false
    : Boolean(mapping.productionFormula);

  if (useFormula) {
    return evaluateFormula(row, mapping.productionFormula);
  }

  return productionHeader ? toNumber(row[productionHeader]) : 0;
}

export function buildActualProductionByMonth(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): Map<string, number> {
  const dateHeader = findHeaderForRole(mapping, "date");
  if (!dateHeader) {
    return new Map();
  }

  const productionByMonth = new Map<string, number>();
  const statusFilter = mapping.statusFilter;

  for (const row of rows) {
    if (statusFilter) {
      const statusVal = String(row[statusFilter.column] ?? "").trim();
      const shouldInclude = statusFilter.includeValues.some(
        (v) => v.toLowerCase() === statusVal.toLowerCase()
      );
      if (!shouldInclude) continue;
    }

    const dateRaw = String(row[dateHeader] ?? "").trim();
    if (!dateRaw) continue;

    const month = parseDateToMonth(dateRaw);
    const production = getRowProduction(row, mapping);
    productionByMonth.set(month, (productionByMonth.get(month) ?? 0) + production);
  }

  return productionByMonth;
}
