import { AgentResultModel } from "../../../models/AgentResultModel";

export async function deleteSingle(id: number): Promise<void> {
  const output = await AgentResultModel.findById(id);

  if (!output) {
    const error = new Error("Agent output not found");
    (error as any).statusCode = 404;
    (error as any).errorCode = "NOT_FOUND";
    throw error;
  }

  await AgentResultModel.deleteById(id);
}
