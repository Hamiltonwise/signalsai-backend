/**
 * CS Coach Agent -- Execution Service
 *
 * Runs weekly Sunday 8 PM PT. Queries behavioral_events for CS
 * intervention outcomes, identifies patterns (which intervention
 * types get positive vs negative outcomes), and writes
 * "cs_coach.pattern_update" event with recommendations.
 *
 * No AI needed. Pattern matching on event types and outcomes.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface InterventionPattern {
  interventionType: string;
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  reEngagementRate: number;
}

interface CoachRecommendation {
  type: "amplify" | "adjust" | "retire";
  interventionType: string;
  reason: string;
  evidence: string;
}

interface CSCoachSummary {
  totalInterventions: number;
  patterns: InterventionPattern[];
  recommendations: CoachRecommendation[];
  analyzedAt: string;
}

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the CS Coach weekly analysis.
 * Identifies which CS intervention types produce re-engagement.
 */
export async function runCSCoach(): Promise<CSCoachSummary> {
  const now = new Date();

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Query all CS Agent intervention events from the past week
  // CS Agent writes "cs.proactive_intervention" (not "cs_agent." prefix)
  const csEvents = await db("behavioral_events")
    .where("event_type", "like", "cs.%")
    .where("created_at", ">=", sevenDaysAgo)
    .where("created_at", "<", now)
    .select("event_type", "properties", "org_id");

  // Group by intervention type and count outcomes
  const patternMap: Record<
    string,
    { total: number; positive: number; negative: number; neutral: number }
  > = {};

  for (const event of csEvents) {
    const interventionType = event.event_type;
    if (!patternMap[interventionType]) {
      patternMap[interventionType] = {
        total: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
      };
    }
    patternMap[interventionType].total++;

    // Parse satisfaction from properties
    let satisfaction = "neutral";
    try {
      const props =
        typeof event.properties === "string"
          ? JSON.parse(event.properties)
          : event.properties;
      satisfaction = props?.satisfaction || props?.outcome || "neutral";
    } catch {
      // Default to neutral
    }

    if (satisfaction === "positive" || satisfaction === "resolved") {
      patternMap[interventionType].positive++;
    } else if (satisfaction === "negative" || satisfaction === "churned") {
      patternMap[interventionType].negative++;
    } else {
      patternMap[interventionType].neutral++;
    }
  }

  // Build patterns with re-engagement rates
  const patterns: InterventionPattern[] = Object.entries(patternMap).map(
    ([interventionType, counts]) => ({
      interventionType,
      ...counts,
      reEngagementRate:
        counts.total > 0 ? counts.positive / counts.total : 0,
    }),
  );

  // Sort by re-engagement rate descending
  patterns.sort((a, b) => b.reEngagementRate - a.reEngagementRate);

  // Generate recommendations
  const recommendations: CoachRecommendation[] = [];

  for (const pattern of patterns) {
    if (pattern.total < 2) continue; // Need minimum data

    if (pattern.reEngagementRate >= 0.6) {
      recommendations.push({
        type: "amplify",
        interventionType: pattern.interventionType,
        reason: `${Math.round(pattern.reEngagementRate * 100)}% re-engagement rate. This intervention type is working well.`,
        evidence: `${pattern.positive} positive out of ${pattern.total} total in the last 7 days`,
      });
    } else if (pattern.reEngagementRate < 0.2 && pattern.total >= 3) {
      recommendations.push({
        type: "retire",
        interventionType: pattern.interventionType,
        reason: `Only ${Math.round(pattern.reEngagementRate * 100)}% re-engagement rate with ${pattern.total} attempts. Consider retiring or reformulating.`,
        evidence: `${pattern.positive} positive, ${pattern.negative} negative, ${pattern.neutral} neutral out of ${pattern.total} total`,
      });
    } else if (
      pattern.reEngagementRate >= 0.2 &&
      pattern.reEngagementRate < 0.6
    ) {
      recommendations.push({
        type: "adjust",
        interventionType: pattern.interventionType,
        reason: `${Math.round(pattern.reEngagementRate * 100)}% re-engagement rate. Room for improvement. Review timing and content.`,
        evidence: `${pattern.positive} positive, ${pattern.negative} negative out of ${pattern.total} total`,
      });
    }
  }

  const summary: CSCoachSummary = {
    totalInterventions: csEvents.length,
    patterns,
    recommendations,
    analyzedAt: new Date().toISOString(),
  };

  // Write pattern update event
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "cs_coach.pattern_update",
      org_id: null,
      properties: JSON.stringify(summary),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CSCoach] Failed to write pattern update event:`,
        message,
      );
    });

  console.log(
    `[CSCoach] Analysis complete: ${csEvents.length} interventions, ${patterns.length} patterns, ${recommendations.length} recommendations`,
  );

  return summary;
}
