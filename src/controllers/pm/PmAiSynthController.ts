import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { runAgent } from "../../agents/service.llm-runner";
import { loadPrompt } from "../../agents/service.prompt-loader";
import { extractTextFromFile } from "../../utils/pmFileExtract";
import { PmTaskModel } from "../../models/PmTaskModel";
import { PmAiSynthBatchModel } from "../../models/PmAiSynthBatchModel";
import { PmAiSynthBatchTaskModel } from "../../models/PmAiSynthBatchTaskModel";
import { db } from "../../database/connection";
import { logPmActivity } from "./pmActivityLogger";

function handleError(res: Response, error: unknown, operation: string): Response {
  console.error(`[PM-AI-SYNTH] ${operation} failed:`, error);
  return res.status(500).json({ success: false, error: "Failed to process. Please try again." });
}

// POST /api/pm/ai-synth/extract — create batch + extract tasks
export async function extractBatch(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { project_id, text } = req.body;
    if (!project_id) return res.status(400).json({ success: false, error: "project_id is required" });

    let inputText: string;
    let filename: string | null = null;

    if (req.file) {
      inputText = await extractTextFromFile(req.file.buffer, req.file.mimetype, req.file.originalname);
      filename = req.file.originalname;
    } else if (text) {
      inputText = text;
    } else {
      return res.status(400).json({ success: false, error: "Provide text or upload a file." });
    }

    if (inputText.length > 50_000) inputText = inputText.slice(0, 50_000) + "\n\n[truncated]";
    if (!inputText.trim()) return res.status(400).json({ success: false, error: "Text is empty." });

    // Create batch record
    const batch = await PmAiSynthBatchModel.create({
      project_id,
      source_text: inputText,
      source_filename: filename,
      status: "synthesizing",
      created_by: req.user!.userId,
    });

    // Call Claude
    const systemPrompt = loadPrompt("pmAgents/AISynth");
    const result = await runAgent({ systemPrompt, userMessage: inputText, maxTokens: 4096, temperature: 0 });

    let proposedTasks = result.parsed;
    if (!Array.isArray(proposedTasks)) {
      try {
        const raw = result.raw.trim();
        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start >= 0 && end > start) proposedTasks = JSON.parse(raw.slice(start, end + 1));
      } catch { /* empty */ }
    }

    if (!Array.isArray(proposedTasks)) {
      await db("pm_ai_synth_batches").where({ id: batch.id }).update({ status: "completed", total_proposed: 0 });
      return res.status(422).json({ success: false, error: "AI returned unexpected format." });
    }

    // Insert proposed tasks
    const validated = proposedTasks.filter((t: any) => t?.title?.trim());
    const batchTasks = [];
    for (const t of validated) {
      const bt = await PmAiSynthBatchTaskModel.create({
        batch_id: batch.id,
        title: t.title.trim(),
        description: t.description || null,
        priority: ["P1", "P2", "P3", "P4", "P5"].includes(t.priority) ? t.priority : "P4",
        deadline_hint: t.deadline_hint || null,
        status: "pending",
      });
      batchTasks.push(bt);
    }

    await db("pm_ai_synth_batches").where({ id: batch.id }).update({
      status: "pending_review",
      total_proposed: validated.length,
    });

    const updatedBatch = await PmAiSynthBatchModel.findById(batch.id);
    return res.status(201).json({ success: true, data: { ...updatedBatch, tasks: batchTasks } });
  } catch (error: any) {
    // If batch was created but extraction failed, mark it as failed
    if (error?.batchId || (error as any)?.batch_id) {
      // batch variable may not be in scope
    }
    console.error(`[PM-AI-SYNTH] extractBatch failed:`, error);
    // Try to clean up any orphaned "synthesizing" batches for this request
    try {
      await db("pm_ai_synth_batches")
        .where({ status: "synthesizing", created_by: req.user?.userId })
        .where("created_at", ">", db.raw("NOW() - INTERVAL '5 minutes'"))
        .update({ status: "failed" });
    } catch { /* ignore cleanup errors */ }
    return res.status(500).json({ success: false, error: "Failed to extract tasks. Please try again." });
  }
}

// GET /api/pm/ai-synth/batches?project_id=X
export async function listBatches(req: AuthRequest, res: Response): Promise<any> {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) return res.status(400).json({ success: false, error: "project_id required" });

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [countResult] = await db("pm_ai_synth_batches").where({ project_id: projectId }).count("* as count");
    const total = parseInt(countResult.count as string, 10) || 0;

    const batches = await db("pm_ai_synth_batches")
      .where({ project_id: projectId })
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    return res.json({ success: true, data: batches, total });
  } catch (error) {
    return handleError(res, error, "listBatches");
  }
}

