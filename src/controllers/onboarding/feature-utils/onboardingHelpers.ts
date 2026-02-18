import { AuthenticatedRequest } from "../../../middleware/tokenRefresh";

/**
 * Extract the google account ID from the request.
 *
 * Checks req.googleAccountId first (set by tokenRefreshMiddleware when applied),
 * then falls back to the x-google-account-id header for routes where middleware
 * is not applied.
 *
 * Throws with statusCode 400 if the ID is missing or invalid.
 */
export function extractGoogleAccountId(
  req: AuthenticatedRequest
): number {
  const fromMiddleware = req.googleAccountId;
  if (fromMiddleware) return fromMiddleware;

  const fromHeader = req.headers["x-google-account-id"];
  if (!fromHeader) {
    const error = new Error("Missing google account ID");
    (error as any).statusCode = 400;
    throw error;
  }

  const id = parseInt(fromHeader as string, 10);
  if (isNaN(id)) {
    const error = new Error("Missing google account ID");
    (error as any).statusCode = 400;
    throw error;
  }

  return id;
}
