import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface IMindSyncStep {
  id: string;
  sync_run_id: string;
  step_order: number;
  step_name: string;
  status: StepStatus;
  log_output: string;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
}

export class MindSyncStepModel extends BaseModel {
  protected static tableName = "minds.mind_sync_steps";

  static async createSteps(
    syncRunId: string,
    stepNames: string[],
    trx?: QueryContext
  ): Promise<IMindSyncStep[]> {
    const rows = stepNames.map((name, index) => ({
      sync_run_id: syncRunId,
      step_order: index + 1,
      step_name: name,
      status: "pending" as const,
      log_output: "",
    }));
    return this.table(trx).insert(rows).returning("*");
  }

  static async listByRun(syncRunId: string, trx?: QueryContext): Promise<IMindSyncStep[]> {
    return this.table(trx)
      .where({ sync_run_id: syncRunId })
      .orderBy("step_order", "asc");
  }

  static async markRunning(stepId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: stepId }).update({
      status: "running",
      started_at: new Date(),
    });
  }

  static async markCompleted(stepId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: stepId }).update({
      status: "completed",
      finished_at: new Date(),
    });
  }

  static async markFailed(stepId: string, errorMessage: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id: stepId }).update({
      status: "failed",
      error_message: errorMessage,
      finished_at: new Date(),
    });
  }

  static async appendLog(stepId: string, message: string, trx?: QueryContext): Promise<number> {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    return this.table(trx)
      .where({ id: stepId })
      .update({
        log_output: db.raw("log_output || ?", [logLine]),
      });
  }
}
