import { Request, Response } from "express";
import { API_DOCUMENTATION } from "./documentation-utils/apiDocumentation";
import { COMMON_PATTERNS } from "./documentation-utils/commonPatterns";

/**
 * GET /
 * Returns the full API documentation as JSON
 */
export function getApiDocumentation(_req: Request, res: Response) {
  res.json({
    documentation: API_DOCUMENTATION,
    commonPatterns: COMMON_PATTERNS,
  });
}

// Re-exports for backward compatibility and direct access
export { API_DOCUMENTATION } from "./documentation-utils/apiDocumentation";
export { COMMON_PATTERNS } from "./documentation-utils/commonPatterns";
