/**
 * Task Creator Service
 *
 * Creates tasks from agent outputs. Each agent type has its own
 * output structure and task creation logic.
 *
 * Agent types handled:
 * - Opportunity: USER tasks from opportunities[]
 * - CRO Optimizer: ALLORO tasks from opportunities[]
 * - Referral Engine: ALLORO from alloro_automation_opportunities, USER from practice_action_plan
 * - Copy Companion: USER tasks from recommendations with verdict filtering
 */

import { db } from "../../../database/connection";
import { log, logError } from "../feature-utils/agentLogger";

// =====================================================================
// OPPORTUNITY TASKS
// =====================================================================

export async function createTasksFromOpportunityOutput(
  opportunityOutput: any,
  googleAccountId: number,
  domain: string,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  try {
    const actionItems = opportunityOutput[0]?.opportunities || [];

    console.log(opportunityOutput[0].opportunities);
    if (Array.isArray(actionItems) && actionItems.length > 0) {
      log(
        `  [MONTHLY] Creating ${actionItems.length} task(s) from action items`,
      );

      for (const item of actionItems) {
        // Use type from action item, default to USER if not ALLORO (Opportunity agent outputs USER tasks)
        const type =
          item.type?.toUpperCase() === "ALLORO" ? "ALLORO" : "USER";

        const taskData = {
          organization_id: organizationId ?? null,
          location_id: locationId ?? null,
          title: item.title || item.name || "Untitled Task",
          description:
            item.explanation || item.description || item.details || null,
          category: type,
          agent_type: "OPPORTUNITY",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          due_date:
            item.due_date || item.dueDate
              ? new Date(item.due_date || item.dueDate)
              : null,
          metadata: JSON.stringify({
            agent_category: item.category || null,
            urgency: item.urgency || null,
            ...(item.metadata || {}),
          }),
          created_at: new Date(),
          updated_at: new Date(),
        };

        try {
          const [result] = await db("tasks").insert(taskData).returning("id");
          const taskId = result.id;
          log(
            `    \u2713 Created ${type} task (ID: ${taskId}): ${taskData.title}`,
          );
        } catch (taskError: any) {
          log(
            `    \u26a0 Failed to create task "${taskData.title}": ${taskError.message}`,
          );
        }
      }

      log(`  [MONTHLY] \u2713 Task creation completed`);
    } else {
      log(`  [MONTHLY] No action items found in opportunity output`);
    }
  } catch (taskCreationError: any) {
    // Don't fail the entire operation if task creation fails
    log(
      `  [MONTHLY] \u26a0 Error creating Opportunity tasks: ${taskCreationError.message}`,
    );
  }
}

// =====================================================================
// CRO OPTIMIZER TASKS
// =====================================================================

export async function createTasksFromCroOptimizerOutput(
  croOptimizerOutput: any,
  googleAccountId: number,
  domain: string,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  try {
    const croActionItems = croOptimizerOutput[0]?.opportunities || [];

    if (Array.isArray(croActionItems) && croActionItems.length > 0) {
      log(
        `  [MONTHLY] Creating ${croActionItems.length} CRO Optimizer task(s) from action items`,
      );

      for (const item of croActionItems) {
        // Use type from action item, default to ALLORO if not USER (CRO Optimizer outputs ALLORO tasks)
        const type = item.type?.toUpperCase() === "USER" ? "USER" : "ALLORO";

        const taskData = {
          organization_id: organizationId ?? null,
          location_id: locationId ?? null,
          title: item.title || item.name || "Untitled Task",
          description:
            item.explanation || item.description || item.details || null,
          category: type,
          agent_type: "CRO_OPTIMIZER",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          due_date:
            item.due_date || item.dueDate
              ? new Date(item.due_date || item.dueDate)
              : null,
          metadata: JSON.stringify({
            agent_category: item.category || null,
            urgency: item.urgency || null,
            ...(item.metadata || {}),
          }),
          created_at: new Date(),
          updated_at: new Date(),
        };

        try {
          const [result] = await db("tasks").insert(taskData).returning("id");
          const taskId = result.id;
          log(
            `    \u2713 Created ${type} task (ID: ${taskId}): ${taskData.title}`,
          );
        } catch (taskError: any) {
          log(
            `    \u26a0 Failed to create task "${taskData.title}": ${taskError.message}`,
          );
        }
      }

      log(`  [MONTHLY] \u2713 CRO Optimizer task creation completed`);
    } else {
      log(`  [MONTHLY] No CRO Optimizer action items found in output`);
    }
  } catch (taskCreationError: any) {
    // Don't fail the entire operation if task creation fails
    log(
      `  [MONTHLY] \u26a0 Error creating CRO Optimizer tasks: ${taskCreationError.message}`,
    );
  }
}

