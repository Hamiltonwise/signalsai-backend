/**
 * Org User Controller
 *
 * Handles org-scoped user management:
 * - POST   /api/admin/organizations/:id/users           - Create user + link
 * - POST   /api/admin/organizations/:id/invite           - Invite user (temp password)
 * - PATCH  /api/admin/organizations/:id/users/:userId/password - Reset password
 * - PATCH  /api/admin/organizations/:id/users/:userId/role     - Change role
 * - DELETE /api/admin/organizations/:id/users/:userId          - Remove from org
 */

import { Response } from "express";
import bcrypt from "bcrypt";
import { AuthRequest } from "../../middleware/auth";
import { UserModel } from "../../models/UserModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { OrganizationModel } from "../../models/OrganizationModel";

const BCRYPT_SALT_ROUNDS = 12;
const VALID_ROLES = ["admin", "manager", "viewer"];

function handleError(res: Response, error: unknown, operation: string): Response {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[OrgUser] ${operation} Error:`, message);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message,
  });
}

/**
 * POST /api/admin/organizations/:id/users
 * Create a user and link to organization
 */
export async function createOrgUser(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ success: false, error: "Invalid organization ID" });
    }

    const { email, password, role, firstName, lastName } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ success: false, error: "Email is required" });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ success: false, error: "Password is required (minimum 6 characters)" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userRole = VALID_ROLES.includes(role) ? role : "viewer";

    // Verify org exists
    const org = await OrganizationModel.findById(orgId);
    if (!org) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Check if user already exists
    let user = await UserModel.findByEmail(normalizedEmail);

    if (user) {
      // Check if already linked to this org
      const existingLink = await OrganizationUserModel.findByUserAndOrg(user.id, orgId);
      if (existingLink) {
        return res.status(409).json({
          success: false,
          error: "User is already a member of this organization",
        });
      }
    } else {
      // Create new user
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
      user = await UserModel.create({
        email: normalizedEmail,
        name: [firstName, lastName].filter(Boolean).join(" ") || normalizedEmail.split("@")[0],
        password_hash: passwordHash,
      });

      // Mark email as verified (admin-created accounts skip verification)
      await UserModel.setEmailVerified(user.id);

      // Set first/last name if provided
      if (firstName || lastName) {
        await UserModel.updateProfile(user.id, {
          first_name: firstName || undefined,
          last_name: lastName || undefined,
        });
      }
    }

    // Link user to org
    await OrganizationUserModel.create({
      user_id: user.id,
      organization_id: orgId,
      role: userRole,
    });

    console.log(
      `[OrgUser] Created user ${normalizedEmail} (role: ${userRole}) in org ${orgId} by admin ${req.user?.email}`
    );

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: userRole,
      },
      message: `User ${normalizedEmail} added to organization`,
    });
  } catch (error) {
    return handleError(res, error, "Create org user");
  }
}

/**
 * POST /api/admin/organizations/:id/invite
 * Create user with temporary password (invite flow)
 */
export async function inviteOrgUser(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ success: false, error: "Invalid organization ID" });
    }

    const { email, role } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userRole = VALID_ROLES.includes(role) ? role : "viewer";

    // Verify org exists
    const org = await OrganizationModel.findById(orgId);
    if (!org) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Check for existing user in this org
    let user = await UserModel.findByEmail(normalizedEmail);
    if (user) {
      const existingLink = await OrganizationUserModel.findByUserAndOrg(user.id, orgId);
      if (existingLink) {
        return res.status(409).json({
          success: false,
          error: "User is already a member of this organization",
        });
      }
    }

    // Generate a random temporary password
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);

    if (!user) {
      user = await UserModel.create({
        email: normalizedEmail,
        name: normalizedEmail.split("@")[0],
        password_hash: passwordHash,
      });
      await UserModel.setEmailVerified(user.id);
    } else {
      // Update existing user's password if they don't have one
      if (!user.password_hash) {
        await UserModel.updatePasswordHash(user.id, passwordHash);
        if (!user.email_verified) {
          await UserModel.setEmailVerified(user.id);
        }
      }
    }

    // Link to org
    await OrganizationUserModel.create({
      user_id: user.id,
      organization_id: orgId,
      role: userRole,
    });

    console.log(
      `[OrgUser] Invited ${normalizedEmail} (role: ${userRole}) to org ${orgId} by admin ${req.user?.email}`
    );

    // Email sending can be wired up later via Mailgun/n8n
    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: userRole,
      },
      temporaryPassword: tempPassword,
      message: `User ${normalizedEmail} invited to organization`,
    });
  } catch (error) {
    return handleError(res, error, "Invite org user");
  }
}

/**
 * PATCH /api/admin/organizations/:id/users/:userId/password
 * Reset a user's password
 */
export async function resetOrgUserPassword(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(orgId) || isNaN(userId)) {
      return res.status(400).json({ success: false, error: "Invalid organization or user ID" });
    }

    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: "New password is required (minimum 6 characters)" });
    }

    // Verify user belongs to org
    const link = await OrganizationUserModel.findByUserAndOrg(userId, orgId);
    if (!link) {
      return res.status(404).json({ success: false, error: "User not found in this organization" });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await UserModel.updatePasswordHash(userId, passwordHash);

    // Ensure email is verified so user can log in
    const user = await UserModel.findById(userId);
    if (user && !user.email_verified) {
      await UserModel.setEmailVerified(userId);
    }

    console.log(
      `[OrgUser] Password reset for user ${userId} in org ${orgId} by admin ${req.user?.email}`
    );

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    return handleError(res, error, "Reset org user password");
  }
}

/**
 * PATCH /api/admin/organizations/:id/users/:userId/role
 * Change a user's role within the organization
 */
export async function changeOrgUserRole(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(orgId) || isNaN(userId)) {
      return res.status(400).json({ success: false, error: "Invalid organization or user ID" });
    }

    const { role } = req.body;
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Role must be one of: ${VALID_ROLES.join(", ")}`,
      });
    }

    // Verify user belongs to org
    const link = await OrganizationUserModel.findByUserAndOrg(userId, orgId);
    if (!link) {
      return res.status(404).json({ success: false, error: "User not found in this organization" });
    }

    await OrganizationUserModel.updateRole(userId, orgId, role);

    console.log(
      `[OrgUser] Role changed to ${role} for user ${userId} in org ${orgId} by admin ${req.user?.email}`
    );

    return res.json({
      success: true,
      message: `Role updated to ${role}`,
      role,
    });
  } catch (error) {
    return handleError(res, error, "Change org user role");
  }
}

/**
 * DELETE /api/admin/organizations/:id/users/:userId
 * Remove a user from the organization (does not delete the user)
 */
export async function removeOrgUser(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(orgId) || isNaN(userId)) {
      return res.status(400).json({ success: false, error: "Invalid organization or user ID" });
    }

    // Verify user belongs to org
    const link = await OrganizationUserModel.findByUserAndOrg(userId, orgId);
    if (!link) {
      return res.status(404).json({ success: false, error: "User not found in this organization" });
    }

    await OrganizationUserModel.deleteByUserAndOrg(userId, orgId);

    console.log(
      `[OrgUser] Removed user ${userId} from org ${orgId} by admin ${req.user?.email}`
    );

    return res.json({
      success: true,
      message: "User removed from organization",
    });
  } catch (error) {
    return handleError(res, error, "Remove org user");
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;

  let password = "";
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];

  for (let i = 3; i < 12; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}
