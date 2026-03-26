/**
 * Self-Sufficient Operator Detection — T2-A
 *
 * After PMS upload, checks three conditions:
 * 1. Named columns: header has referral/doctor/GP keywords
 * 2. Consistent formatting: 80%+ numeric in case count column
 * 3. Historical depth: 90+ day date range
 *
 * If all three met: sets self_sufficient_operator = TRUE on org.
 * Changes: dashboard opens on /dashboard/referrals, Monday email
 * leads with referral data, One Action Card surfaces referral drift.
 *
 * Client never sees this routing decision.
 */

import { db } from "../database/connection";

const REFERRAL_KEYWORDS = [
  "doctor", "dentist", "provider", "gp", "referring",
  "referral", "practice", "office",
];

/**
 * Detect if a PMS upload indicates a self-sufficient operator.
 * Call this after every PMS file upload with the raw JSON data.
 */
export async function detectSelfSufficientOperator(
  orgId: number,
  headers: string[],
  rows: Record<string, string>[],
): Promise<boolean> {
  if (!orgId || !headers.length || !rows.length) return false;

  // ── Condition 1: Named columns ──
  const hasReferralColumn = headers.some((h) => {
    const lower = h.toLowerCase();
    return REFERRAL_KEYWORDS.some((kw) => lower.includes(kw));
  });

  if (!hasReferralColumn) {
    console.log(`[OperatorDetect] Org ${orgId}: no referral column found`);
    return false;
  }

  // ── Condition 2: Consistent formatting (80%+ numeric in any numeric column) ──
  let hasConsistentNumeric = false;

  for (const header of headers) {
    const values = rows.map((r) => r[header]).filter(Boolean);
    if (values.length < 5) continue;

    const numericCount = values.filter((v) => {
      const cleaned = v.replace(/[$,\s]/g, "");
      return /^\d+\.?\d*$/.test(cleaned);
    }).length;

    if (numericCount / values.length >= 0.8) {
      hasConsistentNumeric = true;
      break;
    }
  }

  if (!hasConsistentNumeric) {
    console.log(`[OperatorDetect] Org ${orgId}: no consistently numeric column`);
    return false;
  }

  // ── Condition 3: Historical depth (90+ days) ──
  let hasDepth = false;

  // Find a date column
  const datePatterns = [
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
    /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/,
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}$/i,
  ];

  for (const header of headers) {
    const values = rows.map((r) => r[header]).filter(Boolean);
    if (values.length < 5) continue;

    // Check if this column looks like dates
    const dateCount = values.filter((v) =>
      datePatterns.some((p) => p.test(v.trim())),
    ).length;

    if (dateCount / values.length < 0.5) continue;

    // Parse dates and check range
    const dates: Date[] = [];
    for (const v of values) {
      const trimmed = v.trim();

      // MM/DD/YYYY
      const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (mdy) {
        const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
        dates.push(new Date(Number(year), Number(mdy[1]) - 1, Number(mdy[2])));
        continue;
      }

      // YYYY-MM-DD
      const iso = trimmed.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
      if (iso) {
        dates.push(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
        continue;
      }

      // Try native parsing
      const d = new Date(trimmed);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
        dates.push(d);
      }
    }

    if (dates.length >= 2) {
      const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
      const rangeMs = sorted[sorted.length - 1].getTime() - sorted[0].getTime();
      const rangeDays = rangeMs / 86_400_000;

      if (rangeDays >= 90) {
        hasDepth = true;
        break;
      }
    }
  }

  if (!hasDepth) {
    console.log(`[OperatorDetect] Org ${orgId}: date range < 90 days`);
    return false;
  }

  // ── All three conditions met ──
  await db("organizations").where({ id: orgId }).update({
    self_sufficient_operator: true,
  });

  console.log(`[OperatorDetect] Org ${orgId}: SELF-SUFFICIENT OPERATOR detected`);
  return true;
}
