/**
 * PMS Paste-Parse Service
 * Uses Anthropic Haiku to parse pasted spreadsheet/CSV data into structured PMS referral data.
 * Stateless transformation — no database writes.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_INPUT_SIZE = 50_000; // 50KB hard cap (frontend chunks by 30 rows)

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

interface ParsedRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
}

interface ParsedMonth {
  month: string; // YYYY-MM
  rows: ParsedRow[];
}

export interface PasteParseResult {
  months: ParsedMonth[];
  warnings: string[];
  rowsParsed: number;
  monthsDetected: number;
}

const SYSTEM_PROMPT = `You are a data extraction specialist. Your job is to parse pasted spreadsheet or CSV data into structured dental/medical referral data.

INPUT: Raw text that was copy-pasted from Excel, Numbers, Google Sheets, or a CSV file. Columns are typically separated by tabs or commas. The first row may be headers.

OUTPUT: A JSON object with this exact schema:
{
  "months": [
    {
      "month": "YYYY-MM",
      "rows": [
        {
          "source": "string (referral source name)",
          "type": "self" | "doctor",
          "referrals": number,
          "production": number
        }
      ]
    }
  ],
  "warnings": ["string (any issues found during parsing)"]
}

RULES:
1. DATES: Look for date/month columns. Convert any date format to YYYY-MM. Supported formats include: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, "January 2025", "Jan 2025", "1/2025", etc. If multiple rows share the same month, group them under one month entry. If no date column exists, use the provided fallback month.

2. SOURCE NAMES: Extract the referral source name. This could be a doctor name, website, marketing channel, etc.

3. TYPE INFERENCE: Determine if the referral is "self" or "doctor":
   - "doctor" if the source name contains: "dr", "doctor", "dds", "dmd", "md", "dentist", "physician", "specialist", "orthodont", "oral surgeon", "periodont", "endodont", "prosthodont"
   - "self" for everything else (website, google, social media, walk-in, etc.)
   - If a "type" column exists in the data, use its values directly.

4. NUMBERS: Parse referral counts and production amounts. Strip currency symbols ($), commas, and other formatting. If a value is empty or non-numeric, use 0.

5. COLUMN DETECTION: Intelligently map columns to fields:
   - Source/name columns: "source", "name", "referring doctor", "doctor", "referral source", "provider", "referred by", "from"
   - Referral count columns: "referrals", "referral count", "count", "patients", "new patients", "qty", "volume", "#"
   - Production columns: "production", "revenue", "amount", "total", "collections", "value", "dollars", "$"
   - Date columns: "date", "month", "period", "time", "year"
   - Type columns: "type", "referral type", "category", "kind"

6. If the data has no clear column headers, infer from the data patterns (text columns = source, numeric columns = referrals/production).

7. Skip completely empty rows.

8. Add warnings for: rows with missing source names, ambiguous column mappings, unparseable values.

CRITICAL: Return ONLY valid JSON. No markdown fences. No commentary. No explanation. Just the JSON object.`;

/**
 * Parse pasted text using Haiku and return structured PMS data.
 */
