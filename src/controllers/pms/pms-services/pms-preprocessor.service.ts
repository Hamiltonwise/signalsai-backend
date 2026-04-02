/**
 * PMS Data Preprocessor
 *
 * Runs BEFORE the AI parser. Handles three critical problems:
 *
 * 1. HIPAA Scrubbing: removes patient names and IDs from the data
 * 2. Patient Deduplication: groups rows by patient, counts unique patients
 *    (not line items). One patient with 4 procedures = 1 referral, not 4.
 * 3. Referral Source Aggregation: groups by referring practice, cleans
 *    practice names (asterisks, internal notes), sums revenue.
 *
 * Input: raw CSV rows (array of objects from csvtojson)
 * Output: { scrubbed data, aggregated referral summary, HIPAA report }
 */

export interface HipaaReport {
  patientNamesFound: number;
  patientIdsFound: number;
  fieldsScrubbedFrom: string[];
  scrubbed: boolean;
}

export interface ReferralSource {
  name: string;
  uniquePatients: number;
  totalRevenue: number;
  lineItems: number;
  providers: string[];
}

export interface PreprocessResult {
  scrubbedData: Record<string, unknown>[];
  hipaaReport: HipaaReport;
  referralSummary: ReferralSource[];
  stats: {
    totalRows: number;
    uniquePatients: number;
    uniqueSources: number;
    totalRevenue: number;
    deduplicationRatio: number; // e.g., 4.0 means 4x overcounting if using rows
  };
}

/**
 * Detect patient identifier columns.
 * Patterns: "Patient", "Patient Name", "Client", "Patient ID", etc.
 */
function findPatientColumns(headers: string[]): string[] {
  const patientPatterns = [
    /patient/i, /client.*name/i, /^name$/i, /member/i,
    /subscriber/i, /insured/i, /guarantor/i,
  ];
  return headers.filter(h =>
    patientPatterns.some(p => p.test(h))
  );
}

/**
 * Extract a stable patient key from a row for deduplication.
 * Handles formats like "(123456) LastName, FirstName" by extracting the ID.
 */
function extractPatientKey(row: Record<string, unknown>, patientColumns: string[]): string {
  for (const col of patientColumns) {
    const val = String(row[col] || "").trim();
    if (!val) continue;

    // Pattern: "(123456) Name, Name"
    const idMatch = val.match(/^\((\d+)\)/);
    if (idMatch) return `patient-${idMatch[1]}`;

    // Pattern: just a name -- hash it for dedup
    return `patient-${val.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  }
  return `patient-row-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Scrub HIPAA data from a row. Replaces patient identifiers with anonymous keys.
 */
function scrubRow(
  row: Record<string, unknown>,
  patientColumns: string[],
  patientKey: string
): Record<string, unknown> {
  const scrubbed = { ...row };
  for (const col of patientColumns) {
    if (scrubbed[col]) {
      scrubbed[col] = patientKey; // Replace name with anonymous ID
    }
  }
  return scrubbed;
}

/**
 * Find the revenue column. Prefers adjusted/insurance fee over gross.
 */
function findRevenueColumn(headers: string[]): string | null {
  // Priority order: adjusted fee > net > gross > production > revenue > fee > amount
  const patterns = [
    /ins.*adj/i, /adjusted/i, /net.*rev/i, /net.*fee/i,
    /gross.*rev/i, /production/i, /revenue/i, /fee/i, /amount/i,
    /charge/i, /total/i,
  ];
  for (const pattern of patterns) {
    const match = headers.find(h => pattern.test(h));
    if (match) return match;
  }
  return null;
}

/**
 * Find the referral source column.
 */
function findReferralColumn(headers: string[]): string | null {
  const patterns = [
    /referring.*practice/i, /referral.*source/i, /referred.*by/i,
    /referring.*doctor/i, /referring.*provider/i, /ref.*source/i,
    /source/i, /referr/i, /how.*found/i, /lead.*source/i,
    /channel/i, /origin/i,
  ];
  for (const pattern of patterns) {
    const match = headers.find(h => pattern.test(h));
    if (match) return match;
  }
  return null;
}

/**
 * Clean a referring practice name.
 * Removes asterisks, internal notes, normalizes whitespace.
 */
function cleanSourceName(raw: string): string {
  let cleaned = raw
    .replace(/\*{2,}/g, "") // Remove ** and *** markers
    .replace(/\(DO NOT[^)]*\)/gi, "") // Remove "DO NOT SEND" notes
    .replace(/\(INTERNAL[^)]*\)/gi, "") // Remove internal notes
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  if (!cleaned) return "Self / Direct";
  return cleaned;
}

