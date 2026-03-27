import { PmActivityLogModel } from "../../models/PmActivityLogModel";
import { QueryContext } from "../../models/BaseModel";

interface LogParams {
  project_id: string;
  task_id?: string;
  user_id: number;
  action: string;
  metadata?: Record<string, unknown>;
}

export async function logPmActivity(
  params: LogParams,
  trx?: QueryContext
): Promise<void> {
  await PmActivityLogModel.create(
    {
      project_id: params.project_id,
      task_id: params.task_id || null,
      user_id: params.user_id,
      action: params.action,
      metadata: params.metadata || null,
    },
    trx
  );
}
