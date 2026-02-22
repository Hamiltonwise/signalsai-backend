/**
 * Agent Orchestrator Service
 *
 * Core orchestration logic for multi-agent sequential execution.
 * Contains processDailyAgent, processMonthlyAgents, processGBPOptimizerAgent,
 * and processClient with 3-attempt retry logic.
 *
 * This is the heart of the agent processing system.
 */

import { db } from "../../../database/connection";
import {
  getValidOAuth2Client,
} from "../../../auth/oauth2Helper";
import {
  fetchAllServiceData,
  GooglePropertyIds,
} from "../../../utils/dataAggregation/dataAggregator";
import { aggregatePmsData } from "../../../utils/pms/pmsAggregator";
import { log, logError, delay, isValidAgentOutput, logAgentOutput } from "../feature-utils/agentLogger";
import { getDailyDates, getPreviousMonthRange, shouldRunMonthlyAgents } from "../feature-utils/dateHelpers";
import {
  callAgentWebhook,
  PROOFLINE_WEBHOOK,
  SUMMARY_WEBHOOK,
  REFERRAL_ENGINE_WEBHOOK,
  OPPORTUNITY_WEBHOOK,
  CRO_OPTIMIZER_WEBHOOK,
  COPY_COMPANION_WEBHOOK,
} from "./service.webhook-orchestrator";
import {
  buildProoflinePayload,
  buildSummaryPayload,
  buildReferralEnginePayload,
  buildOpportunityPayload,
  buildCroOptimizerPayload,
  buildCopyCompanionPayload,
} from "./service.agent-input-builder";
import {
  createTasksFromOpportunityOutput,
  createTasksFromCroOptimizerOutput,
  createTasksFromReferralEngineOutput,
} from "./service.task-creator";
import { resolveLocationId } from "../../../utils/locationResolver";

// =====================================================================
// DAILY AGENT PROCESSING
// =====================================================================

/**
 * Process daily agent (Proofline) for a single client
 * Returns output in memory without saving to DB
 */
export async function processDailyAgent(
  account: any,
  oauth2Client: any,
  dates: ReturnType<typeof getDailyDates>,
): Promise<{
  success: boolean;
  output?: any;
  payload?: any;
  rawData?: any;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;

  log(`  [DAILY] Processing Proofline agent for ${domain}`);

  try {
    // Parse property IDs
    const propertyIds: GooglePropertyIds =
      typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : account.google_property_ids;

    // Fetch data for day before yesterday (single day)
    log(
      `  [DAILY] Fetching data for ${dates.dayBeforeYesterday} (day before yesterday)`,
    );
    const dayBeforeYesterdayData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      dates.dayBeforeYesterday,
      dates.dayBeforeYesterday,
    );

    // Fetch data for yesterday (single day)
    log(`  [DAILY] Fetching data for ${dates.yesterday} (yesterday)`);
    const yesterdayData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      dates.yesterday,
      dates.yesterday,
    );

    // Prepare raw data for potential DB storage
    const rawData = {
      organization_id: account.organization_id,
      domain,
      date_start: dates.dayBeforeYesterday,
      date_end: dates.yesterday,
      run_type: "daily",
      gbp_data: {
        yesterday: yesterdayData.gbpData,
        dayBeforeYesterday: dayBeforeYesterdayData.gbpData,
      },
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Build payload and call Proofline agent
    const payload = buildProoflinePayload({
      domain,
      googleAccountId,
      dates,
      dayBeforeYesterdayData,
      yesterdayData,
    });

    log(`  [DAILY] Calling Proofline agent webhook`);
    const agentOutput = await callAgentWebhook(
      PROOFLINE_WEBHOOK,
      payload,
      "Proofline",
    );

    // Log and validate output
    logAgentOutput("Proofline", agentOutput);
    const isValid = isValidAgentOutput(agentOutput, "Proofline");

    if (!isValid) {
      return {
        success: false,
        error: "Agent returned empty or invalid output",
      };
    }

    log(`  [DAILY] \u2713 Proofline completed successfully`);
    return {
      success: true,
      output: agentOutput,
      payload,
      rawData,
    };
  } catch (error: any) {
    logError("processDailyAgent", error);
    return { success: false, error: error?.message || String(error) };
  }
}