// =====================================================================
// REFERRAL ENGINE TASKS
// =====================================================================

export async function createTasksFromReferralEngineOutput(
  referralEngineOutput: any,
  googleAccountId: number,
  domain: string,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  try {
    // Referral Engine output may be wrapped in array, handle both cases
    const referralOutput = Array.isArray(referralEngineOutput)
      ? referralEngineOutput[0]
      : referralEngineOutput;

    // ALLORO tasks from alloro_automation_opportunities (internal/agency tasks)
    const alloroItems = referralOutput?.alloro_automation_opportunities || [];

    // USER tasks from practice_action_plan (client tasks)
    const userItems = referralOutput?.practice_action_plan || [];

    const totalReferralTasks = alloroItems.length + userItems.length;

    if (totalReferralTasks > 0) {
      log(
        `  [MONTHLY] Creating ${totalReferralTasks} Referral Engine task(s) (${alloroItems.length} ALLORO, ${userItems.length} USER)`,
      );

      // Create ALLORO tasks from alloro_automation_opportunities
      for (const item of alloroItems) {
        // Handle both string items and object items
        const isStringItem = typeof item === "string";
        const fullText = isStringItem
          ? item
          : item.description ||
            item.rationale ||
            item.explanation ||
            item.details ||
            item.title ||
            "";
        const titleText = isStringItem
          ? item.length > 80
            ? item.substring(0, 80) + "..."
            : item
          : item.title ||
            item.opportunity ||
            item.name ||
            (fullText.length > 80
              ? fullText.substring(0, 80) + "..."
              : fullText) ||
            "Untitled Referral Engine Task";

        const taskData = {
          organization_id: organizationId ?? null,
          location_id: locationId ?? null,
          title: titleText,
          description: fullText || null,
          category: "ALLORO",
          agent_type: "REFERRAL_ENGINE_ANALYSIS",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          due_date: isStringItem
            ? null
            : item.due_date || item.dueDate
              ? new Date(item.due_date || item.dueDate)
              : null,
          metadata: JSON.stringify({
            source_field: "alloro_automation_opportunities",
            priority: isStringItem ? null : item.priority || null,
            impact: isStringItem ? null : item.impact || null,
            effort: isStringItem ? null : item.effort || null,
            category: isStringItem ? null : item.category || null,
            ...(isStringItem ? {} : item.metadata || {}),
          }),
          created_at: new Date(),
          updated_at: new Date(),
        };

        try {
          const [result] = await db("tasks").insert(taskData).returning("id");
          const taskId = result.id;
          log(`    \u2713 Created ALLORO task (ID: ${taskId}): ${taskData.title}`);
        } catch (taskError: any) {
          log(
            `    \u26a0 Failed to create ALLORO task "${taskData.title}": ${taskError.message}`,
          );
        }
      }

      // Create USER tasks from practice_action_plan
      for (const item of userItems) {
        // Handle both string items and object items
        const isStringItem = typeof item === "string";
        const fullText = isStringItem
          ? item
          : item.description ||
            item.rationale ||
            item.explanation ||
            item.details ||
            item.title ||
            "";
        const titleText = isStringItem
          ? item.length > 80
            ? item.substring(0, 80) + "..."
            : item
          : item.title ||
            item.action ||
            item.name ||
            (fullText.length > 80
              ? fullText.substring(0, 80) + "..."
              : fullText) ||
            "Untitled Practice Action";

        const taskData = {
          organization_id: organizationId ?? null,
          location_id: locationId ?? null,
          title: titleText,
          description: fullText || null,
          category: "USER",
          agent_type: "REFERRAL_ENGINE_ANALYSIS",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          due_date: isStringItem
            ? null
            : item.due_date || item.dueDate
              ? new Date(item.due_date || item.dueDate)
              : null,
          metadata: JSON.stringify({
            source_field: "practice_action_plan",
            priority: isStringItem ? null : item.priority || null,
            impact: isStringItem ? null : item.impact || null,
            effort: isStringItem ? null : item.effort || null,
            category: isStringItem ? null : item.category || null,
            owner: isStringItem ? null : item.owner || null,
            ...(isStringItem ? {} : item.metadata || {}),
          }),
          created_at: new Date(),
          updated_at: new Date(),
        };

        try {
          const [result] = await db("tasks").insert(taskData).returning("id");
          const taskId = result.id;
          log(`    \u2713 Created USER task (ID: ${taskId}): ${taskData.title}`);
        } catch (taskError: any) {
          log(
            `    \u26a0 Failed to create USER task "${taskData.title}": ${taskError.message}`,
          );
        }
      }

      log(`  [MONTHLY] \u2713 Referral Engine task creation completed`);
    } else {
      log(`  [MONTHLY] No Referral Engine action items found in output`);
    }
  } catch (taskCreationError: any) {
    // Don't fail the entire operation if task creation fails
    log(
      `  [MONTHLY] \u26a0 Error creating Referral Engine tasks: ${taskCreationError.message}`,
    );
  }
}

