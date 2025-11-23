import { Response, NextFunction } from "express";
import { db } from "../database/connection";
import { AuthenticatedRequest } from "./tokenRefresh";

export type UserRole = "admin" | "manager" | "viewer";

export interface RBACRequest extends AuthenticatedRequest {
  userRole?: UserRole;
  userId?: number;
}

/**
 * RBAC Middleware - Checks user role from database on each request
 * This ensures role changes are immediately effective
 */
export const rbacMiddleware = async (
  req: RBACRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const googleAccountId = req.googleAccountId;

    if (!googleAccountId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get user from google account
    const googleAccount = await db("google_accounts")
      .where({ id: googleAccountId })
      .first();

    if (!googleAccount || !googleAccount.user_id) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get user role from organization_users
    const orgUser = await db("organization_users")
      .where({
        user_id: googleAccount.user_id,
        organization_id: googleAccount.organization_id,
      })
      .first();

    if (!orgUser) {
      return res.status(403).json({ error: "User not in organization" });
    }

    // Attach role and userId to request
    req.userRole = orgUser.role as UserRole;
    req.userId = googleAccount.user_id;

    next();
  } catch (error) {
    console.error("[RBAC] Error checking role:", error);
    return res.status(500).json({ error: "Failed to verify permissions" });
  }
};

/**
 * Require specific roles to access an endpoint
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: RBACRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: allowedRoles,
        current: req.userRole,
      });
    }

    next();
  };
};

/**
 * Check if user can perform write operations
 */
export const canWrite = (req: RBACRequest): boolean => {
  return req.userRole === "admin" || req.userRole === "manager";
};

/**
 * Check if user is admin
 */
export const isAdmin = (req: RBACRequest): boolean => {
  return req.userRole === "admin";
};

/**
 * Check if user can manage connections (admin only)
 */
export const canManageConnections = (req: RBACRequest): boolean => {
  return req.userRole === "admin";
};

/**
 * Check if user can manage roles (admin only)
 */
export const canManageRoles = (req: RBACRequest): boolean => {
  return req.userRole === "admin";
};
