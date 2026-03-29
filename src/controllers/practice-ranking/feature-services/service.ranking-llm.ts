/**
 * Ranking LLM Service
 *
 * Runs gap analysis via Claude (replaces the former n8n → Gemini webhook).
 * Takes the same payload shape the pipeline already builds, calls
 * service.llm-runner, then delegates persistence to the existing
 * webhook-handler helpers (archiveAndCreateTasks, saveLlmAnalysis).
 */

import { runAgent } from "../../../agents/service.llm-runner";
import * as llmWebhookHandler from "./service.llm-webhook-handler";
import { log, logError } from "../feature-utils/util.ranking-logger";
import { db } from "../../../database/connection";
import { updateStatus, StatusDetail } from "./service.ranking-pipeline";

// =====================================================================
// TYPES
// =====================================================================

export interface RankingLlmPayload {
  additional_data: {
    practice_ranking_id: number;
    batch_id: string;
    client: {
      domain: string;
      practice_name: string;
      specialty: string;
      location: string;
      gbp_location_id: string;
      gbp_account_id: string;
      rank_score: number;
      rank_position: number;
      total_competitors: number;
      factors: Record<string, any>;
      gbp_data: {
        business_name: string;
        total_reviews: number;
        average_rating: number;
        reviews_last_30d: number;
        primary_category: string;
      };
      website_audit: any | null;
    };
    competitors: any[];
    benchmarks: Record<string, any>;
  };
}

// =====================================================================
// PROMPT
// =====================================================================

const SYSTEM_PROMPT = `You are an expert SEO and local search analyst specializing in local service businesses. Analyze the business's ranking performance against competitors and provide actionable insights.

## Ranking Factors (8 weighted factors)
1. Primary Category Match (25%)
2. Total Review Count (20%)
3. Overall Star Rating (15%)
4. Keyword in Business Name (10%)
5. Review Velocity/Recency (10%)
6. NAP Consistency (8%)
7. GBP Profile Activity (7%)
8. Review Sentiment (5%)

## Your Analysis Must Include
1. **Gap Analysis**: Where the practice underperforms vs competitors
2. **Driver Analysis**: Which factors impact their ranking most
3. **Recommendations**: Prioritized actions to improve

## Rules
- Be specific with numbers and comparisons
- Reference actual competitor data
- Prioritize by impact and effort
- The title and recommendations should use less technical terms and should be easily understood by a business owner who does not have a technical background

## Output Schema

You MUST respond with valid JSON matching this exact structure:

{
  "practice_ranking_id": <number>,
  "gaps": [
    {
      "type": "review_gap | profile_gap | activity_gap | technical_gap",
      "area": "<string>",
      "impact": "high | medium | low",
      "current_value": "<string>",
      "benchmark_value": "<string>",
      "gap_size": "<string>",
      "reason": "<string>",
      "recommended_action": "<string>"
    }
  ],
  "drivers": [
    {
      "factor": "category_match | review_count | star_rating | keyword_name | review_velocity | nap_consistency | gbp_activity | sentiment",
      "weight": <number>,
      "current_score": <number>,
      "max_score": <number>,
      "direction": "positive | negative | neutral",
      "insight": "<string>"
    }
  ],
  "render_text": "<plain text analysis summary with executive summary, key findings, and 90-day action plan. NO MARKDOWN FORMATTING.>",
  "client_summary": "<plain text non-tech-readable format of above render text>",
  "one_line_summary": "<very short, plain 1-2 sentences summary of everything including the top proper next step>",
  "verdict": "improving | stable | declining | needs_attention",
  "confidence": <number between 0 and 1>,
  "top_recommendations": [
    {
      "priority": <number>,
      "title": "<string>",
      "description": "<string>",
      "impact": "high | medium | low",
      "effort": "high | medium | low",
      "timeline": "<string>",
      "expected_outcome": "<string>"
    }
  ],
  "citations": ["<string>"]
}

## Output Constraints
- The response must begin immediately with { and end with }
- Do NOT use markdown formatting
- Do NOT use code blocks
- Do NOT include conversational text, prose, or comments outside the JSON object
- Respond with valid JSON only`;

// =====================================================================
// CORE
// =====================================================================

/**
 * Run the ranking gap analysis via Claude and persist results.
 *
 * On success: saves llm_analysis, archives old tasks, creates new tasks,
 * marks ranking as completed.
 *
 * On failure: marks ranking as completed without AI insights (graceful).
 */
export async function runRankingAnalysis(
  rankingId: number,
  payload: RankingLlmPayload,
  ranking: any,
  statusDetail: StatusDetail,
  logger?: (msg: string) => void,
): Promise<void> {
  const _log = logger || log;

  try {
    _log(`[RANKING] [${rankingId}] Calling Claude for gap analysis...`);

    const result = await runAgent({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: JSON.stringify(payload.additional_data),
      maxTokens: 16384,
      temperature: 0,
      prefill: "{",
    });

    _log(
      `[RANKING] [${rankingId}] Claude responded (${result.inputTokens} in / ${result.outputTokens} out)`,
    );

    if (!result.parsed) {
      throw new Error("Claude returned non-parseable response");
    }

    const llmAnalysis = result.parsed;

    // Ensure practice_ranking_id is set correctly
    llmAnalysis.practice_ranking_id = rankingId;

    // Archive old tasks + create new ones (transactional)
    await llmWebhookHandler.archiveAndCreateTasks(
      ranking,
      rankingId,
      llmAnalysis,
    );

    // Save LLM analysis and mark completed
    await llmWebhookHandler.saveLlmAnalysis(rankingId, llmAnalysis);

    _log(`[RANKING] [${rankingId}] LLM analysis saved successfully`);
  } catch (error: any) {
    _log(
      `[RANKING] [${rankingId}] LLM analysis failed: ${error.message}`,
    );
    await updateStatus(
      rankingId,
      "completed",
      "done",
      "Analysis complete (without AI insights)",
      100,
      statusDetail,
      _log,
    );
  }
}
