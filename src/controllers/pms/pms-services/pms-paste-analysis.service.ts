/**
 * PMS Paste Analysis & Sanitization Service
 *
 * Phase 1 (Analysis): AI-powered header analysis to determine column mapping.
 * Phase 3 (Sanitization): JS similarity pre-filter + AI deduplication verdict.
 *
 * Both phases are stateless — no database writes.
 */

import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import { parseAgentJson } from "../pms-utils/agent-json-parse.util";

const MODEL = "claude-haiku-4-5-20251001";

// =====================================================================
// TYPES
// =====================================================================

export interface ColumnMapping {
  source: number | null;
  date: number | null;
  type: number | null;
  referrals: number | null;
  production: number | null;
}

export interface TypeInference {
  hasReferringPractice: boolean;
  hasReferringDoctor: boolean;
  referringPracticeColumn: number | null;
  referringDoctorColumn: number | null;
}

export interface AnalysisResult {
  columns: ColumnMapping;
  delimiter: "tab" | "comma";
  hasHeaderRow: boolean;
  typeInference: TypeInference;
  rowStructure: "one_per_referral" | "aggregated";
  warnings: string[];
}

export interface SanitizationRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
  month: string;
}

export interface DuplicateGroup {
  groupId: number;
  rows: SanitizationRow[];
  similarity: number;
}

export interface MergeGroup {
  canonicalName: string;
  canonicalType: "self" | "doctor";
  sourceNames: string[];
  rows: SanitizationRow[];
}

export interface SanitizationResult {
  mergedRows: SanitizationRow[];
  uniqueRows: SanitizationRow[];
  mergeGroups: MergeGroup[];
  reasoning: string[];
  warnings: string[];
  stats: {
    totalInputRows: number;
    duplicateGroupsFound: number;
    duplicateGroupsConfirmed: number;
    rowsMerged: number;
    uniqueSourcesAfter: number;
  };
}

// =====================================================================
// PHASE 1: ANALYSIS
// =====================================================================

/**
 * Extract headers + sample rows from raw paste text for analysis.
 */
function extractSampleForAnalysis(rawText: string): string {
  const lines = rawText.split("\n").filter((l) => l.trim().length > 0);
  // Header + up to 5 sample rows
  const sample = lines.slice(0, 6);
  return sample.join("\n");
}

/**
 * Analyze pasted data structure using AI.
 * Returns column mapping and data structure info.
 */
export async function analyzePastedData(rawText: string): Promise<AnalysisResult> {
  if (!rawText || rawText.trim().length === 0) {
    throw Object.assign(new Error("No data provided to analyze"), {
      statusCode: 400,
    });
  }

  const sampleText = extractSampleForAnalysis(rawText);
  const systemPrompt = loadPrompt("pmsAgents/PasteAnalyzer");

  const userMessage = `Analyze this pasted data and determine the column mapping:\n\n${sampleText}`;

  console.log(`[PMS-Analyzer] Analyzing ${sampleText.split("\n").length} sample lines`);

  const agentOptions = {
    systemPrompt,
    userMessage,
    model: MODEL,
    maxTokens: 2048,
    prefill: "{",
  };

  const result = await runAgent(agentOptions);

  console.log(
    `[PMS-Analyzer] Response: ${result.inputTokens} in / ${result.outputTokens} out`
  );

  const parsed = await parseAgentJson<AnalysisResult>(
    result.raw,
    agentOptions,
    "Analyzer"
  );

  // Validate required fields
  if (!parsed.columns) {
    throw new Error("Analysis response missing 'columns' field");
  }

  // Ensure all column fields exist (default to null)
  const columns: ColumnMapping = {
    source: parsed.columns.source ?? null,
    date: parsed.columns.date ?? null,
    type: parsed.columns.type ?? null,
    referrals: parsed.columns.referrals ?? null,
    production: parsed.columns.production ?? null,
  };

  const typeInference: TypeInference = {
    hasReferringPractice: parsed.typeInference?.hasReferringPractice ?? false,
    hasReferringDoctor: parsed.typeInference?.hasReferringDoctor ?? false,
    referringPracticeColumn: parsed.typeInference?.referringPracticeColumn ?? null,
    referringDoctorColumn: parsed.typeInference?.referringDoctorColumn ?? null,
  };

  const analysisResult: AnalysisResult = {
    columns,
    delimiter: parsed.delimiter === "comma" ? "comma" : "tab",
    hasHeaderRow: parsed.hasHeaderRow !== false,
    typeInference,
    rowStructure: parsed.rowStructure === "aggregated" ? "aggregated" : "one_per_referral",
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };

  console.log(`[PMS-Analyzer] Column mapping:`, JSON.stringify(columns));
  console.log(`[PMS-Analyzer] Row structure: ${analysisResult.rowStructure}`);
  console.log(`[PMS-Analyzer] Type inference:`, JSON.stringify(typeInference));

  return analysisResult;
}

