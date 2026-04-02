/**
 * Agent Canon Governance API
 *
 * GET    /api/admin/agent-canon           -- List all agents with Canon status
 * GET    /api/admin/agent-canon/:slug     -- Single agent full Canon detail
 * PATCH  /api/admin/agent-canon/:slug/spec         -- Update spec (resets gate)
 * PUT    /api/admin/agent-canon/:slug/gold-questions    -- Set gold questions (resets gate)
 * PATCH  /api/admin/agent-canon/:slug/gold-questions/:qid -- Record single question result
 * POST   /api/admin/agent-canon/:slug/verdict       -- Set verdict (validates all passed)
 */

import { Router, type Request, type Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import {
  AGENT_DEFINITIONS,
  getAgentIdentity,
  updateCanonSpec,
  setGoldQuestions,
  recordGoldQuestionResult,
  setGateVerdict,
  type CanonSpec,
  type GoldQuestion,
} from "../../services/agents/agentIdentity";

const router = Router();

// GET / -- List all agents with Canon status
router.get("/", authenticateToken, superAdminMiddleware, async (_req: Request, res: Response) => {
  try {
    // Ensure all defined agents have identity records
    for (const def of AGENT_DEFINITIONS) {
      await getAgentIdentity(def.slug);
    }

    const agents = await db("agent_identities")
      .select(
        "id", "slug", "display_name", "agent_group", "trust_level",
        "description", "agent_key",
        "canon_spec", "gold_questions", "gate_verdict", "gate_date", "gate_expires",
      )
      .orderBy("agent_group")
      .orderBy("slug");

    // Parse JSONB fields
    const parsed = agents.map((a: any) => ({
      ...a,
      canon_spec: typeof a.canon_spec === "string" ? JSON.parse(a.canon_spec) : a.canon_spec,
      gold_questions: typeof a.gold_questions === "string" ? JSON.parse(a.gold_questions) : a.gold_questions,
    }));

    res.json({ success: true, agents: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// GET /:slug -- Single agent full Canon detail
router.get("/:slug", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await db("agent_identities").where({ slug: req.params.slug }).first();
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const parsed = {
      ...agent,
      canon_spec: typeof agent.canon_spec === "string" ? JSON.parse(agent.canon_spec) : agent.canon_spec,
      gold_questions: typeof agent.gold_questions === "string" ? JSON.parse(agent.gold_questions) : agent.gold_questions,
    };

    res.json({ success: true, agent: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// PATCH /:slug/spec -- Update Canon spec (resets gate to PENDING)
router.patch("/:slug/spec", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await db("agent_identities").where({ slug: req.params.slug }).first();
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const spec: CanonSpec = req.body;
    await updateCanonSpec(agent.id, spec);

    res.json({ success: true, message: "Spec updated, gate reset to PENDING" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /:slug/gold-questions -- Set gold questions (resets gate)
router.put("/:slug/gold-questions", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await db("agent_identities").where({ slug: req.params.slug }).first();
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const questions: GoldQuestion[] = req.body.questions || req.body;
    await setGoldQuestions(agent.id, questions);

    res.json({ success: true, message: "Gold questions updated, gate reset to PENDING" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// PATCH /:slug/gold-questions/:qid -- Record single question result
router.patch("/:slug/gold-questions/:qid", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await db("agent_identities").where({ slug: req.params.slug }).first();
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const { actualAnswer, passed } = req.body;
    if (typeof actualAnswer !== "string" || typeof passed !== "boolean") {
      return res.status(400).json({ success: false, error: "actualAnswer (string) and passed (boolean) required" });
    }

    await recordGoldQuestionResult(agent.id, req.params.qid, actualAnswer, passed);

    res.json({ success: true, message: "Question result recorded" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// POST /:slug/verdict -- Set verdict (validates all questions passed before PASS)
router.post("/:slug/verdict", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await db("agent_identities").where({ slug: req.params.slug }).first();
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const { verdict } = req.body;
    if (verdict !== "PASS" && verdict !== "FAIL") {
      return res.status(400).json({ success: false, error: "verdict must be PASS or FAIL" });
    }

    await setGateVerdict(agent.id, verdict);

    res.json({ success: true, message: `Verdict set to ${verdict}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
