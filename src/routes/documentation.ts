/**
 * Documentation Routes
 *
 * Serves API documentation for all available GBP routes.
 * - GET /api/documentation - Returns full API documentation as JSON
 */

import express from "express";
import {
  getApiDocumentation,
  API_DOCUMENTATION,
  COMMON_PATTERNS,
} from "../controllers/documentation/documentationController";

const router = express.Router();

/**
 * GET /api/documentation
 * Returns the full API documentation and common patterns
 */
router.get("/", getApiDocumentation);

export default router;

// Backward compatibility re-exports
export { API_DOCUMENTATION, COMMON_PATTERNS };
