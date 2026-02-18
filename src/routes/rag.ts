import express from "express";
import { runRagPipeline } from "../controllers/rag/rag.controller";

const ragRoutes = express.Router();

/**
 * GET /rag
 * Runs the complete RAG pipeline
 */
ragRoutes.get("/", runRagPipeline);

export default ragRoutes;
