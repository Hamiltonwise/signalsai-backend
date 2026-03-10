/**
 * PMS Paste-Parse Service
 * Uses Anthropic Haiku to parse pasted spreadsheet/CSV data into structured PMS referral data.
 * Stateless transformation — no database writes.
 */

import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_INPUT_SIZE = 50_000; // 50KB hard cap (frontend chunks by 30 rows)

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

  const systemPrompt = loadPrompt("pmsAgents/PasteParser");

  const userMessage = `Fallback month (use if no date column detected): ${currentMonth}

Pasted data:
${rawText}`;

  console.log(
    `[PMS-Paste] Sending ${rawText.length} bytes to Haiku for parsing`
  );

  const result = await runAgent({
    systemPrompt,
    userMessage,
    model: MODEL,
    maxTokens: 4096,
    prefill: "{",
  });

  const rawResponse = result.raw;

  console.log(
    `[PMS-Paste] Haiku response: ${result.inputTokens} in / ${result.outputTokens} out`
  );
  console.log(
    `[PMS-Paste] Raw response (first 800 chars): ${rawResponse.substring(0, 800)}`
  );

  // Try the parsed result from runAgent first (it handles fence stripping)
  let parsed: { months: any[]; warnings?: string[] } | null = result.parsed;

  // Fallback: try manual extraction strategies
  if (!parsed) {
    console.log("[PMS-Paste] Direct parse failed, trying extraction...");
    let cleaned = rawResponse.replace(/^[^{]*/, "").trim();

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
