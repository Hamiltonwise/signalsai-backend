import express from "express";
import {
  validateInternalKey,
  updateWorkRunStatus,
} from "../controllers/minds/MindsInternalController";

const internalApiRoutes = express.Router();

// All internal routes require internal key auth
internalApiRoutes.use(validateInternalKey);

// n8n updates work run status
internalApiRoutes.patch(
  "/skill-work-runs/:workRunId",
  updateWorkRunStatus
);

export default internalApiRoutes;
