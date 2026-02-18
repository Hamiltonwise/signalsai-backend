import express from "express";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import {
  getKeyData,
  getAIReadyData,
  getDiagSites,
  getSites,
} from "../controllers/gsc/GscController";

// Re-export for backward compatibility (used by dataAggregator and other modules)
export { getGSCAIReadyData } from "../controllers/gsc/feature-services/service.ai-ready-data";

const gscRoutes = express.Router();

// Apply token refresh middleware to all GSC routes
gscRoutes.use(tokenRefreshMiddleware);

gscRoutes.post("/getKeyData", getKeyData);
gscRoutes.post("/getAIReadyData", getAIReadyData);
gscRoutes.get("/diag/sites", getDiagSites);
gscRoutes.get("/sites/get", getSites);

export default gscRoutes;