// =====================================================================
// COPY COMPANION (GBP OPTIMIZER) TASKS
// =====================================================================

export async function createTasksFromCopyRecommendations(
  agentOutput: any,
  googleAccountId: number,
  domain: string,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  log(`\n  [GBP-OPTIMIZER] Creating tasks from recommendations...`);

  try {
    // Copy Companion returns an array directly, not nested in [0]
    const recommendations = Array.isArray(agentOutput) ? agentOutput : [];

    if (recommendations.length === 0) {
      log(`  [GBP-OPTIMIZER] No recommendations found in output`);
      return;
    }

    log(
      `  [GBP-OPTIMIZER] Found ${recommendations.length} total recommendation(s)`,
    );

    let createdCount = 0;
    let skippedCount = 0;
    let taskIndex = 0;

    for (const item of recommendations) {
      const verdict = item.verdict || "UNKNOWN";
      const lineage = item.lineage || "unknown";
      const confidence = item.confidence || 0;

      log(
        `    [${lineage}] Verdict: ${verdict}, Confidence: ${(
          confidence * 100
        ).toFixed(0)}%`,
      );

      // Only create tasks for recommendations that need action
      if (!["CONFIRMED", "PENDING_REVIEW"].includes(verdict)) {
        log(`      \u2192 Skipping (verdict: ${verdict})`);
        skippedCount++;
        continue;
      }

      taskIndex++;

      const taskData = {
        organization_id: organizationId ?? null,
        location_id: locationId ?? null,
        title: `Update GBP Post ${taskIndex}`,
        description: `
**Current Text:**
${item.source_text || "N/A"}

**Recommended Text:**
${item.recommendation || "N/A"}

**Confidence:** ${(confidence * 100).toFixed(0)}%

**Notes:**
${item.notes || "No additional notes"}

${
  item.alerts && item.alerts.length > 0
    ? `**Alerts:**\n${item.alerts.join("\n")}`
    : ""
}
        `.trim(),
        category: "USER",
        agent_type: "GBP_OPTIMIZATION",
        status: "pending",
        is_approved: false,
        created_by_admin: true,
        due_date: null,
        metadata: JSON.stringify({
          agent_slug: item.agent_slug,
          agent_name: item.agent_name,
          lineage: lineage,
          confidence: confidence,
          verdict: verdict,
          citations: item.citations || [],
          freshness: item.freshness,
          source_text: item.source_text,
          recommendation: item.recommendation,
        }),
        created_at: new Date(),
        updated_at: new Date(),
      };

      try {
        const [result] = await db("tasks").insert(taskData).returning("id");
        const taskId = result.id;
        log(`      \u2713 Created task (ID: ${taskId}): ${taskData.title}`);
        createdCount++;
      } catch (taskError: any) {
        log(`      \u2717 Failed to create task: ${taskError.message}`);
      }
    }

    log(`  [GBP-OPTIMIZER] \u2713 Task creation completed`);
    log(`    - Created: ${createdCount}`);
    log(`    - Skipped: ${skippedCount}`);
    log(`    - Total: ${recommendations.length}`);
  } catch (error: any) {
    logError("createTasksFromCopyRecommendations", error);
    log(`  [GBP-OPTIMIZER] \u26a0 Error creating tasks: ${error.message}`);
  }
}

