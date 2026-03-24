/**
 * Location Permission Middleware — Phase 1 of Kargoli Architecture
 *
 * Checks location_members.role before allowing access to sensitive data.
 * Works alongside existing RBAC middleware (auth → rbac → locationPermission).
 *
 * Usage:
 *   router.get("/financial", authenticateToken, rbacMiddleware, requireLocationPermission("view_financial"), handler)
 *   router.post("/pms/upload", authenticateToken, rbacMiddleware, requireLocationPermission("upload_pms"), handler)
 */

import { Response, NextFunction } from "express";
import { LocationScopedRequest } from "./rbac";
import {
  LocationMemberModel,
  type LocationRole,
} from "../models/LocationMemberModel";

// Extended request with location member role
export interface PermissionRequest extends LocationScopedRequest {
  locationRole?: LocationRole | null;
  accountId?: string;
}

/**
 * Resolve the user's location_members role for the current request.
 * Populates req.locationRole. Does not block — just enriches the request.
 *
 * Call this after rbacMiddleware + locationScopeMiddleware.
 */
export const resolveLocationRole = async (
  req: PermissionRequest,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return next();

    // If a specific location is targeted, get role for that location
    if (req.locationId) {
      req.locationRole = await LocationMemberModel.getRoleForUserAtLocation(
        userId,
        req.locationId,
      );
    } else {
      // No specific location — get highest role across all locations
      req.locationRole = await LocationMemberModel.getHighestRoleForUser(userId);
    }

    next();
  } catch (error) {
    console.error("[LocationPermission] Error resolving role:", error);
    next(); // Don't block on resolution failure
  }
};

/**
 * Require a specific permission based on location_members role.
 * Returns 403 if user lacks the required permission.
 *
 * If no location_members entry exists (pre-migration users), falls back
 * to the existing RBAC role: admin → owner, manager → manager, viewer → read_only.
 */
export const requireLocationPermission = (permission: string) => {
  return async (
    req: PermissionRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // If we have a specific location, check permission there
      if (req.locationId) {
        const hasAccess = await LocationMemberModel.hasPermission(
          userId,
          req.locationId,
          permission,
        );

        if (hasAccess) return next();

        // Fallback: check legacy RBAC role
        if (legacyRoleHasPermission(req.userRole, permission)) {
          return next();
        }

        return res.status(403).json({
          error: "Insufficient permissions for this location",
          permission,
        });
      }

      // No specific location — check if user has permission anywhere
      const hasAnywhere = await LocationMemberModel.hasPermissionAnywhere(
        userId,
        permission,
      );

      if (hasAnywhere) return next();

      // Fallback: check legacy RBAC role
      if (legacyRoleHasPermission(req.userRole, permission)) {
        return next();
      }

      return res.status(403).json({
        error: "Insufficient permissions",
        permission,
      });
    } catch (error) {
      console.error("[LocationPermission] Error checking permission:", error);
      return res.status(500).json({ error: "Failed to verify permissions" });
    }
  };
};

/**
 * Fallback: map existing RBAC roles to location permissions.
 * This ensures backward compatibility during the transition period.
 * Once all users have location_members entries, this can be removed.
 */
function legacyRoleHasPermission(
  rbacRole: string | undefined,
  permission: string,
): boolean {
  if (!rbacRole) return false;

  // Map legacy roles to location roles for permission check
  const legacyMap: Record<string, LocationRole> = {
    admin: "owner",
    manager: "manager",
    viewer: "read_only",
  };

  const mappedRole = legacyMap[rbacRole];
  if (!mappedRole) return false;

  // Use the same permission matrix from LocationMemberModel
  const PERMISSION_MATRIX: Record<string, LocationRole[]> = {
    "view_ranking":       ["owner", "manager", "staff", "read_only"],
    "view_competitor":    ["owner", "manager", "staff", "read_only"],
    "send_review_request":["owner", "manager", "staff"],
    "respond_to_reviews": ["owner", "manager"],
    "edit_website":       ["owner", "manager"],
    "view_financial":     ["owner"],
    "view_referral_intel":["owner", "manager"],
    "upload_pms":         ["owner", "manager"],
    "manage_users":       ["owner"],
    "view_all_locations": ["owner"],
    "manage_billing":     ["owner"],
  };

  const allowedRoles = PERMISSION_MATRIX[permission];
  return allowedRoles ? allowedRoles.includes(mappedRole) : false;
}
