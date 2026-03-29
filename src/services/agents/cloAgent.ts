/**
 * CLO Agent (Chief Legal Officer) -- Execution Service
 *
 * Runs weekly, Tuesday 6 AM PT.
 * Checks USPTO TESS for trademark filings matching Alloro product names.
 * Monitors for new filings in business intelligence / SaaS categories.
 * If threat detected, creates dream_team_task for Corey with HOLD status.
 *
 * Writes "legal.trademark_scan" event with results.
 */

import { db } from "../../database/connection";
import { fetchPage, extractText } from "../webFetch";

// ── Types ───────────────────────────────────────────────────────────

interface TrademarkHit {
  term: string;
  found: boolean;
  filings: TrademarkFiling[];
  error?: string;
}

interface TrademarkFiling {
  markText: string;
  serialNumber?: string;
  filingDate?: string;
  applicant?: string;
  classDescription?: string;
  status?: string;
}

interface TrademarkScanSummary {
  scannedAt: string;
  termsChecked: number;
  threatsDetected: number;
  results: TrademarkHit[];
}

// ── Monitored Terms ─────────────────────────────────────────────────

const MONITORED_TERMS: string[] = [
  "Alloro",
  "PatientPath",
  "ClearPath",
  "Business Clarity",
];

// SaaS-relevant trademark classes
const RELEVANT_CLASSES = [
  "042", // Computer software, SaaS, technology platforms
  "035", // Business management, advertising, data analysis
  "009", // Computer software (downloadable)
];

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the CLO trademark scan for all monitored terms.
 */
export async function runTrademarkScan(): Promise<TrademarkScanSummary> {
  const results: TrademarkHit[] = [];
  let threatsDetected = 0;

  for (const term of MONITORED_TERMS) {
    try {
      const hit = await checkTrademark(term);
      results.push(hit);

      if (hit.filings.length > 0) {
        threatsDetected += hit.filings.length;
      }

      // Small delay between requests
      await delay(3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CLOAgent] Error checking "${term}":`, message);
      results.push({
        term,
        found: false,
        filings: [],
        error: message,
      });
    }
  }

  const summary: TrademarkScanSummary = {
    scannedAt: new Date().toISOString(),
    termsChecked: results.length,
    threatsDetected,
    results,
  };

  // Write scan event
  await writeScanEvent(summary);

  // If threats detected, create dream_team_task
  if (threatsDetected > 0) {
    await createThreatTask(summary);
  }

  console.log(
    `[CLOAgent] Scan complete: ${summary.termsChecked} terms, ${threatsDetected} threats`,
  );

  return summary;
}

// ── Trademark Check ─────────────────────────────────────────────────

async function checkTrademark(term: string): Promise<TrademarkHit> {
  // USPTO TESS search URL
  const encodedTerm = encodeURIComponent(term);
  const url = `https://tmsearch.uspto.gov/bin/gate.exe?f=searchss&state=4810:1.1.1&p_s_PARA1=${encodedTerm}&p_s_PARA2=live&p_s_PARA3=&p_s_PARA4=&p_s_PARA5=&p_s_PARA6=&p_s_PARA7=&p_s_PARA8=&p_s_PARA9=&p_s_PARA10=&a_default=search&a_search=Submit+Query&a_search=Submit`;

  const page = await fetchPage(url);

  if (!page.success || !page.html) {
    // TESS may block automated requests. Fall back to noting the attempt.
    return {
      term,
      found: false,
      filings: [],
      error: page.error || "Unable to reach USPTO TESS. Manual check recommended.",
    };
  }

  const text = await extractText(page.html);
  const textLower = text.toLowerCase();
  const termLower = term.toLowerCase();

  // Check if the term appears in results
  const termPresent = textLower.includes(termLower);

  const filings: TrademarkFiling[] = [];

  if (termPresent) {
    // Try to extract filing information from results
    // TESS results vary in format, so we do basic pattern matching
    const filing = parseFilingFromText(text, term);
    if (filing) {
      filings.push(filing);
    }

    // Check if any results are in relevant SaaS classes
    const hasRelevantClass = RELEVANT_CLASSES.some((cls) =>
      textLower.includes(`class ${cls}`) ||
      textLower.includes(`ic ${cls}`) ||
      textLower.includes(`042`) ||
      textLower.includes(`class 42`),
    );

    if (hasRelevantClass && filings.length > 0) {
      filings[0].classDescription = "Class 42 (SaaS/Software) or related class detected";
    }
  }

  return {
    term,
    found: filings.length > 0,
    filings,
  };
}

function parseFilingFromText(text: string, term: string): TrademarkFiling | null {
  // Basic extraction from TESS result text
  const termLower = term.toLowerCase();
  const textLower = text.toLowerCase();

  if (!textLower.includes(termLower)) return null;

  // Try to find serial number pattern (8 digits)
  const serialMatch = text.match(/\b(\d{8})\b/);

  // Try to find date patterns
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);

  return {
    markText: term,
    serialNumber: serialMatch ? serialMatch[1] : undefined,
    filingDate: dateMatch ? dateMatch[1] : undefined,
    status: "Review needed. Automated extraction may be incomplete.",
  };
}

// ── Writers ─────────────────────────────────────────────────────────

async function writeScanEvent(summary: TrademarkScanSummary): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "legal.trademark_scan",
      org_id: null,
      properties: JSON.stringify({
        scanned_at: summary.scannedAt,
        terms_checked: summary.termsChecked,
        threats_detected: summary.threatsDetected,
        results: summary.results.map((r) => ({
          term: r.term,
          found: r.found,
          filing_count: r.filings.length,
          error: r.error,
        })),
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CLOAgent] Failed to write scan event:`, message);
  }
}

async function createThreatTask(summary: TrademarkScanSummary): Promise<void> {
  const threats = summary.results.filter((r) => r.filings.length > 0);
  const threatDetails = threats
    .map((t) => {
      const filing = t.filings[0];
      return `- "${t.term}": ${filing.serialNumber ? `Serial #${filing.serialNumber}` : "Filing detected"}${filing.classDescription ? ` (${filing.classDescription})` : ""}`;
    })
    .join("\n");

  try {
    await db("dream_team_tasks").insert({
      title: `CLO HOLD: ${summary.threatsDetected} trademark threat(s) detected`,
      description: `The CLO Agent detected potential trademark conflicts during weekly scan:\n\n${threatDetails}\n\nAction required: Review filings on USPTO TESS and consult trademark attorney if any filing is in Class 42 (SaaS/Software) or related classes.\n\nCLO holds are absolute per Agent Trust Protocol Rule 5.`,
      assigned_to: "corey",
      status: "open",
      priority: "high",
      metadata: JSON.stringify({
        source: "clo_agent",
        scan_type: "trademark",
        threats: threats.map((t) => ({
          term: t.term,
          filings: t.filings,
        })),
      }),
    });
    console.log(`[CLOAgent] Created HOLD task for ${summary.threatsDetected} threat(s)`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CLOAgent] Failed to create threat task:`, message);
  }
}

// ── Utilities ───────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
