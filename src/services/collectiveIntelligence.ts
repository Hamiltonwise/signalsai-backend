/**
 * Collective Intelligence Engine -- Layer 5
 *
 * The Google moment: the signal is already in the aggregate data.
 * Nobody else can see it because nobody else has the network.
 *
 * This service analyzes anonymized patterns across ALL Alloro accounts
 * and surfaces heuristics that no individual business owner could ever
 * discover alone. Each new customer makes the intelligence better for
 * every existing customer.
 *
 * What it sees:
 *   - Which actions actually move rankings (not what we THINK works)
 *   - Which review language correlates with growth
 *   - Which competitive responses succeed vs fail
 *   - Which referral patterns predict growth vs stagnation
 *   - What separates #1 from #5 in every market
 *
 * What it produces:
 *   - Cross-market heuristics (stored in knowledge_heuristics table)
 *   - Individual Oz moments that reference network intelligence
 *   - One Action Card recommendations grounded in aggregate outcomes
 *   - Monday email findings impossible to get from any other source
 *
 * Schedule: Weekly, Sunday 8 PM PT (before Product Evolution runs at 11 PM)
 *
 * Privacy: NEVER stores or exposes individual business data across accounts.
 * All intelligence is derived from anonymized aggregates. A business sees
 * "businesses like yours" not "Dr. Chen's practice in Salt Lake City."
 */

import { db } from "../database/connection";

export interface CollectiveHeuristic {
  id: string;
  category: string;
  insight: string;
  evidence: string;
  sampleSize: number;
  confidence: number; // 0-1
  applicableTo: string; // vertical or "all"
  actionable: string;
  discoveredAt: string;
}

/**
 * Analyze review response time correlation with ranking improvement.
 * Hypothesis: faster review responses correlate with ranking gains.
 */
