import express from "express";
import * as portalController from "../controllers/minds/MindsPortalController";

const skillsPublicApiRoutes = express.Router();

// Skill Portal — queryable skill instruction endpoint (portal-key auth)
skillsPublicApiRoutes.post("/:skillSlug/portal", portalController.skillPortal);

export default skillsPublicApiRoutes;
