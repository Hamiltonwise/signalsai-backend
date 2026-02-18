/**
 * GA4 Routes
 *
 * Route definitions only. All logic delegated to Ga4Controller.
 * Middleware: tokenRefreshMiddleware applied to all routes.
 */

import express from "express";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import Ga4Controller from "../controllers/ga4/Ga4Controller";

export { getGA4AIReadyData } from "../controllers/ga4/Ga4Controller";

const ga4Routes = express.Router();

// Apply token refresh middleware to all GA4 routes
ga4Routes.use(tokenRefreshMiddleware);

ga4Routes.post("/getKeyData", Ga4Controller.getKeyData);
ga4Routes.get("/diag/properties", Ga4Controller.getDiagnosticProperties);
ga4Routes.get("/properties/get", Ga4Controller.getPropertiesWithDomains);
ga4Routes.post("/getAIReadyData", Ga4Controller.getAIReadyData);

export default ga4Routes;
