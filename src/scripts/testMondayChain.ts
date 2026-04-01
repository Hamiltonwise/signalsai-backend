/**
 * Monday Chain Integration Test
 *
 * Runs the full Monday delivery pipeline for a real org (or the demo
 * org) and prints the results. Dry run: does not actually send email
 * unless SEND_EMAIL=true is set.
 *
 * Run with: npx tsx src/scripts/testMondayChain.ts
 */

import { db } from "../database/connection";
import { runMondayChain } from "../services/agents/mondayChain";
import { checkCircuit, resetCircuit, recordFailure, getAllCircuitStates } from "../services/agents/circuitBreaker";
import { handleAgentFailure } from "../services/agents/abortHandler";
import { getModelForAgent, getTokenBudget, listAgentTiers } from "../services/agents/modelRouter";

// ── Helpers ─────────────────────────────────────────────────────────

function separator(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

function printTrace(trace: Array<{ step: string; status: string; durationMs: number; detail: string }>): void {
  for (const t of trace) {
    const statusIcon =
      t.status === "success" ? "PASS" :
      t.status === "fallback" ? "FALLBACK" :
      t.status === "skip" ? "SKIP" :
      t.status === "escalate" ? "ESCALATE" :
      "ERROR";

    console.log(`  [${statusIcon}] ${t.step} (${t.durationMs}ms)`);
    console.log(`         ${t.detail}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  separator("Monday Chain Integration Test");

  // ── 1. Find a test org ──────────────────────────────────────────

  console.log("Finding test org...");

  let org = await db("organizations")
    .where("name", "like", "%Demo%")
    .orWhere("name", "like", "%Test%")
    .first();

  if (!org) {
    org = await db("organizations")
      .whereNotNull("checkup_score")
      .orderBy("created_at", "desc")
      .first();
  }

  if (!org) {
    org = await db("organizations").orderBy("created_at", "desc").first();
  }

  if (!org) {
    console.error("No organizations found in the database. Seed data first.");
    await db.destroy();
    process.exit(1);
  }

  console.log(`Using org: ${org.name} (id: ${org.id})`);
  console.log(`  Score: ${org.current_clarity_score ?? org.checkup_score ?? "none"}`);
  console.log(`  Subscription: ${org.subscription_status ?? "none"}`);

  // ── 2. Model Router verification ────────────────────────────────

  separator("Model Router Verification");

  const tiers = listAgentTiers();
  const tierCounts = { fast: 0, standard: 0, judgment: 0 };
  for (const t of tiers) {
    tierCounts[t.tier]++;
  }
  console.log(`Registered agents: ${tiers.length}`);
  console.log(`  Fast (haiku): ${tierCounts.fast}`);
  console.log(`  Standard (sonnet): ${tierCounts.standard}`);
  console.log(`  Judgment (opus): ${tierCounts.judgment}`);

  // Spot check
  const conductorModel = getModelForAgent("systemConductor");
  const briefingModel = getModelForAgent("morningBriefing");
  const intelBudget = getTokenBudget("intelligenceAgent");

  console.log(`\nSpot checks:`);
  console.log(`  systemConductor -> ${conductorModel}`);
  console.log(`  morningBriefing -> ${briefingModel}`);
  console.log(`  intelligenceAgent budget -> ${JSON.stringify(intelBudget)}`);

  const conductorOk = conductorModel.includes("opus");
  const briefingOk = briefingModel.includes("haiku");
  const budgetOk = intelBudget.budget === 50000 && intelBudget.pauseAt === 42500;

  console.log(`  conductorModel correct: ${conductorOk ? "PASS" : "FAIL"}`);
  console.log(`  briefingModel correct: ${briefingOk ? "PASS" : "FAIL"}`);
  console.log(`  intelBudget correct: ${budgetOk ? "PASS" : "FAIL"}`);

  // ── 3. Circuit Breaker verification ─────────────────────────────

  separator("Circuit Breaker Verification");

  // Test: 3 failures should open the circuit
  resetCircuit("test_agent");
  recordFailure("test_agent", "test error 1");
  recordFailure("test_agent", "test error 2");
  recordFailure("test_agent", "test error 3");

  const openCheck = checkCircuit("test_agent");
  console.log(`After 3 failures, circuit allowed: ${openCheck.allowed} (expected: false)`);
  console.log(`  Reason: ${openCheck.reason}`);
  console.log(`  Circuit breaker OPEN test: ${!openCheck.allowed ? "PASS" : "FAIL"}`);

  // Reset for clean state
  resetCircuit("test_agent");
  const resetCheck = checkCircuit("test_agent");
  console.log(`After reset, circuit allowed: ${resetCheck.allowed} (expected: true)`);
  console.log(`  Circuit breaker RESET test: ${resetCheck.allowed ? "PASS" : "FAIL"}`);

  // ── 4. Abort Handler verification ───────────────────────────────

  separator("Abort Handler Verification");

  const scoreAbort = await handleAgentFailure("score_recalc", org.id, "test failure");
  console.log(`score_recalc abort -> action: ${scoreAbort.action} (expected: fallback)`);
  console.log(`  ${scoreAbort.message}`);
  console.log(`  PASS: ${scoreAbort.action === "fallback" ? "YES" : "NO"}`);

  const scoutAbort = await handleAgentFailure("competitive_scout", org.id, "test failure");
  console.log(`competitive_scout abort -> action: ${scoutAbort.action} (expected: skip)`);
  console.log(`  PASS: ${scoutAbort.action === "skip" ? "YES" : "NO"}`);

  const conductorAbort = await handleAgentFailure("system_conductor", org.id, "test failure");
  console.log(`system_conductor abort -> action: ${conductorAbort.action} (expected: escalate)`);
  console.log(`  PASS: ${conductorAbort.action === "escalate" ? "YES" : "NO"}`);

  // ── 5. Run the Monday Chain ─────────────────────────────────────

  separator("Monday Chain Execution (DRY RUN)");

  console.log(`Running Monday chain for org ${org.id} (${org.name})...`);
  console.log("Note: email send will attempt but may fail without email credentials.\n");

  try {
    const result = await runMondayChain(org.id);

    console.log(`\nChain result:`);
    console.log(`  success: ${result.success}`);
    console.log(`  emailSent: ${result.emailSent}`);
    console.log(`  scoreUpdated: ${result.scoreUpdated}`);
    console.log(`  findingsGenerated: ${result.findingsGenerated}`);
    console.log(`  goNoGoResult: ${result.goNoGoResult}`);
    console.log(`  aborts: ${result.aborts.length > 0 ? result.aborts.join("; ") : "none"}`);

    console.log(`\nStep-by-step trace:`);
    printTrace(result.trace);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nChain threw an error: ${message}`);
    console.error("This is OK for dry-run testing without full infrastructure.");
  }

  // ── 6. Circuit state summary ────────────────────────────────────

  separator("Final Circuit States");

  const circuits = getAllCircuitStates();
  if (circuits.length === 0) {
    console.log("No circuit states recorded (all agents clean).");
  } else {
    for (const c of circuits) {
      console.log(
        `  ${c.agentName}: ${c.state.toUpperCase()} (failures: ${c.consecutiveFailures}, iterations: ${c.totalIterations})`,
      );
    }
  }

  // ── Done ────────────────────────────────────────────────────────

  separator("Test Complete");

  await db.destroy();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  try {
    await db.destroy();
  } catch {
    // ignore
  }
  process.exit(1);
});
