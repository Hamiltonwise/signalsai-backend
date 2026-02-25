import express from "express";
import * as skillApiController from "../controllers/minds/MindsSkillApiController";

const mindsPublicApiRoutes = express.Router();

// Public endpoint — no auth required
// GET /api/minds/:agentSlug/:skillSlug — returns neuron plain text + logs call
mindsPublicApiRoutes.get("/:agentSlug/:skillSlug", skillApiController.getSkillNeuron);
// POST /api/minds/:agentSlug/:skillSlug — same, accepts optional input payload
mindsPublicApiRoutes.post("/:agentSlug/:skillSlug", skillApiController.getSkillNeuron);

export default mindsPublicApiRoutes;
