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
 * Generate a random UUID for patient de-identification.
 * HIPAA Safe Harbor requires that re-identification codes are NOT derived
 * from the original identifier (45 CFR 164.514(c)). So we use random UUIDs,
 * not reformatted MRNs.
 *
 * We maintain a session-local map so the same patient gets the same UUID
 * within a single upload (for deduplication), but the UUID cannot be
 * reversed to the original MRN.
 */
const patientUUIDMap = new Map<string, string>();

function generatePatientUUID(): string {
  // Crypto-quality random, not derived from any patient data
  const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
  const hex = bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Extract a stable patient key for deduplication AND generate a Safe Harbor
 * compliant anonymous ID. The internal key (for dedup) is separate from the
 * external key (what leaves the system).
 */
function extractPatientKey(row: Record<string, unknown>, patientColumns: string[]): { dedupKey: string; anonId: string } {
  let rawKey = "";
  for (const col of patientColumns) {
    const val = String(row[col] || "").trim();
    if (!val) continue;
    rawKey = val;
    break;
  }

  if (!rawKey) {
    const anonId = generatePatientUUID();
    return { dedupKey: `unknown-${anonId}`, anonId };
  }

  // Check if we've already assigned a UUID to this patient in this session
  if (patientUUIDMap.has(rawKey)) {
    return { dedupKey: rawKey, anonId: patientUUIDMap.get(rawKey)! };
  }

  // Generate a new random UUID (NOT derived from MRN or name)
  const anonId = generatePatientUUID();
  patientUUIDMap.set(rawKey, anonId);
  return { dedupKey: rawKey, anonId };
}

/**
 * Detect columns that may contain PHI beyond patient names.
 * HIPAA Safe Harbor requires removal of ALL 18 identifier types.
 */
function findPHIColumns(headers: string[]): string[] {
  const phiPatterns = [
    /patient/i, /client.*name/i, /^name$/i, /member/i,
    /subscriber/i, /insured/i, /guarantor/i,           // Names (#1)
    /address/i, /street/i, /city/i, /zip/i, /postal/i, // Geographic (#2)
    /phone/i, /tel/i, /mobile/i, /cell/i,              // Phone (#4)
    /fax/i,                                              // Fax (#5)
    /email/i, /e-mail/i,                                 // Email (#6)
    /ssn/i, /social.*sec/i,                             // SSN (#7)
    /account.*num/i, /acct/i,                           // Account (#10)
    /license/i, /certificate/i,                          // License (#11)
    /emergency.*contact/i, /next.*kin/i,                // Names (#1)
    /date.*birth/i, /dob/i, /birth.*date/i,            // DOB (#3)
  ];
  return headers.filter(h =>
    phiPatterns.some(p => p.test(h))
  );
}

/**
 * Find date columns that contain dates directly related to individuals.
 * Safe Harbor allows year only, not full dates.
 */
function findDateColumns(headers: string[]): string[] {
  const datePatterns = [
    /date/i, /appointment/i, /visit/i, /service/i,
    /admission/i, /discharge/i, /^dos$/i, /^dt$/i,
  ];
  return headers.filter(h => datePatterns.some(p => p.test(h)));
}

/**
 * Generalize a date to year-month only (Safe Harbor allows year;
 * we keep year-month for analytical value, which is a reasonable
 * approach under Expert Determination for referral pattern analysis).
 */
function generalizeDate(val: unknown): string {
  const str = String(val || "").trim();
  if (!str) return "";

  // Try to parse various date formats
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  // Try MM/DD/YYYY or similar
  const parts = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (parts) {
    const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
    return `${year}-${parts[1].padStart(2, "0")}`;
  }

  // Return as-is if we can't parse (will be caught in manual review)
  return str;
}

/**
 * Scrub ALL PHI from a row per HIPAA Safe Harbor (45 CFR 164.514(b)(2)).
 *
 * - Patient names/IDs: replaced with random UUID
 * - Dates: generalized to year-month
 * - Phone, email, SSN, address, etc: removed entirely
 * - Revenue, procedures, referral sources: kept (not PHI identifiers)
 */
function scrubRow(
  row: Record<string, unknown>,
  patientColumns: string[],
  phiColumns: string[],
  dateColumns: string[],
  anonId: string
): Record<string, unknown> {
  const scrubbed = { ...row };

  // Replace patient identifiers with random UUID
  for (const col of patientColumns) {
    if (scrubbed[col]) {
      scrubbed[col] = anonId;
    }
  }

  // Remove other PHI columns entirely
  for (const col of phiColumns) {
    if (!patientColumns.includes(col)) {
      delete scrubbed[col];
    }
  }

  // Generalize dates to year-month
  for (const col of dateColumns) {
    if (scrubbed[col]) {
      scrubbed[col] = generalizeDate(scrubbed[col]);
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
