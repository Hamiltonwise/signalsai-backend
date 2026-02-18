import { AgentResultModel } from "../../../models/AgentResultModel";

export async function archiveSingle(id: number): Promise<void> {
  const output = await AgentResultModel.findById(id);

  if (!output) {
    const error = new Error("Agent output not found");
    (error as any).statusCode = 404;
    (error as any).errorCode = "NOT_FOUND";
    throw error;
  }

  if (output.status === "archived") {
    const error = new Error("Agent output is already archived");
    (error as any).statusCode = 400;
    (error as any).errorCode = "ALREADY_ARCHIVED";
    throw error;
  }

  await AgentResultModel.archive(id);
}

export async function unarchiveSingle(id: number): Promise<void> {
  const output = await AgentResultModel.findById(id);

  if (!output) {
    const error = new Error("Agent output not found");
    (error as any).statusCode = 404;
    (error as any).errorCode = "NOT_FOUND";
    throw error;
  }

  if (output.status !== "archived") {
    const error = new Error("Agent output is not archived");
    (error as any).statusCode = 400;
    (error as any).errorCode = "NOT_ARCHIVED";
    throw error;
  }

  await AgentResultModel.unarchive(id);
}
