/**
 * Fireflies → Dream Team Tasks Integration
 *
 * POST /api/admin/fireflies-webhook
 *   Receives a Fireflies "meeting ended" webhook.
 *   Extracts action items from the transcript using Claude API.
 *   Maps each action item to an owner (Corey/Jo/Dave) and Dream Team node.
 *   Creates tasks in dream_team_tasks.
 *   Returns a summary of tasks created.
 *
 * GET /api/admin/dream-team-tasks
 *   Lists tasks with optional filters (owner, status, node_id).
 *
 * PATCH /api/admin/dream-team-tasks/:id
 *   Updates task status.
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const firefliesRoutes = express.Router();

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

// ─── Known owners and their aliases ─────────────────────────────────

const OWNER_ALIASES: Record<string, string[]> = {
  Corey: ["corey", "corey wise", "cor"],
  Jo: ["jo", "joanne", "joanna", "jo wise"],
  Dave: ["dave", "david", "dev"],
};

// Department keywords → Dream Team node matching
const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  "Content + AEO": ["content", "aeo", "article", "blog", "video", "seo", "writing", "distribution"],
  Sales: ["sales", "prospect", "outreach", "lead", "pipeline", "demo", "close", "follow-up"],
  "Client Success": ["client", "onboarding", "retention", "proofline", "churn", "support", "cs"],
  Intelligence: ["intelligence", "market", "competitor", "monitor", "brief", "signal", "data"],
  Product: ["product", "feature", "spec", "qa", "test", "build", "bug", "deploy"],
  Operations: ["ops", "operations", "it", "finance", "compliance", "infrastructure", "server"],
};

// ─── Action item extraction via Claude ──────────────────────────────

interface ExtractedTask {
  owner: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "urgent";
  department: string | null;
  dueDate: string | null;
}

async function extractActionItems(
  transcript: string,
  meetingTitle: string,
): Promise<ExtractedTask[]> {
  const client = getAnthropic();

  const response = await client.messages.create({
    model: LLM_MODEL,
    max_tokens: 2000,
    system: `You extract action items from meeting transcripts. The team has three people:
- Corey (CEO/Visionary) — owns vision, product direction, client relationships, demos
- Jo (COO/Integrator) — owns operations, processes, client success, onboarding, team coordination
- Dave (CTO) — owns engineering, infrastructure, agents, technical builds

For each action item, return JSON:
{
  "owner": "Corey" | "Jo" | "Dave",
  "title": "Short imperative task title (under 80 chars)",
  "description": "One sentence of context from the transcript",
  "priority": "low" | "normal" | "high" | "urgent",
  "department": "Content + AEO" | "Sales" | "Client Success" | "Intelligence" | "Product" | "Operations" | null,
  "dueDate": "YYYY-MM-DD" | null
}

Rules:
- Only extract REAL action items — someone agreed to DO something specific.
- Skip vague discussion points, questions, or "we should think about" statements.
- If ownership is unclear, assign to whoever was speaking when the commitment was made.
- If no due date was mentioned, set null.
- Return a JSON array. If no action items found, return [].`,
    messages: [
      {
        role: "user",
        content: `Meeting: "${meetingTitle}"\n\nTranscript:\n${transcript.slice(0, 50000)}`,
      },
    ],
  });

  // Parse the response
  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  try {
    // Extract JSON array from response (may be wrapped in markdown code fences)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const tasks: ExtractedTask[] = JSON.parse(jsonMatch[0]);
    return Array.isArray(tasks) ? tasks : [];
  } catch {
    console.error("[Fireflies] Failed to parse Claude response:", text.slice(0, 200));
    return [];
  }
}

// ─── Map owner name to Dream Team node ──────────────────────────────

async function resolveOwnerNode(
  ownerName: string,
  department: string | null,
): Promise<{ nodeId: string | null; resolvedOwner: string }> {
  // Normalize owner name
  let resolved = ownerName;
  for (const [canonical, aliases] of Object.entries(OWNER_ALIASES)) {
    if (aliases.some((a) => ownerName.toLowerCase().includes(a))) {
      resolved = canonical;
      break;
    }
  }

  // Find the human node
  const humanNode = await db("dream_team_nodes")
    .where({ display_name: resolved, node_type: "human" })
    .first();

  if (humanNode) {
    return { nodeId: humanNode.id, resolvedOwner: resolved };
  }

  // If department specified, try to find the department director node
  if (department) {
    const deptNode = await db("dream_team_nodes")
      .where({ department, node_type: "agent" })
      .whereNull("parent_id")
      .orWhere(function () {
        this.where({ department }).whereNotNull("parent_id");
      })
      .orderBy("sort_order", "asc")
      .first();

    if (deptNode) {
      return { nodeId: deptNode.id, resolvedOwner: resolved };
    }
  }

  return { nodeId: null, resolvedOwner: resolved };
}

// ─── POST /api/admin/fireflies-webhook ──────────────────────────────

firefliesRoutes.post(
  "/fireflies-webhook",
  async (req, res) => {
    try {
      const {
        meetingId,
        title,
        transcript,
        // Fireflies also sends: participants, duration, date, etc.
        // We only need the transcript and metadata
      } = req.body;

      // Accept both raw transcript text and Fireflies' structured format
      let transcriptText = "";
      if (typeof transcript === "string") {
        transcriptText = transcript;
      } else if (transcript?.sentences) {
        // Fireflies structured format: array of { speaker, text, start_time }
        transcriptText = transcript.sentences
          .map((s: any) => `${s.speaker || "Speaker"}: ${s.text}`)
          .join("\n");
      } else if (req.body.transcription) {
        transcriptText = typeof req.body.transcription === "string"
          ? req.body.transcription
          : JSON.stringify(req.body.transcription);
      }

      if (!transcriptText) {
        return res.status(400).json({
          success: false,
          error: "No transcript content found in webhook payload.",
        });
      }

      const meetingTitle = title || req.body.meeting_title || "Untitled Meeting";
      const meetingIdStr = meetingId || req.body.meeting_id || null;

      console.log(
        `[Fireflies] Processing transcript for "${meetingTitle}" (${transcriptText.length} chars)`,
      );

      // Extract action items via Claude
      const extracted = await extractActionItems(transcriptText, meetingTitle);

      if (extracted.length === 0) {
        console.log("[Fireflies] No action items found in transcript.");
        return res.json({
          success: true,
          tasksCreated: 0,
          message: "No action items found in this transcript.",
          tasks: [],
        });
      }

      // Create tasks
      const createdTasks: any[] = [];

      for (const item of extracted) {
        const { nodeId, resolvedOwner } = await resolveOwnerNode(
          item.owner,
          item.department,
        );

        const [task] = await db("dream_team_tasks")
          .insert({
            node_id: nodeId,
            owner_name: resolvedOwner,
            title: item.title,
            description: item.description,
            status: "open",
            priority: item.priority || "normal",
            source_type: "fireflies",
            source_meeting_id: meetingIdStr,
            source_meeting_title: meetingTitle,
            due_date: item.dueDate || null,
          })
          .returning("*");

        createdTasks.push({
          id: task.id,
          owner: resolvedOwner,
          title: item.title,
          priority: item.priority,
          department: item.department,
          nodeId,
        });

        // Also log to dream_team_resume_entries for the assigned node
        if (nodeId) {
          await db("dream_team_resume_entries").insert({
            node_id: nodeId,
            entry_type: "task_assigned",
            summary: `Task assigned from "${meetingTitle}": ${item.title}`,
            created_by: "fireflies",
          });
        }
      }

      console.log(
        `[Fireflies] Created ${createdTasks.length} tasks from "${meetingTitle}"`,
      );

      return res.json({
        success: true,
        tasksCreated: createdTasks.length,
        meetingTitle,
        tasks: createdTasks,
      });
    } catch (error: any) {
      console.error("[Fireflies] Webhook error:", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to process transcript.",
      });
    }
  },
);

// ─── GET /api/admin/dream-team-tasks ────────────────────────────────

firefliesRoutes.get(
  "/dream-team-tasks",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { owner, status, node_id, limit = "50" } = req.query;

      let query = db("dream_team_tasks").orderBy("created_at", "desc").limit(Number(limit));

      if (owner) query = query.where({ owner_name: owner });
      if (status) query = query.where({ status });
      if (node_id) query = query.where({ node_id });

      const tasks = await query;

      return res.json({ success: true, tasks });
    } catch (error: any) {
      console.error("[DreamTeamTasks] List error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch tasks." });
    }
  },
);

// ─── PATCH /api/admin/dream-team-tasks/:id ──────────────────────────

firefliesRoutes.patch(
  "/dream-team-tasks/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, priority, title, due_date } = req.body;

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (status) updates.status = status;
      if (priority) updates.priority = priority;
      if (title) updates.title = title;
      if (due_date !== undefined) updates.due_date = due_date;

      await db("dream_team_tasks").where({ id }).update(updates);

      const task = await db("dream_team_tasks").where({ id }).first();
      return res.json({ success: true, task });
    } catch (error: any) {
      console.error("[DreamTeamTasks] Update error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to update task." });
    }
  },
);

export default firefliesRoutes;
