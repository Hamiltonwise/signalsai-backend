import express from "express";
import {
  getDiagProjects,
  fetch,
  getKeyData,
  getAIReadyData,
} from "../controllers/clarity/ClarityController";

const clarityRoutes = express.Router();

clarityRoutes.get("/diag/projects", getDiagProjects);
clarityRoutes.post("/fetch", fetch);
clarityRoutes.post("/getKeyData", getKeyData);
clarityRoutes.post("/getAIReadyData", getAIReadyData);

export default clarityRoutes;