// =====================================================================
// MONTHLY AGENTS PROCESSING
// =====================================================================

/**
 * Process monthly agents (Summary + Referral Engine + Opportunity + CRO Optimizer) for a single client
 * Returns outputs in memory without saving to DB
 */
export async function processMonthlyAgents(
  account: any,
  oauth2Client: any,
  monthRange: ReturnType<typeof getPreviousMonthRange>,
): Promise<{
  success: boolean;
  summaryOutput?: any;
  referralEngineOutput?: any;
  opportunityOutput?: any;
  croOptimizerOutput?: any;
  summaryPayload?: any;
  referralEnginePayload?: any;
  opportunityPayload?: any;
  croOptimizerPayload?: any;
  rawData?: any;
  skipped?: boolean;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain, organization_id: organizationId } = account;
  const { startDate, endDate } = monthRange;

  log(
    `  [MONTHLY] Processing Summary + Referral Engine + Opportunity + CRO Optimizer for ${domain} (${startDate} to ${endDate})`,
  );

  // Resolve location for this account
  const locationId = await resolveLocationId(organizationId);

  try {
    // Parse property IDs
    const propertyIds: GooglePropertyIds =
      typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : (account.google_property_ids || {});

    // Fetch month data (GBP)
    log(`  [MONTHLY] Fetching GBP data for ${startDate} to ${endDate}`);
    const monthData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      startDate,
      endDate,
    );

    // Fetch aggregated PMS data across all approved submissions
    log(`  [MONTHLY] Fetching aggregated PMS data for ${domain}`);
    let pmsData = null;
    try {
      const aggregated = await aggregatePmsData(domain);

      if (aggregated.months.length > 0) {
        // Use aggregated data structure for Summary agent
        pmsData = {
          monthly_rollup: aggregated.months.map((month) => ({
            month: month.month,
            self_referrals: month.selfReferrals,
            doctor_referrals: month.doctorReferrals,
            total_referrals: month.totalReferrals,
            production_total: month.productionTotal,
            sources: month.sources,
          })),
          sources_summary: aggregated.sources,
          totals: aggregated.totals,
          patient_records: aggregated.patientRecords,
        };
        log(
          `  [MONTHLY] \u2713 Aggregated PMS data found (${aggregated.months.length} months, ${aggregated.sources.length} sources, ${aggregated.patientRecords.length} patient records)`,
        );
      } else {
        log(`  [MONTHLY] \u26a0 No approved PMS data found`);
      }
    } catch (pmsError: any) {
      log(
        `  [MONTHLY] \u26a0 Error fetching aggregated PMS data: ${pmsError.message}`,
      );
    }

    // Prepare raw data for potential DB storage
    const rawData = {
      organization_id: account.organization_id,
      domain,
      date_start: startDate,
      date_end: endDate,
      run_type: "monthly",
      gbp_data: monthData.gbpData,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // === STEP 1: Run Summary Agent ===
    log(`  [MONTHLY] Calling Summary agent webhook`);
    const summaryPayload = buildSummaryPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      monthData,
      pmsData,
      clarityData: monthData.clarityData,
    });

    const summaryOutput = await callAgentWebhook(
      SUMMARY_WEBHOOK,
      summaryPayload,
      "Summary",
    );

    // Log and validate Summary output
    logAgentOutput("Summary", summaryOutput);
    const summaryValid = isValidAgentOutput(summaryOutput, "Summary");

    if (!summaryValid) {
      return {
        success: false,
        error: "Summary agent returned empty or invalid output",
      };
    }

    log(`  [MONTHLY] \u2713 Summary completed successfully`);

    // === STEP 2: Run Referral Analysis Engine (uses same raw data as Summary) ===
    log(`  [MONTHLY] Calling Referral Engine agent webhook`);
    const referralEnginePayload = buildReferralEnginePayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      monthData,
      pmsData,
      clarityData: monthData.clarityData,
    });

    const referralEngineOutput = await callAgentWebhook(
      REFERRAL_ENGINE_WEBHOOK,
      referralEnginePayload,
      "Referral Engine",
    );

    // Log and validate Referral Engine output
    logAgentOutput("Referral Engine", referralEngineOutput);
    const referralEngineValid = isValidAgentOutput(
      referralEngineOutput,
      "Referral Engine",
    );

    if (!referralEngineValid) {
      return {
        success: false,
        error: "Referral Engine agent returned empty or invalid output",
      };
    }

    log(`  [MONTHLY] \u2713 Referral Engine completed successfully`);

    // === STEP 3: Run Opportunity Agent (only uses Summary output) ===
    log(`  [MONTHLY] Calling Opportunity agent webhook`);
    const opportunityPayload = buildOpportunityPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      summaryOutput,
    });

    const opportunityOutput = await callAgentWebhook(
      OPPORTUNITY_WEBHOOK,
      opportunityPayload,
      "Opportunity",
    );

    // Log and validate Opportunity output
    logAgentOutput("Opportunity", opportunityOutput);
    const opportunityValid = isValidAgentOutput(
      opportunityOutput,
      "Opportunity",
    );

    if (!opportunityValid) {
      return {
        success: false,
        error: "Opportunity agent returned empty or invalid output",
      };
    }

    log(`  [MONTHLY] \u2713 Opportunity completed successfully`);

    // === STEP 4: Run CRO Optimizer Agent with retry logic ===
    log(`  [MONTHLY] Calling CRO Optimizer agent webhook (max 3 attempts)`);

    let croOptimizerOutput: any = null;
    let croOptimizerPayload: any = null;
    let croAttempt = 0;
    const MAX_CRO_ATTEMPTS = 3;

    for (croAttempt = 1; croAttempt <= MAX_CRO_ATTEMPTS; croAttempt++) {
      if (croAttempt > 1) {
        log(
          `  [MONTHLY] \ud83d\udd04 CRO Optimizer retry attempt ${croAttempt}/${MAX_CRO_ATTEMPTS}`,
        );
        log(`  [MONTHLY] Waiting 30 seconds before retry...`);
        await delay(30000);
      }

      try {
        croOptimizerPayload = buildCroOptimizerPayload({
          domain,
          googleAccountId,
          startDate,
          endDate,
          summaryOutput,
        });

        croOptimizerOutput = await callAgentWebhook(
          CRO_OPTIMIZER_WEBHOOK,
          croOptimizerPayload,
          "CRO Optimizer",
        );

        // Log and validate CRO Optimizer output
        logAgentOutput("CRO Optimizer", croOptimizerOutput);
        const croValid = isValidAgentOutput(
          croOptimizerOutput,
          "CRO Optimizer",
        );

        if (!croValid) {
          throw new Error(
            "CRO Optimizer agent returned empty or invalid output",
          );
        }

        log(
          `  [MONTHLY] \u2713 CRO Optimizer completed successfully on attempt ${croAttempt}`,
        );
        break; // Success, exit retry loop
      } catch (croError: any) {
        log(
          `  [MONTHLY] \u26a0 CRO Optimizer attempt ${croAttempt} failed: ${croError.message}`,
        );

        if (croAttempt === MAX_CRO_ATTEMPTS) {
          // All retries exhausted, fail the entire monthly run
          return {
            success: false,
            error: `CRO Optimizer failed after ${MAX_CRO_ATTEMPTS} attempts: ${croError.message}`,
          };
        }
      }
    }

    // === STEP 5: Create tasks from action items ===
    await createTasksFromOpportunityOutput(opportunityOutput, googleAccountId, domain, organizationId, locationId);

    // === STEP 6: Create tasks from CRO Optimizer action items ===
    await createTasksFromCroOptimizerOutput(croOptimizerOutput, googleAccountId, domain, organizationId, locationId);

    // === STEP 7: Create tasks from Referral Engine action items ===
    await createTasksFromReferralEngineOutput(referralEngineOutput, googleAccountId, domain, organizationId, locationId);

    return {
      success: true,
      summaryOutput,
      referralEngineOutput,
      opportunityOutput,
      croOptimizerOutput,
      summaryPayload,
      referralEnginePayload,
      opportunityPayload,
      croOptimizerPayload,
      rawData,
    };
  } catch (error: any) {
    logError("processMonthlyAgents", error);
    return { success: false, error: error?.message || String(error) };
  }
}

