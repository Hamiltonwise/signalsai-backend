import express from "express";
import * as skillApiController from "../controllers/minds/MindsSkillApiController";
import * as portalController from "../controllers/minds/MindsPortalController";

const mindsPublicApiRoutes = express.Router();

// Mind Portal — queryable brain endpoint (portal-key auth)
mindsPublicApiRoutes.post("/:mindSlug/portal", portalController.mindPortal);

// Skill Portal — queryable skill endpoint (portal-key auth)
// Mounted separately under /api/skills in index.ts

// Public endpoint — no auth required
// GET /api/minds/:agentSlug/:skillSlug — returns neuron plain text + logs call
mindsPublicApiRoutes.get("/:agentSlug/:skillSlug", skillApiController.getSkillNeuron);
// POST /api/minds/:agentSlug/:skillSlug — same, accepts optional input payload
mindsPublicApiRoutes.post("/:agentSlug/:skillSlug", skillApiController.getSkillNeuron);

export default mindsPublicApiRoutes;