// GET /api/pm/ai-synth/batches/:batchId
export async function getBatch(req: AuthRequest, res: Response): Promise<any> {
  try {
    const batch = await PmAiSynthBatchModel.findById(req.params.batchId);
    if (!batch) return res.status(404).json({ success: false, error: "Batch not found" });

    const tasks = await db("pm_ai_synth_batch_tasks")
      .where({ batch_id: batch.id })
      .orderBy("created_at", "asc");

    return res.json({ success: true, data: { ...batch, tasks } });
  } catch (error) {
    return handleError(res, error, "getBatch");
  }
}

// PUT /api/pm/ai-synth/batches/:batchId/tasks/:taskId/approve
export async function approveTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { batchId, taskId } = req.params;
    const batchTask = await PmAiSynthBatchTaskModel.findById(taskId);
    if (!batchTask || batchTask.batch_id !== batchId) return res.status(404).json({ success: false, error: "Task not found" });
    if (batchTask.status !== "pending") return res.status(400).json({ success: false, error: "Task already resolved" });

    const batch = await PmAiSynthBatchModel.findById(batchId);

    // Find Backlog column for this project
    const backlogCol = await db("pm_columns").where({ project_id: batch.project_id, name: "Backlog" }).first();
    if (!backlogCol) return res.status(400).json({ success: false, error: "Backlog column not found" });

    const realTask = await db.transaction(async (trx) => {
      // Shift existing backlog tasks
      await trx("pm_tasks").where({ column_id: backlogCol.id }).increment("position", 1);

      const task = await PmTaskModel.create({
        project_id: batch.project_id,
        column_id: backlogCol.id,
        title: batchTask.title,
        description: batchTask.description,
        priority: null, // Backlog = no priority
        deadline: null,
        position: 0,
        created_by: req.user!.userId,
        source: "ai_synth",
      }, trx);

      await logPmActivity({
        project_id: batch.project_id,
        task_id: task.id,
        user_id: req.user!.userId,
        action: "task_created",
        metadata: { source: "ai_synth", batch_id: batchId },
      }, trx);

      // Update batch task
      await trx("pm_ai_synth_batch_tasks").where({ id: taskId }).update({ status: "approved", created_task_id: task.id });

      // Update batch counters
      await trx("pm_ai_synth_batches").where({ id: batchId }).increment("total_approved", 1);

      return task;
    });

    // Check if all resolved
    const pending = await db("pm_ai_synth_batch_tasks").where({ batch_id: batchId, status: "pending" }).count("* as count");
    if (parseInt((pending[0] as any).count, 10) === 0) {
      await db("pm_ai_synth_batches").where({ id: batchId }).update({ status: "completed" });
    }

    return res.json({ success: true, data: { batch_task_id: taskId, created_task_id: realTask.id } });
  } catch (error) {
    return handleError(res, error, "approveTask");
  }
}

// PUT /api/pm/ai-synth/batches/:batchId/tasks/:taskId/reject
export async function rejectTask(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { batchId, taskId } = req.params;
    const batchTask = await PmAiSynthBatchTaskModel.findById(taskId);
    if (!batchTask || batchTask.batch_id !== batchId) return res.status(404).json({ success: false, error: "Task not found" });
    if (batchTask.status !== "pending") return res.status(400).json({ success: false, error: "Task already resolved" });

    await db("pm_ai_synth_batch_tasks").where({ id: taskId }).update({ status: "rejected" });
    await db("pm_ai_synth_batches").where({ id: batchId }).increment("total_rejected", 1);

    const pending = await db("pm_ai_synth_batch_tasks").where({ batch_id: batchId, status: "pending" }).count("* as count");
    if (parseInt((pending[0] as any).count, 10) === 0) {
      await db("pm_ai_synth_batches").where({ id: batchId }).update({ status: "completed" });
    }

    return res.json({ success: true, data: { batch_task_id: taskId, status: "rejected" } });
  } catch (error) {
    return handleError(res, error, "rejectTask");
  }
}

// DELETE /api/pm/ai-synth/batches/:batchId — delete batch and its tasks
export async function deleteBatch(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { batchId } = req.params;
    const batch = await PmAiSynthBatchModel.findById(batchId);
    if (!batch) return res.status(404).json({ success: false, error: "Batch not found" });

    // CASCADE deletes batch_tasks too
    await PmAiSynthBatchModel.deleteById(batchId);
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteBatch");
  }
}
