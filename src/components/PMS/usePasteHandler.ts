import { useCallback, useRef, useState } from "react";
import {
  analyzePastedData,
  parsePastedData,
  sanitizePastedData,
} from "../../api/pms";
import type { AnalysisContext, SanitizationRow } from "../../api/pms";
import type { MonthBucket, PasteInfo, SourceRow } from "./types";

const ROWS_PER_BATCH = 30;

export type PastePhase = "idle" | "analyzing" | "parsing" | "sanitizing";

interface UsePasteHandlerOptions {
  currentMonth: string; // YYYY-MM fallback
  onParsed: (months: MonthBucket[]) => void;
  onError: (msg: string) => void;
  onWarnings?: (warnings: string[]) => void;
}

interface UsePasteHandlerReturn {
  isPasting: boolean;
  phase: PastePhase;
  showConfirm: boolean;
  pasteInfo: PasteInfo | null;
  batchProgress: { current: number; total: number } | null;
  confirmPaste: () => void;
  cancelPaste: () => void;
  handlePasteEvent: (e: React.ClipboardEvent) => void;
}

/**
 * Detect if pasted content looks like tabular data (from a spreadsheet or CSV).
 * Must have tabs or commas as delimiters AND multiple lines.
 */
function isTabularPaste(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;

  const hasTabDelimiters = lines.some((l) => l.includes("\t"));
  const hasCommaDelimiters =
    !hasTabDelimiters && lines.some((l) => l.includes(","));

  return hasTabDelimiters || hasCommaDelimiters;
}

/**
 * Split raw text into chunks of ROWS_PER_BATCH data rows,
 * preserving the first line (headers) in every chunk.
 */
function chunkByRows(raw: string): string[] {
  const lines = raw.split("\n");
  const headerLine = lines[0] || "";
  const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);

  if (dataLines.length <= ROWS_PER_BATCH) return [raw];

  const chunks: string[] = [];
  for (let i = 0; i < dataLines.length; i += ROWS_PER_BATCH) {
    const batch = dataLines.slice(i, i + ROWS_PER_BATCH);
    chunks.push(headerLine + "\n" + batch.join("\n"));
  }

  return chunks;
}

/**
 * Convert AI-parsed month data into MonthBucket[] with unique IDs.
 */
function toMonthBuckets(
  months: Array<{
    month: string;
    rows: Array<{
      source: string;
      type: "self" | "doctor";
      referrals: number;
      production: number;
    }>;
  }>
): MonthBucket[] {
  return months.map((m) => ({
    id: Date.now() + Math.random() * 10000,
    month: m.month,
    rows: m.rows.map(
      (r): SourceRow => ({
        id: Date.now() + Math.random() * 10000,
        source: r.source,
        type: r.type,
        referrals: String(r.referrals),
        production: String(r.production),
      })
    ),
  }));
}

/**
 * Merge parsed MonthBuckets: combine rows for the same month.
 */
