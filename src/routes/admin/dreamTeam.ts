/**
 * Dream Team API Routes (WO16)
 *
 * GET  /api/admin/dream-team       — full tree with computed health
 * GET  /api/admin/dream-team/:id   — single node with KPIs, resume, outputs
 * PATCH /api/admin/dream-team/:id  — update kpi_targets or is_active
 * POST /api/admin/dream-team/:id/resume — add manual resume note
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const dreamTeamRoutes = express.Router();

// ─── GET / — Full tree ──────────────────────────────────────────────

dreamTeamRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const nodes = await db("dream_team_nodes")
        .select("*")
        .orderBy("created_at", "asc");

      // Load Canon governance status for all agents (join on agent_key)
      let canonMap: Record<string, { gate_verdict: string; gate_expires: string | null }> = {};
      try {
        const hasIdentities = await db.schema.hasTable("agent_identities");
        if (hasIdentities) {
          const identities = await db("agent_identities")
            .whereNotNull("agent_key")
            .select("agent_key", "gate_verdict", "gate_expires");
          for (const id of identities) {
            canonMap[id.agent_key] = { gate_verdict: id.gate_verdict, gate_expires: id.gate_expires };
          }
        }
      } catch {
        // Canon columns may not exist yet
      }

      // Compute health from agent_results for nodes with agent_key
      for (const node of nodes) {
        // Attach Canon governance status
        if (node.agent_key && canonMap[node.agent_key]) {
          node.gate_verdict = canonMap[node.agent_key].gate_verdict;
          node.gate_expires = canonMap[node.agent_key].gate_expires;
        } else {
          node.gate_verdict = null;
          node.gate_expires = null;
        }

        if (node.agent_key) {
          node.health_status = await computeAgentHealth(node.agent_key);
        } else if (node.node_type === "human") {
          // Human health = worst child health
          const children = nodes.filter((n: any) => n.parent_id === node.id);
          const childStatuses = children.map((c: any) => c.health_status);
          const redCount = childStatuses.filter((s: string) => s === "red").length;
          const yellowCount = childStatuses.filter((s: string) => s === "yellow").length;
          if (redCount >= 2) node.health_status = "red";
          else if (redCount >= 1 || yellowCount >= 1) node.health_status = "yellow";
          else if (childStatuses.some((s: string) => s === "green")) node.health_status = "green";
          // else stays gray
        }
      }

      return res.json({ success: true, nodes });
    } catch (err) {
      console.error("Dream Team list error:", err);
      return res.status(500).json({ success: false, error: "Failed to load team" });
    }
  },
);

// ─── GET /:id — Single node detail ─────────────────────────────────
// NOTE: Must skip sub-route names that Express would otherwise match as :id

dreamTeamRoutes.get(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req, res, next) => {
    // Skip if :id matches a named sub-route (Express matches /:id before /tasks)
    const reserved = ["tasks", "health", "status"];
    if (reserved.includes(req.params.id)) return next();

    try {
      const { id } = req.params;

      const node = await db("dream_team_nodes").where({ id }).first();
      if (!node) {
        return res.status(404).json({ success: false, error: "Node not found" });
      }

      // Compute health
      if (node.agent_key) {
        node.health_status = await computeAgentHealth(node.agent_key);
      }

      // Canon data: join on agent_key to agent_identities
      let canon: any = null;
      if (node.agent_key) {
        // Try exact match first, then with _agent suffix (handles proofline -> proofline_agent)
        let identity = await db("agent_identities")
          .where({ slug: node.agent_key })
          .first("canon_spec", "gold_questions", "gate_verdict", "gate_expires", "gate_date", "display_name");
        if (!identity) {
          identity = await db("agent_identities")
            .where({ slug: node.agent_key + "_agent" })
            .first("canon_spec", "gold_questions", "gate_verdict", "gate_expires", "gate_date", "display_name");
        }
        if (identity) {
          const spec = typeof identity.canon_spec === "string"
            ? JSON.parse(identity.canon_spec) : identity.canon_spec || {};
          const gq = typeof identity.gold_questions === "string"
            ? JSON.parse(identity.gold_questions) : identity.gold_questions || [];
          const passing = Array.isArray(gq) ? gq.filter((q: any) => q.lastResult === "pass").length : 0;
          const total = Array.isArray(gq) ? gq.length : 0;

          // Get last simulation timestamp from behavioral_events
          let lastSimulation: string | null = null;
          try {
            const simEvent = await db("behavioral_events")
              .where({ event_type: "canon.simulation_run" })
              .whereRaw("properties->>'agent' = ?", [node.agent_key])
              .orderBy("created_at", "desc")
              .first("created_at");
            if (simEvent) lastSimulation = simEvent.created_at;
          } catch { /* table may not exist */ }

          // Get last run time from schedules
          let lastRun: string | null = null;
          try {
            const schedule = await db("schedules")
              .where({ agent_key: node.agent_key })
              .first("last_run_at", "cron_expression");
            if (schedule) {
              lastRun = schedule.last_run_at;
              if (!canon) canon = {};
              canon.cronExpression = schedule.cron_expression;
            }
          } catch { /* table may not exist */ }

          canon = {
            ...canon,
            purpose: spec.purpose || null,
            expectedBehavior: spec.expectedBehavior || null,
            constraints: spec.constraints || [],
            process: spec.process || null,
            gateVerdict: identity.gate_verdict,
            gateExpires: identity.gate_expires,
            gateDate: identity.gate_date,
            goldQuestions: { passing, total },
            lastSimulation,
            lastRun,
          };
        }
      }

      // Resume entries
      const resumeEntries = await db("dream_team_resume_entries")
        .where({ node_id: id })
        .orderBy("created_at", "desc")
        .limit(50);

      // Recent outputs (if agent)
      let recentOutputs: any[] = [];
      if (node.agent_key) {
        recentOutputs = await db("agent_results")
          .where({ agent_type: node.agent_key })
          .whereNot("status", "archived")
          .orderBy("created_at", "desc")
          .limit(5)
          .select("id", "status", "created_at", "agent_output");
      }

      // Compute KPI current values
      const kpis = computeKpiValues(
        typeof node.kpi_targets === "string"
          ? JSON.parse(node.kpi_targets)
          : node.kpi_targets || [],
        recentOutputs,
      );

      return res.json({
        success: true,
        node,
        canon,
        resumeEntries,
        recentOutputs: recentOutputs.map((o) => ({
          id: o.id,
          status: o.status,
          created_at: o.created_at,
          summary: extractOutputSummary(o.agent_output),
        })),
        kpis,
      });
    } catch (err) {
      console.error("Dream Team detail error:", err);
      return res.status(500).json({ success: false, error: "Failed to load node" });
    }
  },
);

