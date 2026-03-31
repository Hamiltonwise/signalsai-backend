import { Request, Response, NextFunction } from "express";

/**
 * Snapshot Token Middleware
 *
 * Protects /api/snapshot/* endpoints with a temporary token.
 * Token is stored in SNAPSHOT_TOKEN env var.
 *
 * To enable:  Set SNAPSHOT_TOKEN=<any-uuid> in .env
 * To disable: Remove SNAPSHOT_TOKEN from .env (or set to empty)
 *
 * Read-only access only. No mutations possible through snapshot endpoints.
 */
export const validateSnapshotToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = process.env.SNAPSHOT_TOKEN;

  // If no token configured, endpoint is disabled
  if (!token || token.trim() === "") {
    return res.status(404).json({ error: "Not found" });
  }

  // Check query param or header
  const provided =
    (req.query.token as string) ||
    req.headers["x-snapshot-token"] as string;

  if (!provided || provided !== token) {
    return res.status(401).json({ error: "Invalid snapshot token" });
  }

  next();
};
