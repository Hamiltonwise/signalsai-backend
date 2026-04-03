/**
 * Agent Runner -- Admin-only endpoint to invoke Dream Team agents
 *
 * POST /api/admin/agent/run
 *   body: { agent: "client-monitor", prompt: "Check all AMBER accounts", mode: "analyze" }
 *
 * This lets Corey invoke any Dream Team agent from the HQ dashboard
 * with a natural language prompt. The agent can query the database,
 * create tasks, log findings, and draft emails.
 *
 * Safety: analyze mode is read-only. draft mode creates tasks for review.
 * execute mode is restricted to GREEN blast radius actions.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { runAgent, type AgentMode } from "../../services/agentExecutor";
import * as fs from "fs";
import * as path from "path";

const agentRunnerRoutes = express.Router();

// Load agent system prompts from .claude/agents/*.md files
function loadAgentPrompt(agentName: string): string | null {
  const agentDir = path.join(__dirname, "../../../.claude/agents");
  const filePath = path.join(agentDir, `${agentName}.md`);

  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
    // Try with -agent suffix
    const altPath = path.join(agentDir, `${agentName}-agent.md`);
    if (fs.existsSync(altPath)) {
      return fs.readFileSync(altPath, "utf-8");
    }
  } catch {}
  return null;
}

// List available agents
agentRunnerRoutes.get(
  "/agents",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const agentDir = path.join(__dirname, "../../../.claude/agents");
      const files = fs.readdirSync(agentDir).filter((f) => f.endsWith(".md"));
      const agents = files.map((f) => {
        const name = f.replace(".md", "").replace("-agent", "");
        const content = fs.readFileSync(path.join(agentDir, f), "utf-8");
        const descMatch = content.match(/description:\s*(.+)/i);
        return {
          id: f.replace(".md", ""),
          name,
          description: descMatch?.[1]?.trim() || name,
          file: f,
        };
      });
      return res.json({ success: true, agents });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  },
);

// Run an agent
agentRunnerRoutes.post(
  "/run",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { agent, prompt, mode = "analyze" } = req.body;

      if (!agent || !prompt) {
        return res.status(400).json({
          success: false,
          error: "Required: agent (name), prompt (what to do)",
        });
      }

      // Validate mode
      const validModes: AgentMode[] = ["analyze", "draft", "execute"];
      if (!validModes.includes(mode)) {
        return res.status(400).json({
          success: false,
          error: `Mode must be one of: ${validModes.join(", ")}`,
        });
      }

      // Load agent system prompt
      const systemPrompt = loadAgentPrompt(agent);
      if (!systemPrompt) {
        return res.status(404).json({
          success: false,
          error: `Agent "${agent}" not found. Use GET /api/admin/agent/agents to see available agents.`,
        });
      }

      console.log(`[AgentRunner] Running ${agent} in ${mode} mode: "${prompt.slice(0, 80)}..."`);

      const result = await runAgent(agent, systemPrompt, prompt, mode as AgentMode);

      console.log(
        `[AgentRunner] ${agent} complete: ${result.findings.length} findings, ${result.actions.length} actions`
      );

      return res.json({
        success: true,
        agent: result.agentName,
        mode: result.mode,
        findings: result.findings,
        actions: result.actions.map((a) => ({
          type: a.type,
          payload: a.payload,
        })),
      });
    } catch (err: any) {
      console.error("[AgentRunner] Error:", err.message);
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  },
);

export default agentRunnerRoutes;