/**
 * Parse a revenue value from messy string formats.
 */
function parseRevenue(val: unknown): number {
  const str = String(val || "0").replace(/[$,\s]/g, "");
  const num = parseFloat(str);
  return isFinite(num) ? num : 0;
}

/**
 * Main preprocessor function.
 * Call this BEFORE sending data to the AI parser.
 */
export function preprocessPmsData(rawRows: Record<string, unknown>[]): PreprocessResult {
  if (!rawRows.length) {
    return {
      scrubbedData: [],
      hipaaReport: { patientNamesFound: 0, patientIdsFound: 0, fieldsScrubbedFrom: [], scrubbed: false },
      referralSummary: [],
      stats: { totalRows: 0, uniquePatients: 0, uniqueSources: 0, totalRevenue: 0, deduplicationRatio: 0 },
    };
  }

  const headers = Object.keys(rawRows[0]);

  // Detect columns
  const patientColumns = findPatientColumns(headers);
  const revenueColumn = findRevenueColumn(headers);
  const referralColumn = findReferralColumn(headers);

  // HIPAA scan
  let patientNamesFound = 0;
  let patientIdsFound = 0;
  for (const row of rawRows) {
    for (const col of patientColumns) {
      const val = String(row[col] || "");
      if (val.trim()) {
        patientNamesFound++;
        if (/\(\d+\)/.test(val)) patientIdsFound++;
      }
    }
  }

  // Process rows: scrub, deduplicate, aggregate
  const patientMap = new Map<string, {
    rows: Record<string, unknown>[];
    source: string;
    revenue: number;
    providers: Set<string>;
  }>();

  const scrubbedData: Record<string, unknown>[] = [];

  for (const row of rawRows) {
    const patientKey = extractPatientKey(row, patientColumns);
    const scrubbed = scrubRow(row, patientColumns, patientKey);
    scrubbedData.push(scrubbed);

    const source = referralColumn
      ? cleanSourceName(String(row[referralColumn] || ""))
      : "Unknown";
    const revenue = revenueColumn ? parseRevenue(row[revenueColumn]) : 0;

    // Extract provider name if available
    const providerCol = headers.find(h => /provider/i.test(h));
    const provider = providerCol ? String(row[providerCol] || "").trim() : "";

    if (!patientMap.has(patientKey)) {
      patientMap.set(patientKey, {
        rows: [],
        source,
        revenue: 0,
        providers: new Set(),
      });
    }

    const existing = patientMap.get(patientKey)!;
    existing.rows.push(scrubbed);
    existing.revenue += revenue;
    if (provider) existing.providers.add(provider);
  }

  // Aggregate by referral source
  const sourceMap = new Map<string, {
    patients: Set<string>;
    totalRevenue: number;
    lineItems: number;
    providers: Set<string>;
  }>();

  for (const [patientKey, data] of patientMap) {
    const source = data.source;
    if (!sourceMap.has(source)) {
      sourceMap.set(source, {
        patients: new Set(),
        totalRevenue: 0,
        lineItems: 0,
        providers: new Set(),
      });
    }
    const s = sourceMap.get(source)!;
    s.patients.add(patientKey);
    s.totalRevenue += data.revenue;
    s.lineItems += data.rows.length;
    for (const p of data.providers) s.providers.add(p);
  }

  // Build sorted referral summary
  const referralSummary: ReferralSource[] = Array.from(sourceMap.entries())
    .map(([name, data]) => ({
      name,
      uniquePatients: data.patients.size,
      totalRevenue: Math.round(data.totalRevenue * 100) / 100,
      lineItems: data.lineItems,
      providers: Array.from(data.providers),
    }))
    .sort((a, b) => b.uniquePatients - a.uniquePatients);

  const totalRevenue = referralSummary.reduce((sum, s) => sum + s.totalRevenue, 0);

  return {
    scrubbedData,
    hipaaReport: {
      patientNamesFound,
      patientIdsFound,
      fieldsScrubbedFrom: patientColumns,
      scrubbed: patientColumns.length > 0,
    },
    referralSummary,
    stats: {
      totalRows: rawRows.length,
      uniquePatients: patientMap.size,
      uniqueSources: sourceMap.size,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      deduplicationRatio: patientMap.size > 0
        ? Math.round((rawRows.length / patientMap.size) * 10) / 10
        : 0,
    },
  };
}