// =====================================================================
// GBP OPTIMIZER PROCESSING
// =====================================================================

/**
 * Process GBP Optimizer agent for a single client
 */
export async function processGBPOptimizerAgent(
  account: any,
  oauth2Client: any,
  monthRange: { startDate: string; endDate: string },
): Promise<{
  success: boolean;
  output?: any;
  payload?: any;
  rawData?: any;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;

  log(`\n  [GBP-OPTIMIZER] Starting processing for ${domain}`);
  log(
    `  [GBP-OPTIMIZER] Date range: ${monthRange.startDate} to ${monthRange.endDate}`,
  );

  try {
    // Import getGBPTextSources
    const { getGBPTextSources } = require("../../../routes/gbp");

    log(`  [GBP-OPTIMIZER] Fetching GBP text sources...`);
    const gbpData = await getGBPTextSources(
      oauth2Client,
      googleAccountId,
      monthRange.startDate,
      monthRange.endDate,
    );

    if (!gbpData.locations || gbpData.locations.length === 0) {
      log(`  [GBP-OPTIMIZER] \u26a0 No GBP locations found`);
      return {
        success: false,
        error: "No GBP locations found for this account",
      };
    }

    log(`  [GBP-OPTIMIZER] \u2713 Found ${gbpData.locations.length} location(s)`);

    // Log location details
    gbpData.locations.forEach((loc: any, idx: number) => {
      log(
        `    [${idx + 1}] ${loc.meta?.businessName || "Unknown"}: ${
          loc.gbp_posts.length
        } posts`,
      );
    });

    // Transform to Copy Companion format
    const payload = buildCopyCompanionPayload(gbpData, domain, googleAccountId);

    log(`  [GBP-OPTIMIZER] Calling Copy Companion agent...`);
    log(`  [GBP-OPTIMIZER] Webhook: ${COPY_COMPANION_WEBHOOK}`);
    log(
      `  [GBP-OPTIMIZER] Sending ${payload.additional_data.text_sources.length} text sources`,
    );

    const agentOutput = await callAgentWebhook(
      COPY_COMPANION_WEBHOOK,
      payload,
      "Copy Companion",
    );

    // Log and validate output
    logAgentOutput("Copy Companion", agentOutput);
    const isValid = isValidAgentOutput(agentOutput, "Copy Companion");

    if (!isValid) {
      log(`  [GBP-OPTIMIZER] \u2717 Agent returned invalid output`);
      return {
        success: false,
        error: "Agent returned empty or invalid output",
      };
    }

    // Count recommendations
    const recommendations = agentOutput[0] || {};
    const recCount = Object.keys(recommendations).length;
    log(`  [GBP-OPTIMIZER] \u2713 Received ${recCount} recommendation(s)`);

    log(`  [GBP-OPTIMIZER] \u2713 Copy Companion completed successfully`);

    return {
      success: true,
      output: agentOutput,
      payload,
      rawData: gbpData,
    };
  } catch (error: any) {
    logError("processGBPOptimizerAgent", error);
    log(`  [GBP-OPTIMIZER] \u2717 Failed: ${error?.message || String(error)}`);
    return { success: false, error: error?.message || String(error) };
  }
}