// ─── PATCH /:id — Update node ───────────────────────────────────────

dreamTeamRoutes.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { kpi_targets, is_active } = req.body;

      const updates: Record<string, any> = { updated_at: new Date() };
      if (kpi_targets !== undefined) updates.kpi_targets = JSON.stringify(kpi_targets);
      if (is_active !== undefined) updates.is_active = is_active;

      await db("dream_team_nodes").where({ id }).update(updates);

      // Log resume entry
      const changes: string[] = [];
      if (kpi_targets !== undefined) changes.push("KPI targets updated");
      if (is_active !== undefined) changes.push(is_active ? "Agent resumed" : "Agent paused");

      if (changes.length > 0) {
        await db("dream_team_resume_entries").insert({
          node_id: id,
          entry_type: kpi_targets !== undefined ? "kpi_update" : "configuration",
          summary: changes.join(". "),
          created_by: "admin",
        });
      }

      const node = await db("dream_team_nodes").where({ id }).first();
      return res.json({ success: true, node });
    } catch (err) {
      console.error("Dream Team update error:", err);
      return res.status(500).json({ success: false, error: "Failed to update node" });
    }
  },
);

// ─── POST /:id/resume — Add manual note ─────────────────────────────

dreamTeamRoutes.post(
  "/:id/resume",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { summary, created_by } = req.body;

      if (!summary?.trim()) {
        return res.status(400).json({ success: false, error: "Summary is required" });
      }

      const [entry] = await db("dream_team_resume_entries")
        .insert({
          node_id: id,
          entry_type: "manual_note",
          summary: summary.trim(),
          created_by: created_by || "admin",
        })
        .returning("*");

      return res.json({ success: true, entry });
    } catch (err) {
      console.error("Dream Team resume error:", err);
      return res.status(500).json({ success: false, error: "Failed to add note" });
    }
  },
);

// ─── GET /tasks — list all tasks (filterable) ───────────────────────

dreamTeamRoutes.get(
  "/tasks",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { owner, status, node_id, limit = "100" } = req.query;

      let query = db("dream_team_tasks")
        .orderBy([
          { column: "status", order: "asc" }, // open first
          { column: "priority", order: "desc" },
          { column: "created_at", order: "desc" },
        ])
        .limit(Number(limit));

      if (owner) query = query.where({ owner_name: owner });
      if (status) query = query.where({ status });
      if (node_id) query = query.where({ node_id });

      const tasks = await query;

      // Stats for Jo's dashboard
      const stats = await db("dream_team_tasks")
        .select("status")
        .count("id as count")
        .groupBy("status");

      const statMap: Record<string, number> = {};
      for (const s of stats) statMap[s.status] = Number(s.count);

      const overdue = await db("dream_team_tasks")
        .where("status", "!=", "done")
        .whereNotNull("due_date")
        .where("due_date", "<", new Date().toISOString().slice(0, 10))
        .count("id as count")
        .first();

      return res.json({
        success: true,
        tasks,
        stats: {
          open: statMap.open || 0,
          in_progress: statMap.in_progress || 0,
          done: statMap.done || 0,
          overdue: Number((overdue as any)?.count || 0),
          total: Object.values(statMap).reduce((a, b) => a + b, 0),
        },
      });
    } catch (err) {
      console.error("Dream Team tasks list error:", err);
      return res.status(500).json({ success: false, error: "Failed to list tasks" });
    }
  },
);