// =====================================================================
// PHASE 3: SANITIZATION (JS pre-filter + AI verdict)
// =====================================================================

/**
 * Normalize a source name for comparison purposes.
 * Strips common dental suffixes, titles, punctuation.
 */
function normalizeForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"]/g, " ")
    .replace(/\b(dr|drs|doctor|doctors|dds|dmd|md|pc|llc|inc|pllc|pa)\b/g, "")
    .replace(/\b(dental|dentistry|dentist|orthodontics|periodontics|endodontics)\b/g, "")
    .replace(/\b(care|clinic|center|centre|office|group|practice|associates|assoc)\b/g, "")
    .replace(/\b(the|and|of|at|in|for|a|an)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize a name into meaningful tokens for Jaccard similarity.
 */
function tokenize(name: string): Set<string> {
  const normalized = normalizeForComparison(name);
  const tokens = normalized.split(" ").filter((t) => t.length > 1);
  return new Set(tokens);
}

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Compute Jaccard similarity between two token sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/**
 * Compute combined similarity score between two source names.
 * Uses both normalized Levenshtein and Jaccard token overlap.
 * Returns a score between 0 and 1 (1 = identical).
 */
function computeSimilarity(nameA: string, nameB: string): number {
  const normA = normalizeForComparison(nameA);
  const normB = normalizeForComparison(nameB);

  // Exact match after normalization
  if (normA === normB) return 1.0;

  // Levenshtein similarity (normalized)
  const maxLen = Math.max(normA.length, normB.length);
  const levDist = levenshtein(normA, normB);
  const levSim = maxLen > 0 ? 1 - levDist / maxLen : 1;

  // Jaccard token similarity
  const tokensA = tokenize(nameA);
  const tokensB = tokenize(nameB);
  const jaccard = jaccardSimilarity(tokensA, tokensB);

  // Combined score: take the max of both (either method detecting similarity is enough)
  return Math.max(levSim, jaccard);
}

const SIMILARITY_THRESHOLD = 0.65;

/**
 * Merge rows with the exact same source name (case-insensitive).
 * Aggregates referrals + production per month. No AI needed.
 */
function mergeExactDuplicates(
  rows: SanitizationRow[]
): { mergedRows: SanitizationRow[]; mergeGroups: MergeGroup[]; stats: { exactGroupsMerged: number; rowsBefore: number; rowsAfter: number } } {
  // Group by lowercase source name
  const sourceMap = new Map<string, SanitizationRow[]>();
  for (const row of rows) {
    const key = row.source.toLowerCase().trim();
    if (!sourceMap.has(key)) sourceMap.set(key, []);
    sourceMap.get(key)!.push(row);
  }

  const mergedRows: SanitizationRow[] = [];
  const mergeGroups: MergeGroup[] = [];
  let exactGroupsMerged = 0;

  for (const [, groupRows] of sourceMap) {
    if (groupRows.length === 1) {
      // Single row — no dedup needed
      mergedRows.push(groupRows[0]);
      continue;
    }

    // Multiple rows with same name — aggregate per month
    exactGroupsMerged++;
    const canonicalName = groupRows[0].source; // keep original casing from first occurrence
    const canonicalType = groupRows.some((r) => r.type === "doctor") ? "doctor" as const : "self" as const;

    mergeGroups.push({
      canonicalName,
      canonicalType,
      sourceNames: [canonicalName],
      rows: groupRows,
    });

    const monthMap = new Map<string, { referrals: number; production: number }>();
    for (const row of groupRows) {
      const existing = monthMap.get(row.month);
      if (existing) {
        existing.referrals += row.referrals;
        existing.production += row.production;
      } else {
        monthMap.set(row.month, {
          referrals: row.referrals,
          production: row.production,
        });
      }
    }

    for (const [month, totals] of monthMap) {
      mergedRows.push({
        source: canonicalName,
        type: canonicalType,
        referrals: totals.referrals,
        production: totals.production,
        month,
      });
    }
  }

  return {
    mergedRows,
    mergeGroups,
    stats: { exactGroupsMerged, rowsBefore: rows.length, rowsAfter: mergedRows.length },
  };
}

/**
 * After exact dedup, find fuzzy-similar source names for AI verdict.
 * Only groups with 2+ DISTINCT name variants are sent to the AI.
 */
function findFuzzyDuplicates(
  rows: SanitizationRow[]
): { fuzzyGroups: DuplicateGroup[]; uniqueRows: SanitizationRow[] } {
  // Group by lowercase source name (each name is already unique per the exact-dedup step,
  // but multiple months may exist)
  const sourceMap = new Map<string, SanitizationRow[]>();
  for (const row of rows) {
    const key = row.source.toLowerCase().trim();
    if (!sourceMap.has(key)) sourceMap.set(key, []);
    sourceMap.get(key)!.push(row);
  }

  const sourceNames = Array.from(sourceMap.keys());
  const used = new Set<string>();
  const fuzzyGroups: DuplicateGroup[] = [];
  let groupId = 0;

  for (let i = 0; i < sourceNames.length; i++) {
    if (used.has(sourceNames[i])) continue;

    const group: string[] = [sourceNames[i]];

    for (let j = i + 1; j < sourceNames.length; j++) {
      if (used.has(sourceNames[j])) continue;

      const sim = computeSimilarity(sourceNames[i], sourceNames[j]);
      if (sim >= SIMILARITY_THRESHOLD) {
        group.push(sourceNames[j]);
        used.add(sourceNames[j]);
      }
    }

    // Only create a group if 2+ distinct name variants matched
    if (group.length > 1) {
      used.add(sourceNames[i]);
      const allRows: SanitizationRow[] = [];
      for (const name of group) {
        allRows.push(...sourceMap.get(name)!);
      }

      const avgSim = group
        .slice(1)
        .reduce((sum, name) => sum + computeSimilarity(sourceNames[i], name), 0) /
        (group.length - 1);

      fuzzyGroups.push({
        groupId: groupId++,
        rows: allRows,
        similarity: avgSim,
      });
    }
  }

  // Collect rows not in any fuzzy group
  const uniqueRows: SanitizationRow[] = [];
  for (const [name, rowsForName] of sourceMap) {
    if (!used.has(name)) {
      uniqueRows.push(...rowsForName);
    }
  }

  return { fuzzyGroups, uniqueRows };
}

/** AI decision for a single duplicate group */
interface SanitizationDecision {
  groupId: number;
  action: "merge" | "split";
  canonicalName?: string;
  canonicalType?: "self" | "doctor";
  reason?: string;
}

/**
 * Run AI sanitization on potential duplicate groups.
 * Only sends distinct names (not full rows) — AI returns lightweight merge/split decisions.
 * JS handles all row manipulation using the decisions.
 */
async function runSanitizationAgent(
  groups: DuplicateGroup[]
): Promise<{
  decisions: SanitizationDecision[];
}> {
  const systemPrompt = loadPrompt("pmsAgents/PasteSanitizer");

  // Only send group IDs + distinct name variants — NOT full row data
  const lightweightGroups = groups.map((g) => ({
    groupId: g.groupId,
    similarity: g.similarity.toFixed(2),
    distinctNames: [...new Set(g.rows.map((r) => r.source))],
  }));

  const userMessage = `Review these potential duplicate groups and determine which sources should be merged:\n\n${JSON.stringify(
    lightweightGroups,
    null,
    2
  )}`;

  console.log(
    `[PMS-Sanitizer] Sending ${groups.length} duplicate groups (${lightweightGroups.reduce((n, g) => n + g.distinctNames.length, 0)} distinct names) to AI for verdict`
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
    `[PMS-Sanitizer] Response: ${result.inputTokens} in / ${result.outputTokens} out`
  );

  const parsed = await parseAgentJson<{
    decisions: SanitizationDecision[];
  }>(result.raw, agentOptions, "Sanitizer");

  return {
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
  };
}

/**
 * Sanitize/deduplicate parsed PMS rows.
 * 1. JS pre-filter: find potential duplicates via Levenshtein + Jaccard
 * 2. AI verdict: determine which are truly the same source
 * 3. Merge confirmed duplicates, return clean data
 */
export async function sanitizeParsedData(
  allRows: SanitizationRow[]
): Promise<SanitizationResult> {
  if (!allRows || allRows.length === 0) {
    return {
      mergedRows: [],
      uniqueRows: [],
      mergeGroups: [],
      reasoning: [],
      warnings: ["No rows provided for sanitization"],
      stats: {
        totalInputRows: 0,
        duplicateGroupsFound: 0,
        duplicateGroupsConfirmed: 0,
        rowsMerged: 0,
        uniqueSourcesAfter: 0,
      },
    };
  }

  console.log(`[PMS-Sanitizer] Starting sanitization of ${allRows.length} rows`);

  // Step 1: Merge exact duplicates (same name, case-insensitive) — pure JS, no AI
  const exactResult = mergeExactDuplicates(allRows);

  console.log(
    `[PMS-Sanitizer] Exact dedup: ${exactResult.stats.exactGroupsMerged} groups merged, ${exactResult.stats.rowsBefore} → ${exactResult.stats.rowsAfter} rows`
  );

  // Step 2: Find fuzzy-similar names among the already-deduped rows
  const { fuzzyGroups, uniqueRows } = findFuzzyDuplicates(exactResult.mergedRows);

  console.log(
    `[PMS-Sanitizer] Fuzzy pre-filter: ${fuzzyGroups.length} potential fuzzy groups, ${uniqueRows.length} unique rows`
  );

  // If no fuzzy duplicates, we're done — just return the exact-dedup result
  if (fuzzyGroups.length === 0) {
    console.log("[PMS-Sanitizer] No fuzzy duplicates found, skipping AI call");
    return {
      mergedRows: [],
      uniqueRows: exactResult.mergedRows,
      mergeGroups: exactResult.mergeGroups,
      reasoning: exactResult.mergeGroups.map(
        (g) => `Exact match: merged ${g.rows.length} rows for "${g.canonicalName}"`
      ),
      warnings: [],
      stats: {
        totalInputRows: allRows.length,
        duplicateGroupsFound: exactResult.stats.exactGroupsMerged,
        duplicateGroupsConfirmed: exactResult.stats.exactGroupsMerged,
        rowsMerged: exactResult.stats.rowsBefore - exactResult.stats.rowsAfter,
        uniqueSourcesAfter: new Set(
          exactResult.mergedRows.map((r) => r.source.toLowerCase().trim())
        ).size,
      },
    };
  }

  // Step 3: AI verdict for fuzzy groups (lightweight — only names, not rows)
  const aiResult = await runSanitizationAgent(fuzzyGroups);

  // Build a groupId → decision lookup
  const decisionMap = new Map<number, SanitizationDecision>();
  for (const d of aiResult.decisions) {
    decisionMap.set(d.groupId, d);
  }

  const mergeCount = aiResult.decisions.filter((d) => d.action === "merge").length;
  const splitCount = aiResult.decisions.filter((d) => d.action === "split").length;
  console.log(
    `[PMS-Sanitizer] AI verdict: ${mergeCount} merge, ${splitCount} split`
  );

  // Step 4: Apply fuzzy decisions to actual row data (all in JS)
  const fuzzyMergedRows: SanitizationRow[] = [];
  const notDuplicateRows: SanitizationRow[] = [];
  const mergeGroups: MergeGroup[] = [...exactResult.mergeGroups];
  const reasoning: string[] = exactResult.mergeGroups.map(
    (g) => `Exact match: merged ${g.rows.length} rows for "${g.canonicalName}"`
  );

  for (const group of fuzzyGroups) {
    const decision = decisionMap.get(group.groupId);

    if (!decision || decision.action === "split") {
      // Not duplicates — return rows as-is
      notDuplicateRows.push(...group.rows);
      if (decision?.reason) {
        reasoning.push(`Split group ${group.groupId}: ${decision.reason}`);
      }
      continue;
    }

    // Merge: aggregate rows per month under canonical name
    const canonicalName = decision.canonicalName || group.rows[0].source;
    const canonicalType = decision.canonicalType || "self";

    if (decision.reason) {
      reasoning.push(`Merged → "${canonicalName}": ${decision.reason}`);
    }

    mergeGroups.push({
      canonicalName,
      canonicalType,
      sourceNames: [...new Set(group.rows.map((r) => r.source))],
      rows: group.rows,
    });

    const monthMap = new Map<string, { referrals: number; production: number }>();
    for (const row of group.rows) {
      const existing = monthMap.get(row.month);
      if (existing) {
        existing.referrals += row.referrals;
        existing.production += row.production;
      } else {
        monthMap.set(row.month, {
          referrals: row.referrals,
          production: row.production,
        });
      }
    }

    for (const [month, totals] of monthMap) {
      fuzzyMergedRows.push({
        source: canonicalName,
        type: canonicalType,
        referrals: totals.referrals,
        production: totals.production,
        month,
      });
    }
  }

  // Combine: fuzzy-merged rows + unique rows (from fuzzy step) + split-decision rows
  const allFinalRows = [...fuzzyMergedRows, ...uniqueRows, ...notDuplicateRows];
  const uniqueSourcesAfter = new Set(
    allFinalRows.map((r) => r.source.toLowerCase().trim())
  ).size;

  const totalDupGroups = exactResult.stats.exactGroupsMerged + fuzzyGroups.length;
  const totalConfirmed = exactResult.stats.exactGroupsMerged + mergeCount;

  const result: SanitizationResult = {
    mergedRows: [...fuzzyMergedRows],
    uniqueRows: [...uniqueRows, ...notDuplicateRows],
    mergeGroups,
    reasoning,
    warnings: [],
    stats: {
      totalInputRows: allRows.length,
      duplicateGroupsFound: totalDupGroups,
      duplicateGroupsConfirmed: totalConfirmed,
      rowsMerged: (exactResult.stats.rowsBefore - exactResult.stats.rowsAfter) + fuzzyMergedRows.length,
      uniqueSourcesAfter,
    },
  };

  console.log(`[PMS-Sanitizer] Final stats:`, JSON.stringify(result.stats));

  return result;
}
