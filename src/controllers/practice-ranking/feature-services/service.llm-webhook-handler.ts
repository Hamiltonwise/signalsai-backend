/**
 * LLM Webhook Handler Service
 *
 * Processes n8n webhook callbacks containing LLM analysis results.
 * Creates tasks from recommendations and archives previous tasks.
 *
 * CRITICAL FIX: The archive+insert for tasks is wrapped in a database
 * transaction to prevent data loss if the insert fails after archiving.
 */

import { db } from "../../../database/connection";
import { log, logDebug, logWarn } from "../feature-utils/util.ranking-logger";

interface WebhookBody {
  practice_ranking_id: number;
  error?: boolean;
  error_code?: string;
  error_message?: string;
  [key: string]: any;
}

/**
 * Handle an error response from the LLM webhook.
 * Marks the ranking as completed with error details.
 */
export async function handleErrorResponse(
  practiceRankingId: number,
  errorCode: string | undefined,
  errorMessage: string | undefined,
): Promise<void> {
  await db("practice_rankings")
    .where({ id: practiceRankingId })
    .update({
      status: "completed",
      status_detail: JSON.stringify({
        currentStep: "done",
        message: `Completed with LLM error: ${errorMessage}`,
        progress: 100,
        stepsCompleted: [
          "queued",
          "fetching_client_gbp",
          "discovering_competitors",
          "scraping_competitors",
          "auditing_website",
          "calculating_scores",
          "awaiting_llm",
        ],
        timestamps: {},
      }),
      error_message: `LLM Error: ${errorCode} - ${errorMessage}`,
      updated_at: new Date(),
    });
}

/**
 * Archive previous tasks and create new tasks from LLM recommendations.
 * CRITICAL: Wrapped in a transaction to prevent data loss.
 *
 * If archive succeeds but insert fails without a transaction, previous
 * tasks would be archived with no new tasks created (data loss).
 */
export async function archiveAndCreateTasks(
  ranking: any,
  practiceRankingId: number,
  llmAnalysis: any,
): Promise<void> {
  try {
    await db.transaction(async (trx) => {
      // Find previous ranking IDs for this location (excluding current)
      const previousRankings = await trx("practice_rankings")
        .where({
          organization_id: ranking.organization_id,
          gbp_location_id: ranking.gbp_location_id,
        })
        .whereNot({ id: practiceRankingId })
        .select("id");

      const previousRankingIds = previousRankings.map((r: any) => r.id);

      if (previousRankingIds.length > 0) {
        // Archive tasks from previous rankings for this location
        const archivedCount = await trx("tasks")
          .where({ agent_type: "RANKING" })
          .whereRaw("metadata::jsonb->>'practice_ranking_id' IN (?)", [
            previousRankingIds.map(String).join(","),
          ])
          .whereNot({ status: "archived" })
          .update({
            status: "archived",
            updated_at: new Date(),
          });

        if (archivedCount > 0) {
          logDebug(
            `  [Webhook] Archived ${archivedCount} tasks from previous rankings`,
          );
        }
      }

      // Extract top_recommendations from LLM analysis
      const topRecommendations = llmAnalysis.top_recommendations || [];
      logDebug(
        `  [Webhook] Found ${topRecommendations.length} top recommendations to create as tasks`,
      );

      // Create task records for each recommendation
      if (topRecommendations.length > 0) {
        const tasksToInsert = topRecommendations.map((item: any) => ({
          domain_name: ranking.domain,
          organization_id: ranking.organization_id,
          title: item.title || "Ranking Improvement Action",
          description: item.expected_outcome
            ? `${item.description || ""}\n\n**Expected Outcome:**\n${
                item.expected_outcome
              }`
            : item.description || "",
          category: "USER",
          agent_type: "RANKING",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          due_date: null,
          metadata: JSON.stringify({
            practice_ranking_id: practiceRankingId,
            gbp_location_id: ranking.gbp_location_id,
            gbp_location_name: ranking.gbp_location_name,
            priority: item.priority || null,
            impact: item.impact || null,
            effort: item.effort || null,
            timeline: item.timeline || null,
          }),
          created_at: new Date(),
          updated_at: new Date(),
        }));

        await trx("tasks").insert(tasksToInsert);
        logDebug(
          `  [Webhook] Created ${tasksToInsert.length} pending tasks from ranking recommendations`,
        );
      }
    });
  } catch (taskError: any) {
    // Log but don't fail the webhook if task creation fails
    logWarn(
      `[Webhook] Failed to create tasks from ranking recommendations: ${taskError.message}`,
    );
  }
}

/**
 * Save the LLM analysis results and mark ranking as completed.
 */
export async function saveLlmAnalysis(
  practiceRankingId: number,
  llmAnalysis: any,
): Promise<void> {
  await db("practice_rankings")
    .where({ id: practiceRankingId })
    .update({
      llm_analysis: JSON.stringify(llmAnalysis),
      status: "completed",
      status_detail: JSON.stringify({
        currentStep: "done",
        message: "Analysis complete with AI insights",
        progress: 100,
        stepsCompleted: [
          "queued",
          "fetching_client_gbp",
          "discovering_competitors",
          "scraping_competitors",
          "auditing_website",
          "calculating_scores",
          "awaiting_llm",
          "done",
        ],
        timestamps: { completed_at: new Date().toISOString() },
      }),
      updated_at: new Date(),
    });

  log(`[${practiceRankingId}] LLM analysis saved, status: completed`);
}
