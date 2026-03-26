/**
 * PMS Paste-Parse Service
 *
 * Pure JS parsing for fixed-column PMS data:
 *   Col 0: Treatment Date
 *   Col 1: Source
 *   Col 2: Type (self | doctor)
 *   Col 3: Production
 *
 * Each row = 1 referral. No AI needed for parsing.
 * Stateless — no database writes.
 */

export interface ParsedRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
  month: string; // YYYY-MM
  patient_id?: string; // optional patient identifier for dedup
}

export interface PasteParseResult {
  rows: ParsedRow[];
  warnings: string[];
  rowsParsed: number;
  monthsDetected: number;
}

/**
 * Detect delimiter: tab (pasted from spreadsheet) or comma (CSV file).
 */
function detectDelimiter(line: string): "\t" | "," {
  return line.includes("\t") ? "\t" : ",";
}

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles: "field with, comma" and "field with ""escaped"" quotes"
 * Only needed for comma-delimited CSV files — tab splits are safe as-is.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ("") or end of quoted field
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Split a data line into columns based on delimiter.
 * Tab-delimited: simple split (pasted from spreadsheet).
 * Comma-delimited: quote-aware CSV parsing (exported CSV files).
 */
function splitLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((c) => c.trim());
  }
  return parseCSVLine(line).map((c) => c.trim());
}

/**
 * Parse a date string into YYYY-MM format.
 * Handles: MM/DD/YYYY, YYYY-MM-DD, "January 2025", "Jan 2025", etc.
 */
function parseDateToMonth(dateStr: string, fallback: string): string {
  const trimmed = dateStr.trim();
  if (!trimmed) return fallback;

  // Try YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[\-\/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}`;
  }

  // Try MM/DD/YYYY or M/D/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}`;
  }

  // Try "Month Year" or "Mon Year" (e.g. "January 2025", "Jan 2025")
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

  // Try M/YYYY
  const shortMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (shortMatch) {
    return `${shortMatch[2]}-${shortMatch[1].padStart(2, "0")}`;
  }

  return fallback;
}

/**
 * Parse a production value string to number.
 * Strips $, commas, whitespace. Returns 0 for unparseable.
 */
function parseProduction(val: string): number {
  const cleaned = val.replace(/[$,\s]/g, "").trim();
  const num = Number(cleaned);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Clean special characters from a source name.
 * Keeps: letters, numbers, spaces, dots, commas, dashes, em dashes,
 * parentheses, ampersands, apostrophes, forward slashes.
 * Strips: asterisks, #, @, ~, ^, {, }, [, ], <, >, |, \, =, +, _, etc.
 * Collapses multiple spaces and trims.
 */
function cleanSourceName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9\s.\,\-\—\(\)&'\/]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Normalize type string to "self" | "doctor".
 */
function parseType(val: string): "self" | "doctor" {
  const lower = val.toLowerCase().trim();
  if (lower === "doctor" || lower === "dr" || lower === "doc") return "doctor";
  return "self";
}

/**
 * Parse pasted text with fixed column structure.
 * Returns flat array of ParsedRow (one per input row).
 */
export function parsePastedData(
  rawText: string,
  currentMonth: string
): PasteParseResult {
  if (!rawText || rawText.trim().length === 0) {
    throw Object.assign(new Error("No data provided to parse"), {
      statusCode: 400,
    });
  }

  const lines = rawText.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw Object.assign(new Error("Data must have a header row and at least one data row"), {
      statusCode: 400,
    });
  }

  const delimiter = detectDelimiter(lines[0]);
  const dataLines = lines.slice(1); // skip header

  console.log(
    `[PMS-Paste] Parsing ${dataLines.length} data rows (delimiter: ${delimiter === "\t" ? "TAB" : "COMMA"})`
  );

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const monthsSet = new Set<string>();

  for (let i = 0; i < dataLines.length; i++) {
    const cols = splitLine(dataLines[i], delimiter);

    // Need at least 4 columns: date, source, type, production
    if (cols.length < 4) {
      warnings.push(`Row ${i + 2}: skipped — expected 4 columns, got ${cols.length}`);
      continue;
    }

    const [dateStr, source, typeStr, productionStr, ...extraCols] = cols;

    const month = parseDateToMonth(dateStr, currentMonth);
    const type = parseType(typeStr);
    const production = parseProduction(productionStr);

    // Extra columns may contain patient name/ID — use first non-empty extra
    // column as a dedup key. Common PMS exports include patient name in col 5+.
    const patientId = extraCols
      .map((c) => c.trim())
      .find((c) => c.length > 0 && !/^\$?[\d,.]+$/.test(c)) || undefined;

    monthsSet.add(month);
    rows.push({
      source: cleanSourceName(source) || "Unknown",
      type,
      referrals: 1, // each row = 1 treatment (deduped to patients in sanitization)
      production,
      month,
      patient_id: patientId,
    });
  }

  if (rows.length === 0) {
    throw Object.assign(
      new Error("No parseable data found. Make sure the pasted content has Date, Source, Type, Production columns."),
      { statusCode: 400 }
    );
  }

  console.log(
    `[PMS-Paste] Parsed ${rows.length} rows across ${monthsSet.size} month(s)`
  );

  return {
    rows,
    warnings,
    rowsParsed: rows.length,
    monthsDetected: monthsSet.size,
  };
}