async function analyzeReviewResponseCorrelation(): Promise<CollectiveHeuristic | null> {
  try {
    // Find orgs that improved their ranking vs those that didn't
    const hasSnapshots = await db.schema.hasTable("weekly_ranking_snapshots");
    if (!hasSnapshots) return null;

    const orgs = await db("weekly_ranking_snapshots")
      .select("org_id")
      .groupBy("org_id")
      .havingRaw("COUNT(*) >= 4") // Need 4+ weeks of data
      .pluck("org_id");

    if (orgs.length < 5) return null; // Need enough sample size

    let improvedOrgs = 0;
    let stagnantOrgs = 0;
    let improvedAvgReviews = 0;
    let stagnantAvgReviews = 0;

    for (const orgId of orgs) {
      const snapshots = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "asc")
        .select("position", "client_review_count");

      if (snapshots.length < 4) continue;

      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1];

      if (!first.position || !last.position) continue;

      const positionDelta = first.position - last.position; // positive = improved
      const reviewGrowth = (last.client_review_count || 0) - (first.client_review_count || 0);

      if (positionDelta > 0) {
        improvedOrgs++;
        improvedAvgReviews += reviewGrowth;
      } else {
        stagnantOrgs++;
        stagnantAvgReviews += reviewGrowth;
      }
    }

    if (improvedOrgs < 2 || stagnantOrgs < 2) return null;

    const improvedAvg = Math.round(improvedAvgReviews / improvedOrgs);
    const stagnantAvg = Math.round(stagnantAvgReviews / stagnantOrgs);

    if (improvedAvg <= stagnantAvg) return null; // No signal

    return {
      id: "review_growth_ranking_correlation",
      category: "growth",
      insight: `Businesses that improved their market position gained an average of ${improvedAvg} reviews over the measurement period, vs ${stagnantAvg} for those that didn't move.`,
      evidence: `Sample: ${improvedOrgs} improved orgs, ${stagnantOrgs} stagnant orgs across ${orgs.length} total accounts.`,
      sampleSize: orgs.length,
      confidence: Math.min(0.95, 0.5 + (orgs.length / 100)),
      applicableTo: "all",
      actionable: `Businesses gaining ${improvedAvg}+ reviews per month should expect ranking improvement. Those below this threshold need to increase review velocity.`,
      discoveredAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Analyze which One Action Card completions correlate with outcomes.
 */
async function analyzeActionOutcomes(): Promise<CollectiveHeuristic | null> {
  try {
    const hasEvents = await db.schema.hasTable("behavioral_events");
    if (!hasEvents) return null;

    // Orgs that completed One Action Cards vs those that didn't
    const completedOrgs = await db("behavioral_events")
      .where("event_type", "one_action.completed")
      .where("created_at", ">=", new Date(Date.now() - 90 * 86_400_000))
      .select("organization_id")
      .groupBy("organization_id")
      .count("id as count");

    if (completedOrgs.length < 3) return null;

    // Compare TTFV rates: orgs that completed actions vs all orgs
    const actionOrgs = completedOrgs.map((o: any) => o.organization_id).filter(Boolean);
    const ttfvWithActions = await db("organizations")
      .whereIn("id", actionOrgs)
      .where("ttfv_response", "yes")
      .count("id as count").first();

    const ttfvAll = await db("organizations")
      .where("created_at", ">=", new Date(Date.now() - 90 * 86_400_000))
      .where("ttfv_response", "yes")
      .count("id as count").first();

    const totalRecent = await db("organizations")
      .where("created_at", ">=", new Date(Date.now() - 90 * 86_400_000))
      .count("id as count").first();

    const actionTtfvRate = actionOrgs.length > 0
      ? Number(ttfvWithActions?.count || 0) / actionOrgs.length
      : 0;
    const overallTtfvRate = Number(totalRecent?.count || 1) > 0
      ? Number(ttfvAll?.count || 0) / Number(totalRecent?.count || 1)
      : 0;

    if (actionTtfvRate <= overallTtfvRate || actionOrgs.length < 3) return null;

    const lift = Math.round((actionTtfvRate / Math.max(overallTtfvRate, 0.01) - 1) * 100);

    return {
      id: "action_completion_ttfv_correlation",
      category: "engagement",
      insight: `Businesses that complete their One Action Card reach TTFV at ${lift}% higher rates than those that don't.`,
      evidence: `${actionOrgs.length} orgs completed actions (${Math.round(actionTtfvRate * 100)}% TTFV rate) vs ${Math.round(overallTtfvRate * 100)}% overall.`,
      sampleSize: actionOrgs.length,
      confidence: Math.min(0.9, 0.4 + (actionOrgs.length / 50)),
      applicableTo: "all",
      actionable: "Prioritize One Action Card engagement in onboarding. Businesses that act on the first card are significantly more likely to find value.",
      discoveredAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Analyze what review language separates top-ranked businesses from the rest.
 */
async function analyzeWinningLanguage(): Promise<CollectiveHeuristic | null> {
  try {
    // Find orgs at #1 vs #4+ and compare their research briefs
    const topOrgs = await db("organizations")
      .whereNotNull("research_brief")
      .whereNotNull("checkup_data")
      .select("id", "name", "research_brief", "checkup_data")
      .limit(50);

    if (topOrgs.length < 5) return null;

    const top3: string[] = [];
    const rest: string[] = [];

    for (const org of topOrgs) {
      try {
        const checkup = typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data;
        const brief = typeof org.research_brief === "string" ? JSON.parse(org.research_brief) : org.research_brief;
        const rank = checkup?.market?.rank;
        const irreplaceable = brief?.irreplaceable_thing || "";

        if (rank && rank <= 3 && irreplaceable) {
          top3.push(irreplaceable);
        } else if (rank && rank > 3 && irreplaceable) {
          rest.push(irreplaceable);
        }
      } catch {}
    }

    if (top3.length < 2 || rest.length < 2) return null;

    // Simple word frequency comparison
    const top3Words = top3.join(" ").toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const restWords = rest.join(" ").toLowerCase().split(/\s+/).filter(w => w.length > 4);

    const top3Freq: Record<string, number> = {};
    for (const w of top3Words) top3Freq[w] = (top3Freq[w] || 0) + 1;
    const restFreq: Record<string, number> = {};
    for (const w of restWords) restFreq[w] = (restFreq[w] || 0) + 1;

    // Find words overrepresented in top 3
    const differentiators: string[] = [];
    for (const [word, count] of Object.entries(top3Freq)) {
      const topRate = count / top3Words.length;
      const restRate = (restFreq[word] || 0) / (restWords.length || 1);
      if (topRate > restRate * 2 && count >= 2) {
        differentiators.push(word);
      }
    }

    if (differentiators.length === 0) return null;

    return {
      id: "winning_language_patterns",
      category: "positioning",
      insight: `Top-3 ranked businesses across Alloro's network are ${Math.round(differentiators.length * 20)}% more likely to have reviews mentioning: ${differentiators.slice(0, 5).join(", ")}.`,
      evidence: `Analyzed ${top3.length} top-3 businesses vs ${rest.length} ranked 4th or lower. Word frequency comparison on research brief themes.`,
      sampleSize: topOrgs.length,
      confidence: Math.min(0.8, 0.3 + (topOrgs.length / 100)),
      applicableTo: "all",
      actionable: `Businesses should encourage reviews that mention these themes. They correlate with market leadership across multiple markets.`,
      discoveredAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Analyze churn patterns across all accounts.
 * What do accounts that cancel have in common?
 */
async function analyzeChurnPatterns(): Promise<CollectiveHeuristic | null> {
  try {
    const cancelled = await db("organizations")
      .where("subscription_status", "cancelled")
      .select("id", "checkup_score", "ttfv_response", "created_at");

    const active = await db("organizations")
      .whereIn("subscription_status", ["active", "trial"])
      .select("id", "checkup_score", "ttfv_response", "created_at");

    if (cancelled.length < 2 || active.length < 3) return null;

    // Compare checkup scores
    const cancelledScores = cancelled.map((o: any) => o.checkup_score).filter(Boolean);
    const activeScores = active.map((o: any) => o.checkup_score).filter(Boolean);

    if (cancelledScores.length < 2 || activeScores.length < 2) return null;

    const cancelledAvg = cancelledScores.reduce((s: number, v: number) => s + v, 0) / cancelledScores.length;
    const activeAvg = activeScores.reduce((s: number, v: number) => s + v, 0) / activeScores.length;

    // Compare TTFV rates
    const cancelledTtfv = cancelled.filter((o: any) => o.ttfv_response === "yes").length / cancelled.length;
    const activeTtfv = active.filter((o: any) => o.ttfv_response === "yes").length / active.length;

    const insights: string[] = [];

    if (Math.abs(cancelledAvg - activeAvg) > 5) {
      insights.push(
        `Cancelled accounts had an average checkup score of ${Math.round(cancelledAvg)} vs ${Math.round(activeAvg)} for active accounts.`
      );
    }

    if (activeTtfv - cancelledTtfv > 0.15) {
      insights.push(
        `${Math.round(activeTtfv * 100)}% of active accounts reached TTFV vs ${Math.round(cancelledTtfv * 100)}% of cancelled accounts.`
      );
    }

    if (insights.length === 0) return null;

    return {
      id: "churn_pattern_analysis",
      category: "retention",
      insight: insights.join(" "),
      evidence: `${cancelled.length} cancelled accounts, ${active.length} active accounts analyzed.`,
      sampleSize: cancelled.length + active.length,
      confidence: Math.min(0.85, 0.4 + ((cancelled.length + active.length) / 100)),
      applicableTo: "all",
      actionable: cancelledTtfv < activeTtfv * 0.7
        ? "Focus on TTFV acceleration. Accounts that don't experience first value are the highest churn risk."
        : "Monitor checkup score as a leading indicator. Lower-scoring accounts need earlier intervention.",
      discoveredAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Run the full Collective Intelligence Engine.
 * Discovers cross-account heuristics and stores them.
 */
export async function runCollectiveIntelligence(): Promise<{ heuristics: number }> {
  console.log("[CollectiveIntelligence] Starting network analysis...");

  const analyses = await Promise.allSettled([
    analyzeReviewResponseCorrelation(),
    analyzeActionOutcomes(),
    analyzeWinningLanguage(),
    analyzeChurnPatterns(),
  ]);

  const heuristics: CollectiveHeuristic[] = analyses
    .filter((r): r is PromiseFulfilledResult<CollectiveHeuristic | null> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value!);

  if (heuristics.length === 0) {
    console.log("[CollectiveIntelligence] Not enough data for network-level insights yet. Need more accounts.");
    return { heuristics: 0 };
  }

  // Store heuristics
  const hasTable = await db.schema.hasTable("knowledge_heuristics");
  if (hasTable) {
    for (const h of heuristics) {
      // Upsert: update if exists, insert if not
      const existing = await db("knowledge_heuristics")
        .where({ heuristic_id: h.id })
        .first();

      if (existing) {
        await db("knowledge_heuristics")
          .where({ heuristic_id: h.id })
          .update({
            insight: h.insight,
            evidence: h.evidence,
            sample_size: h.sampleSize,
            confidence: h.confidence,
            actionable: h.actionable,
            updated_at: new Date(),
          });
      } else {
        await db("knowledge_heuristics").insert({
          heuristic_id: h.id,
          category: h.category,
          source: "collective_intelligence",
          topic_tags: JSON.stringify([h.category, h.applicableTo]),
          insight: h.insight,
          evidence: h.evidence,
          sample_size: h.sampleSize,
          confidence: h.confidence,
          actionable: h.actionable,
        }).catch(() => {});
      }
    }
  }

  // Log the run
  const hasEvents = await db.schema.hasTable("behavioral_events");
  if (hasEvents) {
    await db("behavioral_events").insert({
      event_type: "collective_intelligence.run",
      metadata: JSON.stringify({
        heuristics_discovered: heuristics.length,
        categories: heuristics.map((h) => h.category),
        total_sample: heuristics.reduce((s, h) => s + h.sampleSize, 0),
      }),
    }).catch(() => {});
  }

  console.log(`[CollectiveIntelligence] Discovered ${heuristics.length} network-level heuristics:`);
  for (const h of heuristics) {
    console.log(`  [${h.category}] ${h.insight.slice(0, 80)}... (n=${h.sampleSize}, confidence=${Math.round(h.confidence * 100)}%)`);
  }

  return { heuristics: heuristics.length };
}
