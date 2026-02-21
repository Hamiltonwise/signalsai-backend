import { RBACRequest } from "../../../middleware/rbac";

/**
 * Extract the organization ID from the request.
 *
 * Reads req.organizationId (set by rbacMiddleware).
 *
 * Throws with statusCode 400 if the ID is missing or invalid.
 */
export function extractOrganizationId(
  req: RBACRequest
): number {
  const organizationId = req.organizationId;
  if (!organizationId) {
    const error = new Error("Missing organization ID");
    (error as any).statusCode = 400;
    throw error;
  }

  return organizationId;
}
