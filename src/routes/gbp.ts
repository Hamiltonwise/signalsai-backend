import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";
import {
  tokenRefreshMiddleware,
  AuthenticatedRequest,
} from "../middleware/tokenRefresh";
import * as controller from "../controllers/gbp/GbpController";

const gbpRoutes = express.Router();

// All GBP routes require JWT auth + RBAC + Google OAuth token refresh
gbpRoutes.use(authenticateToken, rbacMiddleware, tokenRefreshMiddleware);

// Main data endpoints
gbpRoutes.post("/getKeyData", (req: AuthenticatedRequest, res) => controller.getKeyData(req, res));
gbpRoutes.post("/getAIReadyData", (req: AuthenticatedRequest, res) => controller.getAIReadyData(req, res));
gbpRoutes.post("/getTextSources", (req: AuthenticatedRequest, res) => controller.getTextSources(req, res));

// Diagnostic endpoints
gbpRoutes.get("/diag/accounts", (req: AuthenticatedRequest, res) => controller.diagAccounts(req, res));
gbpRoutes.get("/diag/locations", (req: AuthenticatedRequest, res) => controller.diagLocations(req, res));

// Re-export programmatic functions for backward compatibility
// Used by: src/services/dataAggregator.ts, src/routes/agentsV2.ts
export { getGBPAIReadyData, getGBPTextSources } from "../controllers/gbp/GbpController";

// Re-export service function for backward compatibility
// Used by: src/services/rankingService.ts
export { listLocalPostsInRange } from "../controllers/gbp/gbp-services/post-handler.service";

export default gbpRoutes;
