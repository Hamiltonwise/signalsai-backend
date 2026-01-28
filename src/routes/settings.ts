import express, { Response } from "express";
import { db } from "../database/connection";
import {
  tokenRefreshMiddleware,
  AuthenticatedRequest,
} from "../middleware/tokenRefresh";
import { google } from "googleapis";
import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import crypto from "crypto";
import { sendInvitation } from "../services/mail";
import {
  rbacMiddleware,
  requireRole,
  canManageRoles,
  RBACRequest,
} from "../middleware/rbac";

const settingsRoutes = express.Router();

/**
 * Helper to handle errors
 */
const handleError = (res: Response, error: any, operation: string) => {
  console.error(`[Settings] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
};

// =====================================================================
// USER PROFILE & ROLE
// =====================================================================

/**
 * GET /api/settings/me
 * Get current user's profile and role
 */
settingsRoutes.get(
  "/me",
  tokenRefreshMiddleware,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;
      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();

      if (!googleAccount) {
        return res.status(404).json({ error: "Account not found" });
      }

      const user = await db("users")
        .where({ id: googleAccount.user_id })
        .first();

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: req.userRole,
          organizationId: googleAccount.organization_id,
        },
      });
    } catch (error) {
      return handleError(res, error, "Fetch user profile");
    }
  },
);

// =====================================================================
// SCOPES MANAGEMENT
// =====================================================================

/**
 * Required OAuth scopes for each Google API
 */
const SCOPE_MAP = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  gbp: "https://www.googleapis.com/auth/business.manage",
} as const;

/**
 * GET /api/settings/scopes
 * Check which API scopes the user has granted
 */
settingsRoutes.get(
  "/scopes",
  tokenRefreshMiddleware,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;

      if (!googleAccountId) {
        return res.status(400).json({ error: "Missing google account ID" });
      }

      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();

      if (!googleAccount) {
        return res.status(404).json({ error: "Account not found" });
      }

      // Parse the scopes from the database
      // Google OAuth returns scopes as space-separated, but we might have stored them as comma-separated
      const scopeString = googleAccount.scopes || "";

      // Try to detect the delimiter (space or comma)
      let grantedScopes: string[] = [];
      if (scopeString.includes(" ")) {
        // Space-separated (Google OAuth format)
        grantedScopes = scopeString.split(" ");
      } else if (scopeString.includes(",")) {
        // Comma-separated (fallback format)
        grantedScopes = scopeString.split(",");
      } else if (scopeString.length > 0) {
        // Single scope
        grantedScopes = [scopeString];
      }

      // Normalize scopes (remove any whitespace and empty strings)
      const normalizedScopes = grantedScopes
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      // Debug logging
      console.log("[Settings] Scopes for account", googleAccountId, ":", {
        raw: scopeString,
        parsed: normalizedScopes,
        checkingFor: Object.values(SCOPE_MAP),
      });

      // Check each required scope
      const scopeStatus = {
        ga4: {
          granted: normalizedScopes.includes(SCOPE_MAP.ga4),
          scope: SCOPE_MAP.ga4,
          name: "Google Analytics 4",
          description: "Read-only access to analytics data and reports",
        },
        gsc: {
          granted: normalizedScopes.includes(SCOPE_MAP.gsc),
          scope: SCOPE_MAP.gsc,
          name: "Google Search Console",
          description: "Read-only access to search performance data",
        },
        gbp: {
          granted: normalizedScopes.includes(SCOPE_MAP.gbp),
          scope: SCOPE_MAP.gbp,
          name: "Google Business Profile",
          description:
            "Manage business listings (used for read access and future review replies)",
        },
      };

      // Count missing scopes
      const missingScopes = Object.entries(scopeStatus)
        .filter(([_, status]) => !status.granted)
        .map(([key]) => key);

      return res.json({
        success: true,
        scopes: scopeStatus,
        missingCount: missingScopes.length,
        missingScopes,
        allGranted: missingScopes.length === 0,
      });
    } catch (error) {
      return handleError(res, error, "Check scopes");
    }
  },
);

// =====================================================================
// PROPERTIES MANAGEMENT
// =====================================================================

/**
 * GET /api/settings/properties
 * Fetch connected properties for the user's organization
 */
settingsRoutes.get(
  "/properties",
  tokenRefreshMiddleware,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;

      if (!googleAccountId) {
        return res.status(400).json({ error: "Missing google account ID" });
      }

      // Get organization ID from the google account
      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();

      if (!googleAccount || !googleAccount.organization_id) {
        return res.status(404).json({ error: "Organization not found" });
      }

      // Parse stored properties
      let properties = {
        ga4: null,
        gsc: null,
        gbp: [],
      };

      if (googleAccount.google_property_ids) {
        try {
          properties =
            typeof googleAccount.google_property_ids === "string"
              ? JSON.parse(googleAccount.google_property_ids)
              : googleAccount.google_property_ids;
        } catch (e) {
          console.error("Error parsing property IDs:", e);
        }
      }

      return res.json({
        success: true,
        properties,
      });
    } catch (error) {
      return handleError(res, error, "Fetch properties");
    }
  },
);

/**
 * POST /api/settings/properties/update
 * Update connected properties (connect/disconnect)
 */
settingsRoutes.post(
  "/properties/update",
  tokenRefreshMiddleware,
  rbacMiddleware,
  requireRole("admin"), // Only admin can connect/disconnect properties
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;
      const { type, data, action } = req.body; // action: 'connect' | 'disconnect'

      if (!googleAccountId) {
        return res.status(400).json({ error: "Missing google account ID" });
      }

      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();

      if (!googleAccount) {
        return res.status(404).json({ error: "Account not found" });
      }

      let currentProperties = googleAccount.google_property_ids;
      if (typeof currentProperties === "string") {
        try {
          currentProperties = JSON.parse(currentProperties);
        } catch (e) {
          currentProperties = { ga4: null, gsc: null, gbp: [] };
        }
      } else if (!currentProperties) {
        currentProperties = { ga4: null, gsc: null, gbp: [] };
      }

      // Update logic based on type and action
      if (type === "ga4") {
        currentProperties.ga4 = action === "connect" ? data : null;
      } else if (type === "gsc") {
        currentProperties.gsc = action === "connect" ? data : null;
      } else if (type === "gbp") {
        if (action === "connect") {
          // For GBP, data is an array of locations. Replace or append?
          // Requirement implies "connect properties", usually replacing the selection or adding to it.
          // For simplicity in this refactor, we'll replace the list or add if singular.
          // Let's assume 'data' is the new list of selected locations.
          currentProperties.gbp = data;
        } else {
          currentProperties.gbp = [];
        }
      }

      await db("google_accounts")
        .where({ id: googleAccountId })
        .update({
          google_property_ids: JSON.stringify(currentProperties),
          updated_at: new Date(),
        });

      return res.json({
        success: true,
        properties: currentProperties,
        message: `Successfully ${action}ed ${type.toUpperCase()} property`,
      });
    } catch (error) {
      return handleError(res, error, "Update property");
    }
  },
);

/**
 * GET /api/settings/properties/available/:type
 * Fetch available properties from Google APIs
 * type: 'ga4' | 'gsc' | 'gbp'
 */
settingsRoutes.get(
  "/properties/available/:type",
  tokenRefreshMiddleware,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const { type } = req.params;
      const oauth2Client = req.oauth2Client;

      if (!oauth2Client) {
        return res.status(401).json({ error: "Authentication failed" });
      }

      let availableProperties: any[] = [];

      if (type === "ga4") {
        const analyticsAdmin = google.analyticsadmin({
          version: "v1beta",
          auth: oauth2Client,
        });

        // List account summaries to get all properties
        const response = await analyticsAdmin.accountSummaries.list();
        const summaries = response.data.accountSummaries || [];

        // Flatten to just properties
        summaries.forEach((summary) => {
          if (summary.propertySummaries) {
            summary.propertySummaries.forEach((prop) => {
              availableProperties.push({
                id: prop.property, // 'properties/12345'
                name: prop.displayName,
                account: summary.displayName,
              });
            });
          }
        });
      } else if (type === "gsc") {
        const searchConsole = google.searchconsole({
          version: "v1",
          auth: oauth2Client,
        });

        const response = await searchConsole.sites.list();
        const sites = response.data.siteEntry || [];

        availableProperties = sites.map((site) => ({
          id: site.siteUrl,
          name: site.siteUrl, // GSC doesn't really have display names other than URL
          permissionLevel: site.permissionLevel,
        }));
      } else if (type === "gbp") {
        const accountManagement =
          new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({
            auth: oauth2Client,
          });

        const businessInfo =
          new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
            auth: oauth2Client,
          });

        // 1. Get Accounts
        const accountsResp = await accountManagement.accounts.list();
        const accounts = accountsResp.data.accounts || [];

        // 2. Get Locations for each account (simplified to first account for now, or flatten all)
        for (const account of accounts) {
          if (account.name) {
            const locationsResp = await businessInfo.accounts.locations.list({
              parent: account.name,
              readMask: "name,title,storeCode,metadata",
            });

            const locations = locationsResp.data.locations || [];
            locations.forEach((loc) => {
              availableProperties.push({
                id: loc.name, // 'locations/12345'
                name: loc.title,
                accountId: account.name?.split("/")[1], // Extract ID
                locationId: loc.name?.split("/")[1], // Extract ID
                address: loc.storeCode, // Or formatted address if available
              });
            });
          }
        }
      } else {
        return res.status(400).json({ error: "Invalid property type" });
      }

      return res.json({
        success: true,
        properties: availableProperties,
      });
    } catch (error) {
      return handleError(res, error, `Fetch available ${req.params.type}`);
    }
  },
);

// =====================================================================
// USER MANAGEMENT
// =====================================================================

/**
 * GET /api/settings/users
 * List users in the organization
 */
settingsRoutes.get(
  "/users",
  tokenRefreshMiddleware,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;

      // Get organization ID
      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();

      if (!googleAccount || !googleAccount.organization_id) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const orgId = googleAccount.organization_id;

      // Fetch users with roles
      const users = await db("organization_users")
        .join("users", "organization_users.user_id", "users.id")
        .where("organization_users.organization_id", orgId)
        .select(
          "users.id",
          "users.email",
          "users.name",
          "organization_users.role",
          "organization_users.created_at as joined_at",
        );

      // Fetch pending invitations
      const invitations = await db("invitations")
        .where({ organization_id: orgId, status: "pending" })
        .select("id", "email", "role", "created_at", "expires_at");

      return res.json({
        success: true,
        users,
        invitations,
      });
    } catch (error) {
      return handleError(res, error, "Fetch users");
    }
  },
);

/**
 * POST /api/settings/users/invite
 * Invite a new user to the organization
 */
settingsRoutes.post(
  "/users/invite",
  tokenRefreshMiddleware,
  rbacMiddleware,
  requireRole("admin", "manager"), // Admin and manager can invite
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;
      const { email, role } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Managers can only invite managers and viewers, not admins
      if (req.userRole === "manager" && role === "admin") {
        return res.status(403).json({
          error: "Managers cannot invite admins",
        });
      }

      // Get organization ID
      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();

      if (!googleAccount || !googleAccount.organization_id) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const orgId = googleAccount.organization_id;

      // Check if user is already in the organization
      const existingMember = await db("organization_users")
        .join("users", "organization_users.user_id", "users.id")
        .where({
          "organization_users.organization_id": orgId,
          "users.email": email.toLowerCase(),
        })
        .first();

      if (existingMember) {
        return res
          .status(400)
          .json({ error: "User is already a member of this organization" });
      }

      // Check if invitation already exists
      const existingInvite = await db("invitations")
        .where({
          organization_id: orgId,
          email: email.toLowerCase(),
          status: "pending",
        })
        .first();

      if (existingInvite) {
        return res
          .status(400)
          .json({ error: "Invitation already sent to this email" });
      }

      // Create invitation
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      await db("invitations").insert({
        email: email.toLowerCase(),
        organization_id: orgId,
        role: role || "viewer",
        token,
        expires_at: expiresAt,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Get organization name for email
      const organization = await db("organizations")
        .where({ id: orgId })
        .first();

      const organizationName = organization?.name || "the organization";

      // Send invitation email
      const emailSent = await sendInvitation(
        email.toLowerCase(),
        organizationName,
        role || "viewer",
      );

      if (!emailSent) {
        console.warn(`[Settings] Failed to send invitation email to ${email}`);
      } else {
        console.log(`[Settings] Invitation email sent to ${email}`);
      }

      return res.json({
        success: true,
        message: `Invitation sent to ${email}`,
      });
    } catch (error) {
      return handleError(res, error, "Invite user");
    }
  },
);

/**
 * DELETE /api/settings/users/:userId
 * Remove a user from the organization
 */
settingsRoutes.delete(
  "/users/:userId",
  tokenRefreshMiddleware,
  rbacMiddleware,
  requireRole("admin"), // Only admin can remove users
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;
      const userIdToRemove = parseInt(req.params.userId);

      if (isNaN(userIdToRemove)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      // Get organization ID and requester's role
      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();

      if (!googleAccount || !googleAccount.organization_id) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const orgId = googleAccount.organization_id;
      const userId = googleAccount.user_id; // Requester's user ID

      // Check requester's role
      const requester = await db("organization_users")
        .where({ organization_id: orgId, user_id: userId })
        .first();

      if (!requester || requester.role !== "admin") {
        return res.status(403).json({ error: "Only admins can remove users" });
      }

      // Prevent removing yourself
      if (userId === userIdToRemove) {
        return res.status(400).json({ error: "You cannot remove yourself" });
      }

      // Remove user
      await db("organization_users")
        .where({ organization_id: orgId, user_id: userIdToRemove })
        .delete();

      return res.json({
        success: true,
        message: "User removed from organization",
      });
    } catch (error) {
      return handleError(res, error, "Remove user");
    }
  },
);

/**
 * PUT /api/settings/users/:userId/role
 * Change a user's role (admin only)
 * Forces the user to log out by invalidating their session
 */
settingsRoutes.put(
  "/users/:userId/role",
  tokenRefreshMiddleware,
  rbacMiddleware,
  requireRole("admin"),
  async (req: RBACRequest, res) => {
    try {
      const userIdToUpdate = parseInt(req.params.userId);
      const { role } = req.body;

      if (isNaN(userIdToUpdate)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      if (!["admin", "manager", "viewer"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const googleAccountId = req.googleAccountId;
      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .first();

      if (!googleAccount || !googleAccount.organization_id) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const orgId = googleAccount.organization_id;

      // Prevent changing own role
      if (req.userId === userIdToUpdate) {
        return res
          .status(400)
          .json({ error: "You cannot change your own role" });
      }

      // Update role
      const updated = await db("organization_users")
        .where({
          organization_id: orgId,
          user_id: userIdToUpdate,
        })
        .update({
          role,
          updated_at: new Date(),
        });

      if (!updated) {
        return res
          .status(404)
          .json({ error: "User not found in organization" });
      }

      return res.json({
        success: true,
        message: `Role updated to ${role}. User will need to log in again.`,
      });
    } catch (error) {
      return handleError(res, error, "Update role");
    }
  },
);

export default settingsRoutes;
