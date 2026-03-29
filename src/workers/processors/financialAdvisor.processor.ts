/**
 * Financial Advisor Agent Processor -- BullMQ job handler
 *
 * Runs monthly (1st Monday 7:30 AM PT) for full brief.
 * Runs weekly for price checks.
 * Fetches crypto prices, calculates exit math, generates insights.
 */

import type { Job } from "bullmq";
import {
  runFinancialAdvisorBrief,
  runWeeklyPriceCheck,
} from "../../services/agents/financialAdvisor";

export async function processFinancialAdvisor(job: Job): Promise<void> {
  console.log(`[FinancialAdvisor] Processing job ${job.id} (${job.name})...`);

  if (job.name === "weekly-price-check") {
    const prices = await runWeeklyPriceCheck();
    console.log(
      `[FinancialAdvisor] Price check: SOL $${prices.solana ?? "N/A"}, BTC $${prices.bitcoin ?? "N/A"}`,
    );
  } else {
    const brief = await runFinancialAdvisorBrief();
    console.log(
      `[FinancialAdvisor] Brief complete: ${brief.insights.length} insights, ${brief.qsbsExitMath.length} exit scenarios`,
    );
  }
}
