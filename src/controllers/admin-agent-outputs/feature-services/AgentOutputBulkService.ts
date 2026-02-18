import { AgentResultModel } from "../../../models/AgentResultModel";

export async function bulkArchive(ids: number[]): Promise<number> {
  return AgentResultModel.bulkArchive(ids);
}

export async function bulkUnarchive(ids: number[]): Promise<number> {
  return AgentResultModel.bulkUnarchive(ids);
}

export async function bulkDelete(ids: number[]): Promise<number> {
  return AgentResultModel.bulkDelete(ids);
}