// =====================================================================
// TEST MODE SIMULATOR
// =====================================================================

/**
 * Helper function to simulate task creation without persisting to database
 */
export function simulateTaskCreation(agentOutputs: {
  opportunityOutput: any;
  croOptimizerOutput: any;
  referralEngineOutput: any;
}): {
  from_opportunity: any[];
  from_cro_optimizer: any[];
  from_referral_engine: { alloro: any[]; user: any[] };
  summary: { total_tasks: number; user_tasks: number; alloro_tasks: number };
} {
  const result = {
    from_opportunity: [] as any[],
    from_cro_optimizer: [] as any[],
    from_referral_engine: { alloro: [] as any[], user: [] as any[] },
    summary: { total_tasks: 0, user_tasks: 0, alloro_tasks: 0 },
  };

  try {
    // Simulate Opportunity tasks
    const opportunityItems =
      agentOutputs.opportunityOutput?.[0]?.opportunities || [];
    if (Array.isArray(opportunityItems)) {
      for (const item of opportunityItems) {
        const type = item.type?.toUpperCase() === "ALLORO" ? "ALLORO" : "USER";
        result.from_opportunity.push({
          title: item.title || item.name || "Untitled Task",
          description:
            item.explanation || item.description || item.details || null,
          category: type,
          agent_type: "OPPORTUNITY",
          urgency: item.urgency || null,
          due_date: item.due_date || item.dueDate || null,
          metadata: item.metadata || {},
        });
        result.summary[type === "USER" ? "user_tasks" : "alloro_tasks"]++;
      }
    }
  } catch (e) {
    log(`[TEST-TASKS] \u26a0 Error simulating Opportunity tasks: ${e}`);
  }

  try {
    // Simulate CRO Optimizer tasks
    const croItems = agentOutputs.croOptimizerOutput?.[0]?.opportunities || [];
    if (Array.isArray(croItems)) {
      for (const item of croItems) {
        const type = item.type?.toUpperCase() === "USER" ? "USER" : "ALLORO";
        result.from_cro_optimizer.push({
          title: item.title || item.name || "Untitled Task",
          description:
            item.explanation || item.description || item.details || null,
          category: type,
          agent_type: "CRO_OPTIMIZER",
          urgency: item.urgency || null,
          due_date: item.due_date || item.dueDate || null,
          metadata: item.metadata || {},
        });
        result.summary[type === "USER" ? "user_tasks" : "alloro_tasks"]++;
      }
    }
  } catch (e) {
    log(`[TEST-TASKS] \u26a0 Error simulating CRO Optimizer tasks: ${e}`);
  }

  try {
    // Simulate Referral Engine tasks
    const referralOutput = Array.isArray(agentOutputs.referralEngineOutput)
      ? agentOutputs.referralEngineOutput[0]
      : agentOutputs.referralEngineOutput;

    const alloroItems = referralOutput?.alloro_automation_opportunities || [];
    const userItems = referralOutput?.practice_action_plan || [];

    // Process ALLORO tasks
    for (const item of alloroItems) {
      const isStringItem = typeof item === "string";
      const fullText = isStringItem ? item : JSON.stringify(item);
      const title = isStringItem
        ? item.substring(0, 100)
        : item.opportunity || item.title || "Opportunity";

      result.from_referral_engine.alloro.push({
        title,
        description: isStringItem
          ? null
          : item.description || item.explanation || null,
        category: "ALLORO",
        agent_type: "REFERRAL_ENGINE_ANALYSIS",
        full_text: fullText,
      });
      result.summary.alloro_tasks++;
    }

    // Process USER tasks
    for (const item of userItems) {
      const isStringItem = typeof item === "string";
      const fullText = isStringItem ? item : JSON.stringify(item);
      const title = isStringItem
        ? item.substring(0, 100)
        : item.action || item.title || "Action Item";

      result.from_referral_engine.user.push({
        title,
        description: isStringItem
          ? null
          : item.description || item.explanation || null,
        category: "USER",
        agent_type: "REFERRAL_ENGINE_ANALYSIS",
        full_text: fullText,
      });
      result.summary.user_tasks++;
    }
  } catch (e) {
    log(`[TEST-TASKS] \u26a0 Error simulating Referral Engine tasks: ${e}`);
  }

  result.summary.total_tasks =
    result.summary.user_tasks + result.summary.alloro_tasks;

  return result;
}