// ─── POST /tasks — create task ──────────────────────────────────────

dreamTeamRoutes.post(
  "/tasks",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { node_id, title, owner_name, description, priority, due_date } = req.body;

      if (!title?.trim()) {
        return res.status(400).json({ success: false, error: "Title is required" });
      }

      const [task] = await db("dream_team_tasks")
        .insert({
          node_id: node_id || null,
          title: title.trim(),
          owner_name: owner_name || "Unassigned",
          description: description?.trim() || null,
          priority: priority || "normal",
          due_date: due_date || null,
          status: "open",
          source_type: "manual",
        })
        .returning("*");

      // Log to resume if node assigned
      if (node_id) {
        await db("dream_team_resume_entries").insert({
          node_id,
          entry_type: "task_assigned",
          summary: `Task created: ${title.trim()}`,
          created_by: owner_name || "admin",
        });
      }

      return res.json({ success: true, task });
    } catch (err) {
      console.error("Dream Team task create error:", err);
      return res.status(500).json({ success: false, error: "Failed to create task" });
    }
  },
);

// ─── PATCH /tasks/:id — update task ─────────────────────────────────

dreamTeamRoutes.patch(
  "/tasks/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, priority, title, owner_name, due_date, node_id } = req.body;

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (title !== undefined) updates.title = title;
      if (owner_name !== undefined) updates.owner_name = owner_name;
      if (due_date !== undefined) updates.due_date = due_date;
      if (node_id !== undefined) updates.node_id = node_id;

      await db("dream_team_tasks").where({ id }).update(updates);

      const task = await db("dream_team_tasks").where({ id }).first();
      return res.json({ success: true, task });
    } catch (err) {
      console.error("Dream Team task update error:", err);
      return res.status(500).json({ success: false, error: "Failed to update task" });
    }
  },
);

// ─── Helpers ─────────────────────────────────────────────────────────

async function computeAgentHealth(agentId: string): Promise<string> {
  try {
    // Primary: check agent_results (where some agents write output)
    const latest = await db("agent_results")
      .where({ agent_type: agentId })
      .whereNot("status", "archived")
      .orderBy("created_at", "desc")
      .first();

    if (latest) {
      const hoursAgo =
        (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60);

      if (latest.status === "error") return "red";
      if (hoursAgo > 48) return "red";
      if (hoursAgo > 24) return "yellow";
      if (latest.status === "success") return "green";
      return "yellow";
    }

    // Fallback: check behavioral_events (where most agents actually write)
    // Many agents write to behavioral_events but not agent_results,
    // causing them to appear "gray" on the dashboard despite running.
    const hasEvents = await db.schema.hasTable("behavioral_events");
    if (hasEvents) {
      // Look for schedule_runs first (most reliable signal of agent execution)
      const hasScheduleRuns = await db.schema.hasTable("schedule_runs");
      if (hasScheduleRuns) {
        const latestRun = await db("schedule_runs")
          .whereIn("schedule_id", function() {
            this.select("id").from("schedules").where({ agent_key: agentId });
          })
          .orderBy("started_at", "desc")
          .first();

        if (latestRun) {
          const hoursAgo =
            (Date.now() - new Date(latestRun.started_at).getTime()) / (1000 * 60 * 60);

          if (latestRun.status === "failed") return "red";
          if (hoursAgo > 48) return "red";
          if (hoursAgo > 24) return "yellow";
          return "green";
        }
      }
    }

    return "gray";
  } catch {
    return "gray";
  }
}

function computeKpiValues(
  targets: Array<{ name: string; target: string; unit?: string }>,
  outputs: any[],
): Array<{ name: string; target: string; current: string; status: string }> {
  // Without specific KPI calculation logic tied to each agent,
  // return targets with placeholder current values
  return targets.map((t) => ({
    name: t.name,
    target: t.target,
    current: outputs.length > 0 ? "—" : "N/A",
    status: outputs.length > 0 ? "green" : "gray",
  }));
}

function extractOutputSummary(output: any): string {
  if (!output) return "Completed. No summary available.";
  const obj = typeof output === "string" ? tryParse(output) : output;
  if (typeof obj === "object" && obj !== null) {
    const text = (obj as any).summary || (obj as any).message || (obj as any).result;
    if (typeof text === "string") {
      return text.length > 100 ? text.slice(0, 97) + "..." : text;
    }
  }
  return "Completed successfully.";
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

export default dreamTeamRoutes;
