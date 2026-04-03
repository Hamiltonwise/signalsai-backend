/**
 * Scheduler Processor
 *
 * Runs every 60 seconds via BullMQ repeatable job.
 * Checks `schedules` table for due jobs, executes them via the agent registry,
 * and records results in `schedule_runs`.
 *
 * Security stack (every agent flows through this automatically):
 *   1. Kill Switch check (blocks ALL agents if active)
 *   2. Circuit Breaker check (blocks agents with 3+ consecutive failures)
 *   3. Canon Gate check (FAIL=blocked, PENDING=observe, PASS=full)
 *   4. Agent Identity startRun (UUID run tracking, quarantine check)
 *   5. Handler execution
 *   6. Circuit Breaker success/failure recording
 *   7. Agent Identity endRun (run lifecycle close)
 */

import { Job } from "bullmq";
import { CronExpressionParser } from "cron-parser";
import { ScheduleModel, ScheduleRunModel, ISchedule } from "../../models/ScheduleModel";
import { getAgentHandler } from "../../services/agentRegistry";
import { checkGateStatus, startRun, endRun } from "../../services/agents/agentIdentity";
import { checkCircuit, recordSuccess, recordFailure } from "../../services/agents/circuitBreaker";
import { isKillSwitchActive } from "../../services/agents/killSwitch";
import { db } from "../../database/connection";

function computeNextRunAt(schedule: ISchedule): Date {
  if (schedule.schedule_type === "cron" && schedule.cron_expression) {
    const interval = CronExpressionParser.parse(schedule.cron_expression, {
      currentDate: new Date(),
      tz: schedule.timezone || "UTC",
    });
    return interval.next().toDate();
  }

  if (schedule.schedule_type === "interval_days" && schedule.interval_days) {
    return new Date(Date.now() + schedule.interval_days * 24 * 60 * 60 * 1000);
  }

  // Fallback: 24 hours from now
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

export async function processSchedulerTick(_job: Job): Promise<void> {
  // ── Layer 1: Kill Switch ──
  // If active, no agent runs. Period.
  try {
    const killSwitch = await isKillSwitchActive();
    if (killSwitch.active) {
      console.log(`[SCHEDULER] KILL SWITCH ACTIVE: "${killSwitch.reason}" -- all agents halted`);
      return;
    }
  } catch {
    // Kill switch check failure should not block all agents
    // Circuit breaker has its own sync check as backup
  }

  const dueSchedules = await ScheduleModel.findDueSchedules();

  if (dueSchedules.length === 0) return;

  console.log(`[SCHEDULER] ${dueSchedules.length} schedule(s) due`);

  for (const schedule of dueSchedules) {
    // Skip if already running
    const isRunning = await ScheduleRunModel.hasActiveRun(schedule.id);
    if (isRunning) {
      console.log(`[SCHEDULER] Skipping "${schedule.agent_key}" -- already running`);
      continue;
    }

    // Look up handler
    const agent = getAgentHandler(schedule.agent_key);
    if (!agent) {
      console.error(`[SCHEDULER] No handler registered for agent_key "${schedule.agent_key}"`);
      continue;
    }

    // ── Layer 2: Circuit Breaker ──
    // Blocks agents with 3+ consecutive failures (5-min cooldown)
    const circuit = checkCircuit(schedule.agent_key);
    if (!circuit.allowed) {
      console.log(`[SCHEDULER] CIRCUIT OPEN "${schedule.agent_key}" -- ${circuit.reason}`);
      const nextRunAt = computeNextRunAt(schedule);
      await ScheduleModel.updateById(schedule.id, { next_run_at: nextRunAt });
      continue;
    }

    // ── Layer 3: Canon Gate ──
    //   FAIL    -> fully stopped, skip entirely
    //   PENDING -> observe mode (runs, but action scopes denied by checkScope)
    //   PASS    -> full autonomy
    const gate = await checkGateStatus(schedule.agent_key);
    if (!gate.allowed) {
      console.log(`[SCHEDULER] GATE BLOCKED "${schedule.agent_key}" -- ${gate.reason}`);
      const nextRunAt = computeNextRunAt(schedule);
      await ScheduleModel.updateById(schedule.id, { next_run_at: nextRunAt });
      continue;
    }

    const modeLabel = gate.mode === "observe" ? " [OBSERVE]" : "";

    // ── Layer 4: Agent Identity ──
    // Start a tracked run with UUID. Checks quarantine status.
    let identityRun: { agentId: string; runId: string } | null = null;
    try {
      identityRun = await startRun(schedule.agent_key);
      if (!identityRun) {
        console.log(`[SCHEDULER] IDENTITY BLOCKED "${schedule.agent_key}" -- quarantined or unknown`);
        const nextRunAt = computeNextRunAt(schedule);
        await ScheduleModel.updateById(schedule.id, { next_run_at: nextRunAt });
        continue;
      }
    } catch {
      // Identity system failure should not block agent execution
      // Log it but continue
      console.warn(`[SCHEDULER] Identity startRun failed for "${schedule.agent_key}", continuing without tracking`);
    }

    console.log(
      `[SCHEDULER] Executing "${schedule.agent_key}" (${agent.displayName})${modeLabel}` +
      (identityRun ? ` [run:${identityRun.runId.slice(0, 8)}]` : ""),
    );

    // ── Layer 5: Handler Execution ──
    const run = await ScheduleRunModel.createRun(schedule.id);

    try {
      const result = await agent.handler();

      await ScheduleRunModel.completeRun(run.id, result.summary);

      // ── Layer 6: Record success ──
      recordSuccess(schedule.agent_key);

      // Update dream_team_nodes health_status so Mission Control reflects reality
      try {
        await db("dream_team_nodes")
          .where({ agent_key: schedule.agent_key, is_active: true })
          .update({ health_status: "green", updated_at: new Date() });
      } catch {
        // Non-critical: node may not exist for this agent
      }

      if (identityRun) {
        try {
          await endRun(identityRun.agentId, identityRun.runId, true, "Completed successfully");
        } catch {
          // Non-critical
        }
      }

      // Update schedule: last_run_at + next_run_at
      const nextRunAt = computeNextRunAt(schedule);
      await ScheduleModel.updateById(schedule.id, {
        last_run_at: new Date(),
        next_run_at: nextRunAt,
      });

      console.log(`[SCHEDULER] "${schedule.agent_key}" completed. Next run: ${nextRunAt.toISOString()}`);
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.error(`[SCHEDULER] "${schedule.agent_key}" failed:`, errorMsg);
      await ScheduleRunModel.failRun(run.id, errorMsg);

      // ── Layer 6: Record failure ──
      recordFailure(schedule.agent_key, errorMsg);

      // Update dream_team_nodes to red so Mission Control shows the failure
      try {
        await db("dream_team_nodes")
          .where({ agent_key: schedule.agent_key, is_active: true })
          .update({ health_status: "red", updated_at: new Date() });
      } catch {
        // Non-critical
      }

      if (identityRun) {
        try {
          await endRun(identityRun.agentId, identityRun.runId, false, errorMsg);
        } catch {
          // Non-critical
        }
      }

      // Still advance next_run_at so we don't retry immediately
      const nextRunAt = computeNextRunAt(schedule);
      await ScheduleModel.updateById(schedule.id, {
        last_run_at: new Date(),
        next_run_at: nextRunAt,
      });
    }
  }
}
