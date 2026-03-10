/**
 * PMS Paste-Parse Service
 * Uses Anthropic Haiku to parse pasted spreadsheet/CSV data into structured PMS referral data.
 * Stateless transformation — no database writes.
 *
 * Now accepts optional column context from the Analysis phase (Phase 1)
 * to give the AI a head start on column mapping.
 */

import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import { parseAgentJson } from "../pms-utils/agent-json-parse.util";
import type { AnalysisResult } from "./pms-paste-analysis.service";

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
 * Build column context string from analysis result.
 */
function buildColumnContext(analysis: AnalysisResult): string {
  const parts: string[] = [
    "COLUMN MAPPING FROM ANALYSIS (0-based column indices):",
  ];

  const { columns, typeInference, rowStructure, delimiter } = analysis;

  parts.push(`Delimiter: ${delimiter === "tab" ? "TAB" : "COMMA"}`);
  parts.push(`Has header row: ${analysis.hasHeaderRow ? "yes" : "no"}`);
  parts.push(`Row structure: ${rowStructure}`);

  if (columns.source !== null) parts.push(`Source column: index ${columns.source}`);
  if (columns.date !== null) parts.push(`Date column: index ${columns.date}`);
  if (columns.type !== null) parts.push(`Type column: index ${columns.type}`);
  if (columns.referrals !== null) parts.push(`Referrals column: index ${columns.referrals}`);
  if (columns.production !== null) parts.push(`Production column: index ${columns.production}`);

  if (typeInference.hasReferringPractice) {
    parts.push(
      `Referring Practice column: index ${typeInference.referringPracticeColumn} (rows with values here are "doctor" type)`
    );
  }
  if (typeInference.hasReferringDoctor) {
    parts.push(
      `Referring Doctor column: index ${typeInference.referringDoctorColumn}`
    );
  }

  if (rowStructure === "one_per_referral") {
    parts.push(
      "Each row = 1 referral. Count referrals as 1 per row for the same source."
    );
  }

  return parts.join("\n");
}

/**
 * Parse pasted text using Haiku and return structured PMS data.
 * Optionally accepts column context from the Analysis phase.
 */
export async function parsePastedData(
  rawText: string,
  currentMonth: string,
  analysisContext?: AnalysisResult
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

  // Build user message with optional column context
  const contextBlock = analysisContext
    ? `\n${buildColumnContext(analysisContext)}\n`
    : "";

  const userMessage = `Fallback month (use if no date column detected): ${currentMonth}
${contextBlock}
Pasted data:
${rawText}`;

  console.log(
    `[PMS-Paste] Sending ${rawText.length} bytes to Haiku for parsing${analysisContext ? " (with column context)" : ""}`
  );

  const agentOptions = {
    systemPrompt,
    userMessage,
    model: MODEL,
    maxTokens: 4096,
    prefill: "{",
  };

  const result = await runAgent(agentOptions);

  console.log(
    `[PMS-Paste] Haiku response: ${result.inputTokens} in / ${result.outputTokens} out`
  );
  console.log(
    `[PMS-Paste] Raw response (first 800 chars): ${result.raw.substring(0, 800)}`
  );

  // Use shared JSON parser with retry logic
  const parsed = await parseAgentJson<{ months: any[]; warnings?: string[] }>(
    result.raw,
    agentOptions,
    "Parser"
  );

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