// =====================================================================
// CLIENT PROCESSING WITH RETRY
// =====================================================================

/**
 * Process a single client account with retry mechanism
 * Retries up to 3 times if agent outputs are invalid
 * Only saves to database after ALL validations pass
 */
export async function processClient(
  account: any,
  referenceDate?: string,
): Promise<{
  success: boolean;
  daily?: any;
  monthly?: any;
  error?: string;
  attempts?: number;
}> {
  const { id: googleAccountId, domain_name: domain } = account;
  const MAX_ATTEMPTS = 3;

  log(`\n[${"=".repeat(60)}]`);
  log(`[CLIENT] Processing: ${domain} (Account ID: ${googleAccountId})`);
  log(`[${"=".repeat(60)}]`);

  // Try up to MAX_ATTEMPTS times
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      log(
        `\n[CLIENT] \ud83d\udd04 RETRY ATTEMPT ${attempt}/${MAX_ATTEMPTS} for ${domain}`,
      );
      log(`[CLIENT] Waiting 30 seconds before retry...`);
      await delay(30000); // Wait 30 seconds between retries
    }

    try {
      // Get valid OAuth2 client (handles refresh automatically if needed)
      log(`[CLIENT] Getting valid OAuth2 client`);
      const oauth2Client = await getValidOAuth2Client(googleAccountId);

      // Get date ranges
      const dailyDates = getDailyDates(referenceDate);
      const monthRange = getPreviousMonthRange(referenceDate);

      // === STEP 1: Always run daily agent (collect in memory) ===
      log(`[CLIENT] Running daily agent (attempt ${attempt}/${MAX_ATTEMPTS})`);
      const dailyResult = await processDailyAgent(
        account,
        oauth2Client,
        dailyDates,
      );

      if (!dailyResult.success) {
        log(`[CLIENT] \u26a0 Daily agent failed: ${dailyResult.error}`);
        if (attempt < MAX_ATTEMPTS) {
          continue; // Retry
        }
        throw new Error(
          `Daily agent failed after ${MAX_ATTEMPTS} attempts: ${dailyResult.error}`,
        );
      }

      // === STEP 2: Conditionally run monthly agents (collect in memory) ===
      let monthlyResult: any = { skipped: true, reason: "conditions_not_met" };

      if (shouldRunMonthlyAgents(referenceDate)) {
        // Check for duplicate before running
        const existingSummary = await db("agent_results")
          .where({
            organization_id: account.organization_id,
            agent_type: "summary",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
          })
          .whereIn("status", ["success", "pending"])
          .first();

        if (existingSummary) {
          log(`[CLIENT] Monthly agents already completed - skipping`);
          monthlyResult = { skipped: true, reason: "already_exists" };
        } else {
          log(
            `[CLIENT] Running monthly agents (attempt ${attempt}/${MAX_ATTEMPTS})`,
          );
          monthlyResult = await processMonthlyAgents(
            account,
            oauth2Client,
            monthRange,
          );

          if (!monthlyResult.success && !monthlyResult.skipped) {
            log(`[CLIENT] \u26a0 Monthly agents failed: ${monthlyResult.error}`);
            if (attempt < MAX_ATTEMPTS) {
              continue; // Retry
            }
            throw new Error(
              `Monthly agents failed after ${MAX_ATTEMPTS} attempts: ${monthlyResult.error}`,
            );
          }
        }
      } else {
        log(`[CLIENT] Monthly conditions not met - skipping monthly agents`);
      }

      // === STEP 3: ALL VALIDATIONS PASSED - Save to database ===
      log(`[CLIENT] \u2713 All agent outputs validated successfully`);
      log(`[CLIENT] Persisting results to database...`);

      // Check for duplicate daily result before inserting
      const existingDaily = await db("agent_results")
        .where({
          organization_id: account.organization_id,
          agent_type: "proofline",
          date_start: dailyDates.dayBeforeYesterday,
          date_end: dailyDates.yesterday,
        })
        .whereIn("status", ["success", "pending"])
        .first();

      if (!existingDaily) {
        // Save daily raw data
        await db("google_data_store").insert(dailyResult.rawData);

        // Save daily agent result
        const [dailyResultId] = await db("agent_results")
          .insert({
            organization_id: account.organization_id,
            agent_type: "proofline",
            date_start: dailyDates.dayBeforeYesterday,
            date_end: dailyDates.yesterday,
            agent_input: JSON.stringify(dailyResult.payload),
            agent_output: JSON.stringify(dailyResult.output),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] \u2713 Daily result saved (ID: ${dailyResultId})`);
      } else {
        log(`[CLIENT] \u2139 Daily result already exists (ID: ${existingDaily.id})`);
      }

      // Save monthly results if they were run
      if (!monthlyResult.skipped && monthlyResult.success) {
        // Save monthly raw data
        await db("google_data_store").insert(monthlyResult.rawData);

        // Save Summary result
        const [summaryId] = await db("agent_results")
          .insert({
            organization_id: account.organization_id,
            agent_type: "summary",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(monthlyResult.summaryPayload),
            agent_output: JSON.stringify(monthlyResult.summaryOutput),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] \u2713 Summary result saved (ID: ${summaryId})`);

        // Save Opportunity result
        const [opportunityId] = await db("agent_results")
          .insert({
            organization_id: account.organization_id,
            agent_type: "opportunity",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(monthlyResult.opportunityPayload),
            agent_output: JSON.stringify(monthlyResult.opportunityOutput),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] \u2713 Opportunity result saved (ID: ${opportunityId})`);

        // Save Referral Engine result
        const [referralEngineId] = await db("agent_results")
          .insert({
            organization_id: account.organization_id,
            agent_type: "referral_engine",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(monthlyResult.referralEnginePayload),
            agent_output: JSON.stringify(monthlyResult.referralEngineOutput),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(
          `[CLIENT] \u2713 Referral Engine result saved (ID: ${referralEngineId})`,
        );

        // Save CRO Optimizer result
        const [croOptimizerId] = await db("agent_results")
          .insert({
            organization_id: account.organization_id,
            agent_type: "cro_optimizer",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
            agent_input: JSON.stringify(monthlyResult.croOptimizerPayload),
            agent_output: JSON.stringify(monthlyResult.croOptimizerOutput),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] \u2713 CRO Optimizer result saved (ID: ${croOptimizerId})`);
      }

      log(
        `[CLIENT] \u2713 ${domain} processing completed successfully on attempt ${attempt}`,
      );

      return {
        success: true,
        daily: dailyResult,
        monthly: monthlyResult,
        attempts: attempt,
      };
    } catch (error: any) {
      logError(`processClient - ${domain} (attempt ${attempt})`, error);

      // If this was the last attempt, save error to database
      if (attempt === MAX_ATTEMPTS) {
        try {
          await db("agent_results").insert({
            organization_id: account.organization_id,
            agent_type: "proofline",
            date_start: getDailyDates(referenceDate).dayBeforeYesterday,
            date_end: getDailyDates(referenceDate).yesterday,
            agent_input: null,
            agent_output: null,
            status: "error",
            error_message: `Failed after ${MAX_ATTEMPTS} attempts: ${
              error?.message || String(error)
            }`,
            created_at: new Date(),
            updated_at: new Date(),
          });
        } catch (dbError) {
          logError("Save error result to DB", dbError);
        }

        return {
          success: false,
          error: `Failed after ${MAX_ATTEMPTS} attempts: ${
            error?.message || String(error)
          }`,
          attempts: MAX_ATTEMPTS,
        };
      }

      // Not the last attempt, will retry
      log(`[CLIENT] \u26a0 Attempt ${attempt} failed, will retry...`);
    }
  }

  // Should never reach here, but just in case
  return {
    success: false,
    error: `Failed after ${MAX_ATTEMPTS} attempts`,
    attempts: MAX_ATTEMPTS,
  };
}