function mergeMonthBuckets(buckets: MonthBucket[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();

  for (const bucket of buckets) {
    const existing = map.get(bucket.month);
    if (existing) {
      existing.rows.push(...bucket.rows);
    } else {
      map.set(bucket.month, { ...bucket });
    }
  }

  return Array.from(map.values());
}

/**
 * Flatten MonthBucket[] into SanitizationRow[] for the sanitization API.
 */
function flattenToSanitizationRows(
  buckets: MonthBucket[]
): SanitizationRow[] {
  const rows: SanitizationRow[] = [];
  for (const bucket of buckets) {
    for (const row of bucket.rows) {
      rows.push({
        source: row.source,
        type: row.type,
        referrals: Number(row.referrals) || 0,
        production: Number(row.production) || 0,
        month: bucket.month,
      });
    }
  }
  return rows;
}

/**
 * Convert SanitizationRow[] back to MonthBucket[] for the UI.
 */
function sanitizationRowsToBuckets(rows: SanitizationRow[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();

  for (const row of rows) {
    let bucket = map.get(row.month);
    if (!bucket) {
      bucket = {
        id: Date.now() + Math.random() * 10000,
        month: row.month,
        rows: [],
      };
      map.set(row.month, bucket);
    }
    bucket.rows.push({
      id: Date.now() + Math.random() * 10000,
      source: row.source,
      type: row.type,
      referrals: String(row.referrals),
      production: String(row.production),
    });
  }

  return Array.from(map.values());
}

export function usePasteHandler({
  currentMonth,
  onParsed,
  onError,
  onWarnings,
}: UsePasteHandlerOptions): UsePasteHandlerReturn {
  const [isPasting, setIsPasting] = useState(false);
  const [phase, setPhase] = useState<PastePhase>("idle");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pasteInfo, setPasteInfo] = useState<PasteInfo | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const rawTextRef = useRef<string>("");

  const handlePasteEvent = useCallback(
    (e: React.ClipboardEvent) => {
      // Don't intercept paste if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const text = e.clipboardData.getData("text/plain");
      if (!text || !isTabularPaste(text)) return;

      e.preventDefault();

      const sizeKB = new Blob([text]).size / 1024;
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const estimatedRows = Math.max(0, lines.length - 1); // subtract header
      const chunksRequired = Math.ceil(estimatedRows / ROWS_PER_BATCH);

      rawTextRef.current = text;
      setPasteInfo({ text, sizeKB, estimatedRows, chunksRequired });
      setShowConfirm(true);
    },
    []
  );

  const cancelPaste = useCallback(() => {
    setShowConfirm(false);
    setPasteInfo(null);
    rawTextRef.current = "";
  }, []);

  const confirmPaste = useCallback(async () => {
    const raw = rawTextRef.current;
    if (!raw) return;

    setIsPasting(true);
    const allWarnings: string[] = [];

    try {
      // ===============================================
      // PHASE 1: ANALYSIS — "Analyzing your data structure..."
      // ===============================================
      setPhase("analyzing");
      console.log("[PMS-Paste] Phase 1: Analyzing data structure...");

      let analysisContext: AnalysisContext | undefined;

      const analyzeResult = await analyzePastedData(raw);
      if (analyzeResult.success && analyzeResult.data) {
        analysisContext = analyzeResult.data;
        console.log("[PMS-Paste] Analysis complete:", JSON.stringify(analysisContext.columns));

        if (analyzeResult.data.warnings?.length) {
          allWarnings.push(...analyzeResult.data.warnings);
        }
      } else {
        console.warn(
          "[PMS-Paste] Analysis failed, proceeding without context:",
          analyzeResult.error
        );
        allWarnings.push(
          "Column analysis could not determine structure — using fallback detection."
        );
      }

      // ===============================================
      // PHASE 2: BATCH PARSING — "Processing batch X of Y..."
      // ===============================================
      setPhase("parsing");
      console.log("[PMS-Paste] Phase 2: Batch parsing...");

      const chunks = chunkByRows(raw);
      const allBuckets: MonthBucket[] = [];

      for (let i = 0; i < chunks.length; i++) {
        setBatchProgress({ current: i + 1, total: chunks.length });
        console.log(`[PMS-Paste] Parsing batch ${i + 1}/${chunks.length}...`);

        const result = await parsePastedData(
          chunks[i],
          currentMonth,
          analysisContext
        );

        if (!result.success || !result.data) {
          throw new Error(result.error || "Parsing failed");
        }

        const buckets = toMonthBuckets(result.data.months);
        allBuckets.push(...buckets);

        if (result.data.warnings?.length) {
          allWarnings.push(...result.data.warnings);
        }
      }

      const merged = mergeMonthBuckets(allBuckets);

      if (merged.length === 0) {
        throw new Error("No data could be parsed from the pasted content.");
      }

      console.log(
        `[PMS-Paste] Batch parsing complete: ${merged.length} months, ${merged.reduce((n, m) => n + m.rows.length, 0)} rows`
      );

      // ===============================================
      // PHASE 3: SANITIZATION — "Cleaning your data..."
      // ===============================================
      setPhase("sanitizing");
      setBatchProgress(null);
      console.log("[PMS-Paste] Phase 3: Sanitizing/deduplicating...");

      const flatRows = flattenToSanitizationRows(merged);

      // Only run sanitization if there are enough rows to have potential duplicates
      if (flatRows.length >= 2) {
        const sanitizeResult = await sanitizePastedData(flatRows);

        if (sanitizeResult.success && sanitizeResult.data) {
          const { mergedRows, uniqueRows, stats, reasoning, warnings } =
            sanitizeResult.data;

          console.log("[PMS-Paste] Sanitization stats:", JSON.stringify(stats));

          if (reasoning?.length) {
            console.log("[PMS-Paste] Sanitization reasoning:", reasoning);
          }

          if (warnings?.length) {
            allWarnings.push(...warnings);
          }

          // Combine merged + unique rows back into MonthBucket[]
          const allSanitizedRows = [...mergedRows, ...uniqueRows];
          const sanitizedBuckets = sanitizationRowsToBuckets(allSanitizedRows);

          if (stats.duplicateGroupsConfirmed > 0) {
            allWarnings.push(
              `Merged ${stats.duplicateGroupsConfirmed} duplicate source group(s) during sanitization.`
            );
          }

          onParsed(sanitizedBuckets);
        } else {
          console.warn(
            "[PMS-Paste] Sanitization failed, using unsanitized data:",
            sanitizeResult.error
          );
          allWarnings.push(
            "Data cleaning could not complete — using unprocessed results."
          );
          onParsed(merged);
        }
      } else {
        // Not enough rows for dedup, skip sanitization
        console.log("[PMS-Paste] Skipping sanitization (< 2 rows)");
        onParsed(merged);
      }

      if (allWarnings.length > 0) {
        onWarnings?.(allWarnings);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to parse data");
    } finally {
      setIsPasting(false);
      setPhase("idle");
      setShowConfirm(false);
      setPasteInfo(null);
      setBatchProgress(null);
      rawTextRef.current = "";
    }
  }, [currentMonth, onParsed, onError, onWarnings]);

  return {
    isPasting,
    phase,
    showConfirm,
    pasteInfo,
    batchProgress,
    confirmPaste,
    cancelPaste,
    handlePasteEvent,
  };
}
