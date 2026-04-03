import express from "express";
import { runRagPipeline } from "../controllers/rag/rag.controller";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

const ragRoutes = express.Router();

ragRoutes.use(authenticateToken, superAdminMiddleware);

/**
 * GET /rag
 * Runs the complete RAG pipeline
 */
ragRoutes.get("/", runRagPipeline);

export default ragRoutes;
