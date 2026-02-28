import { Request, Response } from "express";
import {
  SkillWorkRunModel,
  WorkRunStatus,
} from "../../models/SkillWorkRunModel";
import { evaluateAutoPipeline } from "./feature-services/service.minds-work-pipeline";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Middleware: validate x-internal-key header
 */
export function validateInternalKey(
  req: Request,
  res: Response,
  next: () => void
): any {
  const key = req.headers["x-internal-key"] as string;
  if (!INTERNAL_API_KEY) {
    return res.status(500).json({ error: "INTERNAL_API_KEY not configured" });
  }
  if (!key || key !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Invalid internal key" });
  }
  next();
}

/**
 * PATCH /api/internal/skill-work-runs/:workRunId
 * n8n calls this to update work run status + artifact data.
 */
export async function updateWorkRunStatus(
  req: Request,
  res: Response
): Promise<any> {
  const { workRunId } = req.params;
  const {
    status,
    title,
    description,
    artifact_url,
    artifact_content,
    artifact_type,
    n8n_run_id,
    error,
  } = req.body;

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  const workRun = await SkillWorkRunModel.findById(workRunId);
  if (!workRun) {
    return res.status(404).json({ error: "Work run not found" });
  }

  // Validate status transition
  if (!SkillWorkRunModel.isValidTransition(workRun.status, status as WorkRunStatus)) {
    return res.status(400).json({
      error: `Invalid status transition: ${workRun.status} → ${status}`,
    });
  }

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (artifact_url !== undefined) updateData.artifact_url = artifact_url;
  if (artifact_content !== undefined) updateData.artifact_content = artifact_content;
  if (artifact_type !== undefined) updateData.artifact_type = artifact_type;
  if (n8n_run_id !== undefined) updateData.n8n_run_id = n8n_run_id;
  if (error !== undefined) updateData.error = error;

  await SkillWorkRunModel.updateStatus(
    workRunId,
    status as WorkRunStatus,
    updateData
  );

  console.log(
    `[INTERNAL] Work run ${workRunId} status updated: ${workRun.status} → ${status}`
  );

  // If status is now awaiting_review, evaluate auto-pipeline (async, non-blocking)
  if (status === "awaiting_review") {
    evaluateAutoPipeline(workRunId).catch((err) => {
      console.error(`[INTERNAL] Auto-pipeline evaluation failed for ${workRunId}:`, err);
    });
  }

  return res.json({ success: true, status });
}
