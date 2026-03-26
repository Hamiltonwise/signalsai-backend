/**
 * Location Member Model — per-location role-based access
 *
 * Each row grants a user a specific role at a specific location.
 * Roles: owner, manager, staff, read_only
 *
 * This is the foundation for the Kargoli Architecture:
 * Account → Locations → Users → Roles
 */

import { db } from "../database/connection";

export type LocationRole = "owner" | "manager" | "staff" | "read_only";

export interface ILocationMember {
  id: string;
  location_id: number;
  user_id: number;
  role: LocationRole;
  created_at: Date;
}

// Permission matrix from the spec
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

export class LocationMemberModel {
  static async findByLocationAndUser(
    locationId: number,
    userId: number,
  ): Promise<ILocationMember | undefined> {
    return db("location_members")
      .where({ location_id: locationId, user_id: userId })
      .first();
  }

  static async findByUserId(userId: number): Promise<ILocationMember[]> {
    return db("location_members")
      .where({ user_id: userId })
      .orderBy("created_at", "asc");
  }

  static async findByLocationId(locationId: number): Promise<ILocationMember[]> {
    return db("location_members")
      .where({ location_id: locationId })
      .orderBy("role", "asc");
  }

  static async getLocationIdsForUser(userId: number): Promise<number[]> {
    const rows = await db("location_members")
      .where({ user_id: userId })
      .select("location_id");
    return rows.map((r: any) => r.location_id);
  }

  static async getRoleForUserAtLocation(
    userId: number,
    locationId: number,
  ): Promise<LocationRole | null> {
    const row = await db("location_members")
      .where({ user_id: userId, location_id: locationId })
      .first();
    return row ? (row.role as LocationRole) : null;
  }

  static async getHighestRoleForUser(userId: number): Promise<LocationRole | null> {
    const rows = await db("location_members")
      .where({ user_id: userId })
      .select("role");

    if (rows.length === 0) return null;

    const priority: LocationRole[] = ["owner", "manager", "staff", "read_only"];
    for (const role of priority) {
      if (rows.some((r: any) => r.role === role)) return role;
    }
    return null;
  }

  /**
   * Check if a user has a specific permission at a specific location.
   */
  static async hasPermission(
    userId: number,
    locationId: number,
    permission: string,
  ): Promise<boolean> {
    const allowedRoles = PERMISSION_MATRIX[permission];
    if (!allowedRoles) return false;

    const role = await this.getRoleForUserAtLocation(userId, locationId);
    if (!role) return false;

    return allowedRoles.includes(role);
  }

  /**
   * Check if a user has a permission across ANY of their locations.
   */
  static async hasPermissionAnywhere(
    userId: number,
    permission: string,
  ): Promise<boolean> {
    const allowedRoles = PERMISSION_MATRIX[permission];
    if (!allowedRoles) return false;

    const count = await db("location_members")
      .where({ user_id: userId })
      .whereIn("role", allowedRoles)
      .count("* as count")
      .first();

    return parseInt((count as any)?.count || "0", 10) > 0;
  }

  static async create(data: {
    location_id: number;
    user_id: number;
    role: LocationRole;
  }): Promise<ILocationMember> {
    const [row] = await db("location_members").insert(data).returning("*");
    return row;
  }

  static async updateRole(
    locationId: number,
    userId: number,
    role: LocationRole,
  ): Promise<number> {
    return db("location_members")
      .where({ location_id: locationId, user_id: userId })
      .update({ role });
  }

  static async remove(locationId: number, userId: number): Promise<number> {
    return db("location_members")
      .where({ location_id: locationId, user_id: userId })
      .del();
  }
}
