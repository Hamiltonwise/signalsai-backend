/**
 * Response formatting utilities for admin agent insights.
 *
 * Handles summary row formatting (parsing string counts to numbers,
 * calculating pass_rate) and JSON field parsing for recommendations.
 */

export interface FormattedSummaryRow {
  agent_type: string;
  pass_rate: number;
  confidence_rate: number;
  total_recommendations: number;
  fixed_count: number;
}

/**
 * Format a raw summary database row into the API response shape.
 *
 * Parses string count values to integers, calculates pass_rate,
 * and renames agent_under_test to agent_type.
 *
 * @param row - Raw row from the summary aggregation query
 * @returns Formatted summary row
 */
export function formatSummaryRow(row: any): FormattedSummaryRow {
  const totalRecs = parseInt(String(row.total_recommendations)) || 0;
  const passCount = parseInt(String(row.pass_count)) || 0;
  const fixedCount = parseInt(String(row.fixed_count)) || 0;
  const avgConfidence = parseFloat(String(row.avg_confidence)) || 0;

  return {
    agent_type: row.agent_under_test,
    pass_rate: totalRecs > 0 ? passCount / totalRecs : 0,
    confidence_rate: avgConfidence,
    total_recommendations: totalRecs,
    fixed_count: fixedCount,
  };
}

/**
 * Parse JSON string fields on recommendation rows.
 *
 * evidence_links may come back from the database as a JSON string
 * rather than a parsed array. This handles both cases defensively.
 *
 * @param recommendations - Array of recommendation rows from the database
 * @returns Recommendations with evidence_links parsed
 */
export function parseRecommendationJsonFields(recommendations: any[]): any[] {
  return recommendations.map((rec) => ({
    ...rec,
    evidence_links:
      typeof rec.evidence_links === "string"
        ? JSON.parse(rec.evidence_links)
        : rec.evidence_links,
  }));
}
