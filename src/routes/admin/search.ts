/**
 * HQ Search — WO-ADMIN-SEARCH
 *
 * GET /api/admin/search?q=[query]
 * Searches: organizations, dream_team_tasks, behavioral_events, agents
 * Min 2 chars. Max 20 results (5 per type).
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import * as fs from "fs";
import * as path from "path";

const searchRoutes = express.Router();

// ─── Static agent list (loaded once) ────────────────────────────────

interface AgentInfo {
  name: string;
  department: string;
  mandatePreview: string;
  filename: string;
}

let agentCache: AgentInfo[] | null = null;

function loadAgents(): AgentInfo[] {
  if (agentCache) return agentCache;

  const agentsDir = path.join(__dirname, "../../../.claude/agents");
  try {
    const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    agentCache = files.map((f) => {
      const content = fs.readFileSync(path.join(agentsDir, f), "utf-8");
      const name = f.replace(".md", "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      // Extract department from content
      let department = "General";
      const deptMatch = content.match(/department:\s*(.+)/i) || content.match(/## Department\s*\n(.+)/i);
      if (deptMatch) department = deptMatch[1].trim();

      // First meaningful line as mandate preview
      const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
      const mandatePreview = (lines[0] || "").slice(0, 120);

      return { name, department, mandatePreview, filename: f };
    });
  } catch {
    agentCache = [];
  }

  return agentCache;
}

// ─── GET /api/admin/search ──────────────────────────────────────────

searchRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();

      if (q.length < 2) {
        return res.json({ success: true, results: [], query: q, total_count: 0 });
      }

      const pattern = `%${q}%`;
      const results: any[] = [];

      // 1. Organizations
      const orgs = await db("organizations")
        .where("name", "ilike", pattern)
        .orWhere("operational_jurisdiction", "ilike", pattern)
        .select("id", "name", "operational_jurisdiction", "subscription_status", "created_at")
        .limit(5);

      for (const org of orgs) {
        results.push({
          type: "practice",
          id: org.id,
          name: org.name,
          city: org.operational_jurisdiction,
          health_status: org.subscription_status || "unknown",
        });
      }

      // 2. Dream Team Tasks
      try {
        const tasks = await db("dream_team_tasks")
          .where("title", "ilike", pattern)
          .select("id", "title", "owner_name", "due_date", "status")
          .orderBy("created_at", "desc")
          .limit(5);

        for (const task of tasks) {
          results.push({
            type: "task",
            id: task.id,
            title: task.title,
            owner: task.owner_name,
            due_date: task.due_date,
            status: task.status,
          });
        }
      } catch {
        // dream_team_tasks may not exist
      }

      // 3. Behavioral Events (last 30 days)
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
        const events = await db("behavioral_events")
          .leftJoin("organizations", "behavioral_events.org_id", "organizations.id")
          .where("behavioral_events.event_type", "ilike", pattern)
          .where("behavioral_events.created_at", ">=", thirtyDaysAgo)
          .select(
            "behavioral_events.id",
            "behavioral_events.event_type",
            "organizations.name as org_name",
            "behavioral_events.created_at as occurred_at",
          )
          .orderBy("behavioral_events.created_at", "desc")
          .limit(5);

        for (const event of events) {
          results.push({
            type: "event",
            id: event.id,
            event_type: event.event_type,
            org_name: event.org_name,
            occurred_at: event.occurred_at,
          });
        }
      } catch {
        // behavioral_events may not exist
      }

      // 4. Agents (static file list)
      const agents = loadAgents();
      const qLower = q.toLowerCase();
      const matchingAgents = agents
        .filter((a) => a.name.toLowerCase().includes(qLower) || a.department.toLowerCase().includes(qLower))
        .slice(0, 5);

      for (const agent of matchingAgents) {
        results.push({
          type: "agent",
          name: agent.name,
          department: agent.department,
          mandate_preview: agent.mandatePreview,
        });
      }

      return res.json({
        success: true,
        results: results.slice(0, 20),
        query: q,
        total_count: results.length,
      });
    } catch (error: any) {
      console.error("[Search] Error:", error.message);
      return res.status(500).json({ success: false, error: "Search failed" });
    }
  },
);

export default searchRoutes;
