/**
 * Scheduler Processor
 *
 * Runs every 60 seconds via BullMQ repeatable job.
 * Checks `schedules` table for due jobs, executes them via the agent registry,
 * and records results in `schedule_runs`.
 */

import { Job } from "bullmq";
import { CronExpressionParser } from "cron-parser";
import { ScheduleModel, ScheduleRunModel, ISchedule } from "../../models/ScheduleModel";
import { getAgentHandler } from "../../services/agentRegistry";
import { checkGateStatus } from "../../services/agents/agentIdentity";

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
  const dueSchedules = await ScheduleModel.findDueSchedules();

  if (dueSchedules.length === 0) return;

  console.log(`[SCHEDULER] ${dueSchedules.length} schedule(s) due`);

  for (const schedule of dueSchedules) {
    // Skip if already running
    const isRunning = await ScheduleRunModel.hasActiveRun(schedule.id);
    if (isRunning) {
      console.log(`[SCHEDULER] Skipping "${schedule.agent_key}" — already running`);
      continue;
    }

    // Look up handler
    const agent = getAgentHandler(schedule.agent_key);
    if (!agent) {
      console.error(`[SCHEDULER] No handler registered for agent_key "${schedule.agent_key}"`);
      continue;
    }

    // Canon gate check: block agents that haven't passed governance
    const gate = await checkGateStatus(schedule.agent_key);
    if (!gate.allowed) {
      console.log(`[SCHEDULER] GATE BLOCKED "${schedule.agent_key}" -- ${gate.reason}`);
      const nextRunAt = computeNextRunAt(schedule);
      await ScheduleModel.updateById(schedule.id, { next_run_at: nextRunAt });
      continue;
    }

    console.log(`[SCHEDULER] Executing "${schedule.agent_key}" (${agent.displayName})`);

    // Create run record
    const run = await ScheduleRunModel.createRun(schedule.id);

    try {
      const result = await agent.handler();

      await ScheduleRunModel.completeRun(run.id, result.summary);

      // Update schedule: last_run_at + next_run_at
      const nextRunAt = computeNextRunAt(schedule);
      await ScheduleModel.updateById(schedule.id, {
        last_run_at: new Date(),
        next_run_at: nextRunAt,
      });

      console.log(`[SCHEDULER] "${schedule.agent_key}" completed. Next run: ${nextRunAt.toISOString()}`);
    } catch (error: any) {
      console.error(`[SCHEDULER] "${schedule.agent_key}" failed:`, error.message);
      await ScheduleRunModel.failRun(run.id, error.message || String(error));

      // Still advance next_run_at so we don't retry immediately
      const nextRunAt = computeNextRunAt(schedule);
      await ScheduleModel.updateById(schedule.id, {
        last_run_at: new Date(),
        next_run_at: nextRunAt,
      });
    }
  }
}
