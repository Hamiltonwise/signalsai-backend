/**
 * Agent Identity API
 *
 * GET  /api/admin/agent-identity           -- List all agents with status
 * GET  /api/admin/agent-identity/:id/audit -- Audit log for one agent
 * GET  /api/admin/agent-identity/violations -- Recent scope violations
 * POST /api/admin/agent-identity/:id/quarantine   -- Quarantine an agent
 * POST /api/admin/agent-identity/:id/unquarantine -- Un-quarantine an agent
 */

import { Router, type Request, type Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import {
  listAgents,
  getAgentAuditLog,
  getRecentViolations,
  quarantineAgent,
  unquarantineAgent,
  AGENT_DEFINITIONS,
  getAgentIdentity,
} from "../../services/agents/agentIdentity";

const router = Router();

// List all agents with identity and status
router.get("/", authenticateToken, superAdminMiddleware, async (_req: Request, res: Response) => {
  try {
    // Ensure all defined agents have identity records
    for (const def of AGENT_DEFINITIONS) {
      await getAgentIdentity(def.slug);
    }

    const agents = await listAgents();
    const groups: Record<string, any[]> = {};
    for (const a of agents) {
      const g = (a as any).agent_group || (a as any).group || "unknown";
      if (!groups[g]) groups[g] = [];
      groups[g].push(a);
    }

    res.json({
      success: true,
      totalAgents: agents.length,
      quarantined: agents.filter((a: any) => (a.trust_level || a.trustLevel) === "quarantined").length,
      groups,
      agents,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// Audit log for one agent
router.get("/:id/audit", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const log = await getAgentAuditLog(req.params.id, 100);
    res.json({ success: true, log });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// Recent violations across all agents
router.get("/violations", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const violations = await getRecentViolations(hours);
    res.json({ success: true, violations, count: violations.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// Quarantine an agent (manual, by Corey)
router.post("/:id/quarantine", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const reason = req.body?.reason || "Manually quarantined by admin";
    await quarantineAgent(req.params.id, reason);
    res.json({ success: true, message: "Agent quarantined" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// Un-quarantine an agent (manual, by Corey)
router.post("/:id/unquarantine", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    await unquarantineAgent(req.params.id);
    res.json({ success: true, message: "Agent un-quarantined (trust level set to yellow)" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
