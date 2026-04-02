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
import { getAgentHandler } from "../../services/agentRegistry";

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

// POST /:slug/simulate -- Run agent handler directly, capture output, auto-populate gold question answers
router.post("/:slug/simulate", authenticateToken, superAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await db("agent_identities").where({ slug: req.params.slug }).first();
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    // Find the handler via agent_key or slug-based key
    const agentKey = agent.agent_key || req.params.slug.replace(/_agent$/, "");
    const handler = getAgentHandler(agentKey);
    if (!handler) {
      return res.status(404).json({
        success: false,
        error: `No handler registered for key "${agentKey}". Available keys are in the agent registry.`,
      });
    }

    const questions: GoldQuestion[] = typeof agent.gold_questions === "string"
      ? JSON.parse(agent.gold_questions)
      : agent.gold_questions || [];

    // Run the handler and capture output + timing
    const startMs = Date.now();
    let output: Record<string, unknown> = {};
    let runError: string | null = null;
    let success = false;

    try {
      const result = await handler.handler();
      output = result.summary;
      success = true;
    } catch (err: unknown) {
      runError = err instanceof Error ? err.message : String(err);
      output = { error: runError };
    }

    const durationMs = Date.now() - startMs;

    // Serialize output for gold question comparison
    const outputStr = JSON.stringify(output, null, 2);

    // Auto-populate gold question results based on run output
    const goldQuestionResults = questions.map((q) => {
      // Build an actual answer from the simulation output
      let actualAnswer: string;
      let passed: boolean;

      if (!success) {
        actualAnswer = `Agent threw error: ${runError}`;
        passed = false;
      } else {
        // The actual answer is the raw output for manual review.
        // Auto-pass if the output is non-empty and non-error.
        // The real evaluation is Corey reading these and toggling pass/fail.
        actualAnswer = `Simulation output (${durationMs}ms): ${outputStr.slice(0, 500)}${outputStr.length > 500 ? "..." : ""}`;
        // Default to null (needs human review) but we set false for now
        // so Corey has to explicitly mark each one
        passed = false;
      }

      return {
        id: q.id,
        question: q.question,
        expectedAnswer: q.expectedAnswer,
        actualAnswer,
        passed,
      };
    });

    // Write simulation results back to gold questions
    for (const gqr of goldQuestionResults) {
      try {
        await recordGoldQuestionResult(agent.id, gqr.id, gqr.actualAnswer, gqr.passed);
      } catch {
        // Skip questions that don't exist anymore
      }
    }

    // Log simulation event
    try {
      await db("behavioral_events").insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "canon.simulation_run",
        org_id: null,
        properties: JSON.stringify({
          agentSlug: req.params.slug,
          agentKey,
          success,
          durationMs,
          questionsEvaluated: goldQuestionResults.length,
          error: runError,
        }),
        created_at: new Date(),
      });
    } catch {
      // Non-critical
    }

    res.json({
      success: true,
      result: {
        agentKey,
        success,
        output,
        error: runError,
        durationMs,
        goldQuestionResults,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