export async function parsePastedData(
  rawText: string,
  currentMonth: string
): Promise<PasteParseResult> {
  if (!rawText || rawText.trim().length === 0) {
    throw Object.assign(new Error("No data provided to parse"), {
      statusCode: 400,
    });
  }

  if (rawText.length > MAX_INPUT_SIZE) {
    throw Object.assign(
      new Error(
        `Input exceeds maximum size of ${MAX_INPUT_SIZE} bytes. Please send smaller chunks.`
      ),
      { statusCode: 400 }
    );
  }

  const ai = getClient();

  const userMessage = `Fallback month (use if no date column detected): ${currentMonth}

Pasted data:
${rawText}`;

  console.log(
    `[PMS-Paste] Sending ${rawText.length} bytes to Haiku for parsing`
  );

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: "{" },
    ],
  });

  const textBlock = response.content[0];
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const rawResponse = textBlock.text;

  console.log(
    `[PMS-Paste] Haiku response: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`
  );
  console.log(
    `[PMS-Paste] Raw response (first 800 chars): ${rawResponse.substring(0, 800)}`
  );
  console.log(
    `[PMS-Paste] Response stop_reason: ${response.stop_reason}`
  );

  // Build the full text — we prefilled with "{" so prepend it
  let text = "{" + rawResponse.trim();

  // Try JSON.parse directly first (happy path with prefill)
  let parsed: { months: any[]; warnings?: string[] } | null = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    // Prefill approach didn't produce clean JSON — try extraction strategies
    console.log("[PMS-Paste] Direct parse failed, trying extraction...");
  }

  // Strategy 2: Strip markdown fences from the raw response and try again
  if (!parsed) {
    let cleaned = rawResponse.trim();

    // Remove any markdown fences
    cleaned = cleaned.replace(/^```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim();

    // If it doesn't start with {, the prefill continuation might have it
    if (!cleaned.startsWith("{")) {
      cleaned = "{" + cleaned;
    }

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.log("[PMS-Paste] Fence-stripped parse failed, trying JSON extraction...");
    }
  }

  // Strategy 3: Find the outermost { ... } in the full text
  if (!parsed) {
    const fullText = "{" + rawResponse;
    let braceDepth = 0;
    let jsonStart = -1;
    let jsonEnd = -1;

    for (let i = 0; i < fullText.length; i++) {
      if (fullText[i] === "{") {
        if (braceDepth === 0) jsonStart = i;
        braceDepth++;
      } else if (fullText[i] === "}") {
        braceDepth--;
        if (braceDepth === 0 && jsonStart !== -1) {
          jsonEnd = i;
          break;
        }
      }
    }

    if (jsonStart !== -1 && jsonEnd !== -1) {
      const extracted = fullText.slice(jsonStart, jsonEnd + 1);
      try {
        parsed = JSON.parse(extracted);
      } catch {
        console.log("[PMS-Paste] Brace-matched extraction also failed");
      }
    }
  }

  if (!parsed) {
    console.error(
      "[PMS-Paste] All parse strategies failed. Raw response:",
      rawResponse.substring(0, 1000)
    );
    throw new Error(
      "Could not parse the AI response. Please try pasting again — if the issue persists, try pasting fewer rows."
    );
  }

  // Validate shape
  if (!Array.isArray(parsed.months)) {
    throw new Error("AI response missing 'months' array");
  }

  const warnings: string[] = Array.isArray(parsed.warnings)
    ? parsed.warnings
    : [];
  let totalRows = 0;

  // Validate and coerce each month entry
  const validatedMonths: ParsedMonth[] = [];
  for (const monthEntry of parsed.months) {
    const month =
      typeof monthEntry.month === "string" &&
      /^\d{4}-\d{2}$/.test(monthEntry.month)
        ? monthEntry.month
        : currentMonth;

    if (!Array.isArray(monthEntry.rows)) continue;

    const validatedRows: ParsedRow[] = [];
    for (const row of monthEntry.rows) {
      const source =
        typeof row.source === "string" ? row.source.trim() : "";
      if (!source) {
        warnings.push("Skipped row with empty source name");
        continue;
      }

      const type =
        row.type === "doctor" || row.type === "self" ? row.type : "self";
      const referrals = Math.max(0, Math.round(Number(row.referrals) || 0));
      const production = Math.max(0, Number(row.production) || 0);

      validatedRows.push({ source, type, referrals, production });
    }

    if (validatedRows.length > 0) {
      // Merge with existing month if duplicate
      const existing = validatedMonths.find((m) => m.month === month);
      if (existing) {
        existing.rows.push(...validatedRows);
      } else {
        validatedMonths.push({ month, rows: validatedRows });
      }
      totalRows += validatedRows.length;
    }
  }

  if (totalRows === 0) {
    throw Object.assign(
      new Error(
        "No parseable data found. Make sure the pasted content contains referral data."
      ),
      { statusCode: 400 }
    );
  }

  console.log(
    `[PMS-Paste] Parsed ${totalRows} rows across ${validatedMonths.length} month(s)`
  );

  return {
    months: validatedMonths,
    warnings,
    rowsParsed: totalRows,
    monthsDetected: validatedMonths.length,
  };
}
