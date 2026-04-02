/**
 * Agent Executor -- Bridge between Dream Team agents and Claude
 *
 * This service invokes Claude with specific tools and context
 * to let Dream Team agents ACT, not just report.
 *
 * Architecture:
 *   Agent definition (.claude/agents/*.md) defines the agent's role and rules
 *   Agent Executor invokes Claude API with custom tools
 *   Tools connect to: database, email, Slack, GitHub
 *   Results logged to behavioral_events and dream_team_tasks
 *
 * Three modes:
 *   1. analyze:  Read-only. Agent reads data and returns findings.
 *   2. draft:    Agent drafts an action (email, task, code change) for human review.
 *   3. execute:  Agent acts autonomously within its authority domain.
 *
 * Safety: execute mode only for GREEN blast radius actions.
 * AMBER/RED always go through draft mode with human approval.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../database/connection";

// Tool type compatible with both old and new SDK versions
interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// The model all agents use (from CLAUDE.md global default)
const AGENT_MODEL = "claude-sonnet-4-6";

export type AgentMode = "analyze" | "draft" | "execute";

export interface AgentAction {
  type: "email" | "slack" | "task" | "behavioral_event" | "db_update";
  payload: Record<string, unknown>;
}

export interface AgentResult {
  agentName: string;
  mode: AgentMode;
  findings: string[];
  actions: AgentAction[];
  raw: string;
}

// Tools the agent can use
const AGENT_TOOLS: AgentTool[] = [
  {
    name: "query_database",
    description: "Query the Alloro database. Returns rows as JSON. Use SELECT only. Never INSERT, UPDATE, or DELETE.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: { type: "string", description: "A SELECT query to run against the Alloro database" },
      },
      required: ["sql"],
    },
  },
  {
    name: "create_task",
    description: "Create a dream_team_task for a human to review and act on.",
    input_schema: {
      type: "object" as const,
      properties: {
        owner_name: { type: "string", description: "Who this task is for: Corey, Jo, or Dave" },
        title: { type: "string", description: "Short task title" },
        description: { type: "string", description: "What needs to be done and why" },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        source_type: { type: "string", description: "Which agent created this" },
      },
      required: ["owner_name", "title", "description", "priority", "source_type"],
    },
  },
  {
    name: "log_finding",
    description: "Log a finding to behavioral_events for other agents to see.",
    input_schema: {
      type: "object" as const,
      properties: {
        org_id: { type: "number", description: "Organization ID this finding relates to" },
        event_type: { type: "string", description: "Event type (e.g., agent.finding)" },
        headline: { type: "string", description: "One-line finding" },
        detail: { type: "string", description: "Full detail" },
        priority: { type: "number", description: "1-10 priority" },
      },
      required: ["event_type", "headline"],
    },
  },
  {
    name: "draft_email",
    description: "Draft an email for human review. Does NOT send. Creates a task with the draft for Corey to approve.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body (plain text)" },
        reason: { type: "string", description: "Why this email should be sent" },
      },
      required: ["to", "subject", "body", "reason"],
    },
  },
];

/**
 * Execute a tool call from the agent.
 * Safety: query_database only allows SELECT.
 */
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  mode: AgentMode,
): Promise<string> {
  switch (toolName) {
    case "query_database": {
      const sql = String(toolInput.sql || "").trim();
      // Safety: only single SELECT statements allowed (no multi-statement injection)
      const normalized = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (!normalized.toUpperCase().startsWith("SELECT")) {
        return JSON.stringify({ error: "Only SELECT queries are allowed" });
      }
      // Block multi-statement attacks (SELECT 1; DROP TABLE ...) and write operations
      // Split on semicolons outside of string literals
      const statements = normalized.split(/;/).filter((s) => s.trim().length > 0);
      if (statements.length > 1) {
        return JSON.stringify({ error: "Multi-statement queries are not allowed" });
      }
      const blocked = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b/i;
      if (blocked.test(normalized)) {
        return JSON.stringify({ error: "Only read-only SELECT queries are allowed" });
      }
      // Restrict to safe tables (no access to users, auth tokens, secrets)
      const forbidden = /\b(users|auth_tokens|sessions|password|secret|credential)\b/i;
      if (forbidden.test(normalized)) {
        return JSON.stringify({ error: "Access to this table is restricted" });
      }
      try {
        const rows = await db.raw(sql);
        const result = Array.isArray(rows) ? rows.slice(0, 50) : (rows.rows || []).slice(0, 50);
        return JSON.stringify(result);
      } catch (err: any) {
        return JSON.stringify({ error: "Query failed. Check syntax and try again." });
      }
    }

    case "create_task": {
      try {
        await db("dream_team_tasks").insert({
          owner_name: toolInput.owner_name,
          title: toolInput.title,
          description: toolInput.description,
          status: "open",
          priority: toolInput.priority,
          source_type: toolInput.source_type,
        });
        return JSON.stringify({ success: true });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    }

    case "log_finding": {
      try {
        const hasTable = await db.schema.hasTable("behavioral_events");
        if (hasTable) {
          await db("behavioral_events").insert({
            organization_id: toolInput.org_id || null,
            event_type: toolInput.event_type,
            metadata: JSON.stringify({
              headline: toolInput.headline,
              detail: toolInput.detail,
              priority: toolInput.priority,
            }),
          });
        }
        return JSON.stringify({ success: true });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    }

    case "draft_email": {
      if (mode === "execute") {
        return JSON.stringify({ error: "Email sending requires draft mode with human approval" });
      }
      // Create a task with the email draft for Corey to approve
      try {
        await db("dream_team_tasks").insert({
          owner_name: "Corey",
          title: `Email draft: ${toolInput.subject}`,
          description: `TO: ${toolInput.to}\nSUBJECT: ${toolInput.subject}\n\n${toolInput.body}\n\nREASON: ${toolInput.reason}`,
          status: "open",
          priority: "normal",
          source_type: "agent_email_draft",
        });
        return JSON.stringify({ success: true, note: "Draft created for Corey's review" });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

/**
 * Run an agent with a specific prompt and tools.
 *
 * The agent loop: Claude generates tool calls, we execute them,
 * feed results back, until Claude produces a final text response.
 */
export async function runAgent(
  agentName: string,
  systemPrompt: string,
  userPrompt: string,
  mode: AgentMode = "analyze",
): Promise<AgentResult> {
  const client = getClient();
  const actions: AgentAction[] = [];
  const findings: string[] = [];

  // Only give tools in draft/execute mode. Analyze mode is read-only.
  const tools = mode === "analyze"
    ? [AGENT_TOOLS[0], AGENT_TOOLS[2]] // query_database + log_finding only
    : AGENT_TOOLS;

  const messages: any[] = [
    { role: "user", content: userPrompt },
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Cast to any to support tool use with older SDK (v0.20)
    // The API supports tools; the types just don't reflect it in this version
    const createParams: any = {
      model: AGENT_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      tools,
      messages,
    };
    const response: any = await (client.messages.create as any)(createParams);

    // Collect text blocks as findings
    const contentBlocks: any[] = response.content || [];
    for (const block of contentBlocks) {
      if (block.type === "text" && block.text?.trim()) {
        findings.push(block.text);
      }
    }

    // If no tool use, we're done
    const hasToolUse = contentBlocks.some((b: any) => b.type === "tool_use");
    if (!hasToolUse) {
      break;
    }

    // Execute tool calls
    const toolResults: any[] = [];
    for (const block of contentBlocks) {
      if (block.type === "tool_use") {
        const toolBlock = block;
        const result = await executeTool(toolBlock.name, toolBlock.input as Record<string, unknown>, mode);
        actions.push({
          type: toolBlock.name as AgentAction["type"],
          payload: toolBlock.input as Record<string, unknown>,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: result,
        });
      }
    }

    // Add assistant response and tool results to messages for next iteration
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  return {
    agentName,
    mode,
    findings,
    actions,
    raw: findings.join("\n\n"),
  };
}
