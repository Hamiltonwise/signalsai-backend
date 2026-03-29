/**
 * Universal PMS Upload Parser
 *
 * Accepts CSV (any format), Excel, or plain text.
 * Maps columns by CONTENT, not position.
 * Never rejects an upload — extracts what it can, flags what it can't.
 *
 * Output: ParsedRow[] compatible with the existing PMS pipeline.
 */

import * as XLSX from "xlsx";
import csv from "csvtojson";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
  month: string; // YYYY-MM
  patient_id?: string; // optional patient identifier for dedup
}

export interface ColumnMapping {
  date: number | null;
  source: number | null;
  type: number | null;
  production: number | null;
  referrals: number | null;
  patient: number | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  mapping: ColumnMapping;
  warnings: string[];
  totalInputRows: number;
  rowsParsed: number;
  rowsSkipped: number;
  monthsDetected: number;
  columnsFound: string[];
  columnsMissing: string[];
}

// ---------------------------------------------------------------------------
// Column detection patterns — scored by confidence
// ---------------------------------------------------------------------------

interface ColumnSignal {
  field: keyof ColumnMapping;
  score: number;
}

/** Header text patterns → field mapping with confidence score */
const HEADER_PATTERNS: [RegExp, ColumnSignal][] = [
  // Date columns
  [/^date$/i, { field: "date", score: 10 }],
  [/treat(ment)?[\s_-]?date/i, { field: "date", score: 10 }],
  [/appt?[\s_-]?date/i, { field: "date", score: 9 }],
  [/service[\s_-]?date/i, { field: "date", score: 9 }],
  [/visit[\s_-]?date/i, { field: "date", score: 9 }],
  [/date[\s_-]?of/i, { field: "date", score: 8 }],
  [/month/i, { field: "date", score: 7 }],
  [/period/i, { field: "date", score: 5 }],

  // Source / referral partner
  [/^source$/i, { field: "source", score: 10 }],
  [/referr(al|ed|ing)[\s_-]?(source|by|from|doctor|dr)/i, { field: "source", score: 10 }],
  [/refer(r)?ed[\s_-]?by/i, { field: "source", score: 10 }],
  [/referr(al|ing)[\s_-]?(name|partner)/i, { field: "source", score: 9 }],
  [/^referr(al)?[\s_-]?source$/i, { field: "source", score: 10 }],
  [/doctor[\s_-]?name/i, { field: "source", score: 8 }],
  [/provider/i, { field: "source", score: 7 }],
  [/partner/i, { field: "source", score: 6 }],
  [/^dr\.?\s/i, { field: "source", score: 5 }],
  [/dentist/i, { field: "source", score: 6 }],
  [/^name$/i, { field: "source", score: 4 }],

  // Type (self vs doctor referral)
  [/^type$/i, { field: "type", score: 7 }],
  [/referr(al)?[\s_-]?type/i, { field: "type", score: 10 }],
  [/patient[\s_-]?type/i, { field: "type", score: 8 }],
  [/category/i, { field: "type", score: 5 }],
  [/class(ification)?/i, { field: "type", score: 4 }],

  // Production (dollar amounts)
  [/^production$/i, { field: "production", score: 10 }],
  [/prod(uction)?[\s_-]?(amount|value|\$)/i, { field: "production", score: 10 }],
  [/revenue/i, { field: "production", score: 9 }],
  [/amount/i, { field: "production", score: 7 }],
  [/fee/i, { field: "production", score: 7 }],
  [/charge/i, { field: "production", score: 6 }],
  [/collection/i, { field: "production", score: 6 }],
  [/payment/i, { field: "production", score: 5 }],
  [/total[\s_-]?\$/i, { field: "production", score: 8 }],
  [/\$\s*amount/i, { field: "production", score: 8 }],
  [/gross/i, { field: "production", score: 6 }],

  // Referral count
  [/^referrals?$/i, { field: "referrals", score: 10 }],
  [/referr(al)?[\s_-]?count/i, { field: "referrals", score: 10 }],
  [/^count$/i, { field: "referrals", score: 6 }],
  [/patient[\s_-]?count/i, { field: "referrals", score: 8 }],
  [/new[\s_-]?patients?/i, { field: "referrals", score: 8 }],
  [/^#$/i, { field: "referrals", score: 5 }],
  [/qty|quantity/i, { field: "referrals", score: 5 }],

  // Customer/patient/client name/ID (for dedup -- universal field detection)
  [/^patient$/i, { field: "patient", score: 10 }],
  [/patient[\s_-]?(name|id)/i, { field: "patient", score: 10 }],
  [/^client$/i, { field: "patient", score: 10 }],
  [/client[\s_-]?(name|id)/i, { field: "patient", score: 10 }],
  [/^customer$/i, { field: "patient", score: 10 }],
  [/customer[\s_-]?(name|id)/i, { field: "patient", score: 10 }],
  [/^(first|last)[\s_-]?name$/i, { field: "patient", score: 7 }],
  [/^name$/i, { field: "patient", score: 3 }], // low score -- ambiguous
  [/chart[\s_-]?(number|#|id)/i, { field: "patient", score: 9 }],
  [/^id$/i, { field: "patient", score: 4 }],
  [/account[\s_-]?(number|#|id)/i, { field: "patient", score: 8 }],
  [/contact[\s_-]?(name|id)/i, { field: "patient", score: 8 }],
  [/lead[\s_-]?(name|id)/i, { field: "patient", score: 7 }],
];

// ---------------------------------------------------------------------------
// Content-based column detection (when headers are ambiguous)
// ---------------------------------------------------------------------------

function looksLikeDate(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // MM/DD/YYYY, M/D/YY, YYYY-MM-DD, "January 2025", "Jan 2025", YYYY-MM
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v) ||
    /^\d{4}[-\/]\d{1,2}([-\/]\d{1,2})?$/.test(v) ||
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}$/i.test(v) ||
    /^\d{4}[-\/]\d{2}$/.test(v);
}

function looksLikeMoney(value: string): boolean {
  const v = value.trim();
  return /^\$?\s*[\d,]+\.?\d*$/.test(v) && parseFloat(v.replace(/[$,\s]/g, "")) > 10;
}

function looksLikeType(value: string): boolean {
  const v = value.trim().toLowerCase();
  return ["self", "doctor", "dr", "internal", "external", "referral", "self-referral",
    "doctor referral", "self referral", "patient", "walk-in", "walkin", "web", "website",
    "google", "online", "marketing", "ad", "insurance"].includes(v);
}

function looksLikeSmallInt(value: string): boolean {
  const v = value.trim();
  const n = parseInt(v, 10);
  return /^\d{1,4}$/.test(v) && n >= 0 && n < 10000;
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06",
  jul: "07", july: "07", aug: "08", august: "08", sep: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12",
};

function parseDateToMonth(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const iso = v.match(/^(\d{4})[-\/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}`;

  // MM/DD/YYYY or M/D/YYYY
  const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${year}-${mdy[1].padStart(2, "0")}`;
  }

  // "January 2025" or "Jan 2025"
  const named = v.match(/^(\w+)\s+(\d{4})$/i);
  if (named) {
    const month = MONTH_NAMES[named[1].toLowerCase()];
    if (month) return `${named[2]}-${month}`;
  }

  // YYYY-MM
  const ym = v.match(/^(\d{4})-(\d{2})$/);
  if (ym) return `${ym[1]}-${ym[2]}`;

  // Excel serial date (5-digit number)
  const serial = parseInt(v, 10);
  if (serial > 40000 && serial < 50000) {
    const d = new Date((serial - 25569) * 86400000);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Production parsing
// ---------------------------------------------------------------------------

function parseProduction(value: string): number {
  const v = value.trim().replace(/[$,\s]/g, "");
  const n = parseFloat(v);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

function inferType(value: string): "self" | "doctor" {
  const v = value.trim().toLowerCase();
  const selfPatterns = ["self", "internal", "walk-in", "walkin", "web", "website",
    "google", "online", "marketing", "ad", "self-referral", "self referral",
    "patient", "direct", "social"];
  if (selfPatterns.some((p) => v.includes(p))) return "self";
  return "doctor";
}

// ---------------------------------------------------------------------------
// CSV / text parsing
// ---------------------------------------------------------------------------

function detectDelimiter(text: string): string {
  const firstLines = text.split("\n").slice(0, 5).join("\n");
  const tabs = (firstLines.match(/\t/g) || []).length;
  const commas = (firstLines.match(/,/g) || []).length;
  const pipes = (firstLines.match(/\|/g) || []).length;
  if (tabs >= commas && tabs >= pipes) return "\t";
  if (pipes > commas) return "|";
  return ",";
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t" || delimiter === "|") {
    return line.split(delimiter).map((c) => c.trim());
  }
  // Quote-aware CSV split
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { fields.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function textToRows(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => splitLine(line, delimiter));
}

// ---------------------------------------------------------------------------
// File → rows conversion
// ---------------------------------------------------------------------------

export async function fileToRows(
  buffer: Buffer,
  filename: string,
): Promise<string[][]> {
  const name = filename.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    return rows.map((row) => row.map(String));
  }

  // CSV / TXT / anything text-based
  const text = buffer.toString("utf-8");
  return textToRows(text);
}

export function plainTextToRows(text: string): string[][] {
  return textToRows(text);
}

// ---------------------------------------------------------------------------
// Column mapping — the core intelligence
// ---------------------------------------------------------------------------

export function detectColumns(
  rows: string[][],
): { mapping: ColumnMapping; headerRow: number; warnings: string[] } {
  const warnings: string[] = [];

  if (rows.length === 0) {
    return {
      mapping: { date: null, source: null, type: null, production: null, referrals: null, patient: null },
      headerRow: -1,
      warnings: ["No data rows found in upload."],
    };
  }

  // Phase 1: Score each column in the first row (potential header) against header patterns
  const headerCandidates = rows[0];
  const columnScores: Map<number, Map<keyof ColumnMapping, number>> = new Map();

  for (let col = 0; col < headerCandidates.length; col++) {
    const scores = new Map<keyof ColumnMapping, number>();
    const headerText = headerCandidates[col].trim();

    for (const [pattern, signal] of HEADER_PATTERNS) {
      if (pattern.test(headerText)) {
        const current = scores.get(signal.field) || 0;
        scores.set(signal.field, Math.max(current, signal.score));
      }
    }
    columnScores.set(col, scores);
  }

  // Phase 2: Content analysis on data rows (rows 1-10) to boost/confirm
  const sampleRows = rows.slice(1, Math.min(11, rows.length));

  for (let col = 0; col < headerCandidates.length; col++) {
    const values = sampleRows.map((r) => r[col] || "").filter(Boolean);
    if (values.length === 0) continue;

    const scores = columnScores.get(col) || new Map<keyof ColumnMapping, number>();

    const dateCount = values.filter(looksLikeDate).length;
    const moneyCount = values.filter(looksLikeMoney).length;
    const typeCount = values.filter(looksLikeType).length;
    const smallIntCount = values.filter(looksLikeSmallInt).length;

    const ratio = values.length;

    if (dateCount / ratio > 0.5) {
      scores.set("date", (scores.get("date") || 0) + 6);
    }
    if (moneyCount / ratio > 0.5) {
      scores.set("production", (scores.get("production") || 0) + 6);
    }
    if (typeCount / ratio > 0.5) {
      scores.set("type", (scores.get("type") || 0) + 6);
    }
    // Columns that are mostly small ints and NOT money → likely referral counts
    if (smallIntCount / ratio > 0.5 && moneyCount / ratio < 0.3) {
      scores.set("referrals", (scores.get("referrals") || 0) + 4);
    }
    // Columns with diverse text values → likely source names
    const uniqueValues = new Set(values.map((v) => v.toLowerCase()));
    if (
      uniqueValues.size > 2 &&
      dateCount / ratio < 0.3 &&
      moneyCount / ratio < 0.1 &&
      smallIntCount / ratio < 0.3
    ) {
      scores.set("source", (scores.get("source") || 0) + 4);
    }

    columnScores.set(col, scores);
  }

  // Phase 3: Greedy assignment — highest score per field, no column reuse
  const mapping: ColumnMapping = { date: null, source: null, type: null, production: null, referrals: null, patient: null };
  const usedCols = new Set<number>();
  const fields: (keyof ColumnMapping)[] = ["date", "source", "production", "type", "referrals", "patient"];

  // Sort fields by their best available score (descending) so highest-confidence fields claim columns first
  const fieldBestScores = fields.map((field) => {
    let best = 0;
    for (const [col, scores] of columnScores) {
      best = Math.max(best, scores.get(field) || 0);
    }
    return { field, best };
  }).sort((a, b) => b.best - a.best);

  for (const { field } of fieldBestScores) {
    let bestCol = -1;
    let bestScore = 0;
    for (const [col, scores] of columnScores) {
      if (usedCols.has(col)) continue;
      const score = scores.get(field) || 0;
      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }
    if (bestCol >= 0 && bestScore >= 3) {
      mapping[field] = bestCol;
      usedCols.add(bestCol);
    }
  }

  // Determine if row 0 is a header or data
  // If the first row has cells that look like actual data values (dates, money),
  // it's data, not a header. If cells match header patterns but NOT data patterns, it's a header.
  let firstRowIsData = false;
  for (let col = 0; col < headerCandidates.length; col++) {
    const cell = headerCandidates[col].trim();
    if (looksLikeDate(cell) || looksLikeMoney(cell)) {
      firstRowIsData = true;
      break;
    }
  }
  // Also check: if NO header patterns matched with score >= 5, treat as data
  if (!firstRowIsData) {
    let anyStrongHeaderMatch = false;
    for (const [, scores] of columnScores) {
      for (const [, score] of scores) {
        if (score >= 5) { anyStrongHeaderMatch = true; break; }
      }
      if (anyStrongHeaderMatch) break;
    }
    if (!anyStrongHeaderMatch) firstRowIsData = true;
  }
  const headerRow = firstRowIsData ? -1 : 0;

  // Report what we found and what's missing
  const found: string[] = [];
  const missing: string[] = [];
  for (const field of fields) {
    if (mapping[field] !== null) {
      found.push(field);
    } else {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    warnings.push(
      `Could not detect column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
      `Defaults will be used.`,
    );
  }

  if (mapping.date === null) {
    warnings.push("No date column found — all rows assigned to current month.");
  }
  if (mapping.source === null) {
    warnings.push("No source/referral column found — all rows assigned to 'Unknown Source'.");
  }

  return { mapping, headerRow, warnings };
}

// ---------------------------------------------------------------------------
// Parse rows into PMS data using detected mapping
// ---------------------------------------------------------------------------

export function parseRows(
  rows: string[][],
  mapping: ColumnMapping,
  headerRow: number,
): { parsed: ParsedRow[]; warnings: string[]; skipped: number } {
  const warnings: string[] = [];
  const parsed: ParsedRow[] = [];
  let skipped = 0;

  const dataStart = headerRow >= 0 ? headerRow + 1 : 0;
  const fallbackMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell) => !cell.trim())) {
      skipped++;
      continue; // skip blank rows
    }

    // Extract values from mapped columns
    const dateVal = mapping.date !== null ? (row[mapping.date] || "") : "";
    const sourceVal = mapping.source !== null ? (row[mapping.source] || "") : "";
    const typeVal = mapping.type !== null ? (row[mapping.type] || "") : "";
    const prodVal = mapping.production !== null ? (row[mapping.production] || "") : "";
    const refVal = mapping.referrals !== null ? (row[mapping.referrals] || "") : "";
    const patientVal = mapping.patient !== null ? (row[mapping.patient] || "") : "";

    // Parse date → month
    const month = parseDateToMonth(dateVal) || fallbackMonth;

    // Parse source
    const source = sourceVal.trim() || "Unknown Source";

    // Parse type
    const type = typeVal ? inferType(typeVal) : (
      // Heuristic: if source looks like a doctor name, infer "doctor"
      /^(dr\.?\s|doctor)/i.test(source) ? "doctor" : "self"
    );

    // Parse production
    const production = prodVal ? parseProduction(prodVal) : 0;

    // Parse referrals (default 1 per row if no referrals column)
    const referrals = refVal ? (parseInt(refVal.replace(/[,\s]/g, ""), 10) || 1) : 1;

    // Patient ID for dedup (one patient = one referral regardless of treatment count)
    const patient_id = patientVal.trim() || undefined;

    parsed.push({ source, type, referrals, production, month, patient_id });
  }

  return { parsed, warnings, skipped };
}

// ---------------------------------------------------------------------------
// Main entry point — the universal parser
// ---------------------------------------------------------------------------

export async function parsePmsUpload(
  buffer: Buffer,
  filename: string,
): Promise<ParseResult> {
  const allWarnings: string[] = [];

  // 1. Convert file to rows
  let rows: string[][];
  try {
    rows = await fileToRows(buffer, filename);
  } catch (err: any) {
    allWarnings.push(`File conversion warning: ${err.message}`);
    // Try treating it as plain text
    rows = plainTextToRows(buffer.toString("utf-8"));
  }

  if (rows.length === 0) {
    return {
      rows: [],
      mapping: { date: null, source: null, type: null, production: null, referrals: null, patient: null },
      warnings: ["Upload appears empty. No data rows could be extracted."],
      totalInputRows: 0,
      rowsParsed: 0,
      rowsSkipped: 0,
      monthsDetected: 0,
      columnsFound: [],
      columnsMissing: ["date", "source", "type", "production", "referrals"],
    };
  }

  // 2. Detect column mapping
  const { mapping, headerRow, warnings: detectWarnings } = detectColumns(rows);
  allWarnings.push(...detectWarnings);

  // 3. Parse rows using mapping
  const { parsed, warnings: parseWarnings, skipped } = parseRows(rows, mapping, headerRow);
  allWarnings.push(...parseWarnings);

  // 4. Compute stats
  const months = new Set(parsed.map((r) => r.month));

  const fields: (keyof ColumnMapping)[] = ["date", "source", "type", "production", "referrals", "patient"];
  const columnsFound = fields.filter((f) => mapping[f] !== null);
  const columnsMissing = fields.filter((f) => mapping[f] === null);

  return {
    rows: parsed,
    mapping,
    warnings: allWarnings,
    totalInputRows: rows.length - (headerRow >= 0 ? 1 : 0),
    rowsParsed: parsed.length,
    rowsSkipped: skipped,
    monthsDetected: months.size,
    columnsFound,
    columnsMissing,
  };
}

/**
 * Parse raw pasted text (not a file upload).
 */
export function parsePmsText(text: string): ParseResult {
  const rows = plainTextToRows(text);

  if (rows.length === 0) {
    return {
      rows: [],
      mapping: { date: null, source: null, type: null, production: null, referrals: null, patient: null },
      warnings: ["No data could be extracted from pasted text."],
      totalInputRows: 0,
      rowsParsed: 0,
      rowsSkipped: 0,
      monthsDetected: 0,
      columnsFound: [],
      columnsMissing: ["date", "source", "type", "production", "referrals"],
    };
  }

  const { mapping, headerRow, warnings: detectWarnings } = detectColumns(rows);
  const { parsed, warnings: parseWarnings, skipped } = parseRows(rows, mapping, headerRow);
  const months = new Set(parsed.map((r) => r.month));
  const fields: (keyof ColumnMapping)[] = ["date", "source", "type", "production", "referrals", "patient"];

  return {
    rows: parsed,
    mapping,
    warnings: [...detectWarnings, ...parseWarnings],
    totalInputRows: rows.length - (headerRow >= 0 ? 1 : 0),
    rowsParsed: parsed.length,
    rowsSkipped: skipped,
    monthsDetected: months.size,
    columnsFound: fields.filter((f) => mapping[f] !== null),
    columnsMissing: fields.filter((f) => mapping[f] === null),
  };
}
