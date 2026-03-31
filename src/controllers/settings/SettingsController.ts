import { Response } from "express";
import bcrypt from "bcrypt";
import { RBACRequest } from "../../middleware/rbac";
import { AuthenticatedRequest } from "../../middleware/tokenRefresh";
import { handleSettingsError } from "./feature-utils/util.error-handler";
import { getUserProfileWithRole } from "./feature-services/service.profile";
import { getGrantedScopes } from "./feature-services/service.scopes";
import {
  getConnectedProperties,
  updateProperty,
} from "./feature-services/service.properties";
import { getAvailablePropertiesByType } from "./feature-services/service.google-properties";
import {
  listOrganizationUsers,
  inviteUserToOrganization,
  resendInvitation,
  removeUserFromOrganization,
  updateUserRole,
} from "./feature-services/service.user-management";
import { UserModel } from "../../models/UserModel";
import { db } from "../../database/connection";

const BCRYPT_SALT_ROUNDS = 12;
const PASSWORD_MIN_LENGTH = 8;

export async function getUserProfile(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId!;
    const user = await getUserProfileWithRole(organizationId, req.userRole);

    return res.json({
      success: true,
      user,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Fetch user profile");
  }
}

export async function getScopes(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId!;
    const result = await getGrantedScopes(organizationId);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Check scopes");
  }
}

export async function getProperties(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId!;
    const properties = await getConnectedProperties(organizationId);

    return res.json({
      success: true,
      properties,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Fetch properties");
  }
}

export async function updateProperties(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId!;
    const { type, data, action } = req.body;

    const result = await updateProperty(organizationId, type, data, action);

    return res.json({
      success: true,
      properties: result.properties,
      message: result.message,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Update property");
  }
}

export async function getAvailableProperties(req: AuthenticatedRequest, res: Response) {
  try {
    const { type } = req.params;
    const oauth2Client = req.oauth2Client;

    if (!oauth2Client) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    const properties = await getAvailablePropertiesByType(type, oauth2Client);

    return res.json({
      success: true,
      properties,
    });
  } catch (error: any) {
    return handleSettingsError(
      res,
      error,
      `Fetch available ${req.params.type}`
    );
  }
}

export async function listUsers(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId!;
    const result = await listOrganizationUsers(organizationId);

    return res.json({
      success: true,
      users: result.users,
      invitations: result.invitations,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Fetch users");
  }
}

export async function inviteUser(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId!;
    const { email, role } = req.body;

    const result = await inviteUserToOrganization(
      organizationId,
      email,
      role,
      req.userRole
    );

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Invite user");
  }
}

export async function resendInvite(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId!;
    const invitationId = parseInt(req.params.invitationId);

    const result = await resendInvitation(organizationId, invitationId);

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Resend invitation");
  }
}

export async function removeUser(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId!;
    const userIdToRemove = parseInt(req.params.userId);

    const result = await removeUserFromOrganization(
      organizationId,
      userIdToRemove,
      req.userId!
    );

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Remove user");
  }
}

export async function changeUserRole(req: RBACRequest, res: Response) {
  try {
    const userIdToUpdate = parseInt(req.params.userId);
    const { role } = req.body;
    const organizationId = req.organizationId!;

    const result = await updateUserRole(
      organizationId,
      userIdToUpdate,
      role,
      req.userId
    );

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Update role");
  }
}

// =====================================================================
// Password Management (user self-service)
// =====================================================================

function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/**
 * GET /api/settings/password-status
 * Returns whether the current user has a password set
 */
export async function getPasswordStatus(req: RBACRequest, res: Response) {
  try {
    const userId = req.userId!;
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      success: true,
      hasPassword: !!user.password_hash,
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Get password status");
  }
}

/**
 * PUT /api/settings/password
 * Change or set password for the current user
 */
export async function changePassword(req: RBACRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: "New password and confirmation are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: "Password must be at least 8 characters with 1 uppercase letter and 1 number",
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If user already has a password, require current password
    if (user.password_hash) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required" });
      }

      const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await UserModel.updatePasswordHash(userId, passwordHash);

    // Ensure email is verified
    if (!user.email_verified) {
      await UserModel.setEmailVerified(userId);
    }

    console.log(`[Settings] Password ${user.password_hash ? "changed" : "set"} for user ${userId} (${user.email})`);

    return res.json({
      success: true,
      message: user.password_hash ? "Password changed successfully" : "Password set successfully",
    });
  } catch (error: any) {
    return handleSettingsError(res, error, "Change password");
  }
}

/**
 * PUT /api/settings/profile
 * Update the current user's name and organization name
 */
export async function updateUserProfile(req: RBACRequest, res: Response) {
  try {
    const userId = req.userId!;
    const orgId = req.organizationId!;
    const { firstName, lastName, practiceName } = req.body;

    // Update user name fields
    if (firstName !== undefined || lastName !== undefined) {
      const userUpdates: Record<string, string> = {};
      if (typeof firstName === "string") userUpdates.first_name = firstName.trim();
      if (typeof lastName === "string") userUpdates.last_name = lastName.trim();
      if (Object.keys(userUpdates).length > 0) {
        await db("users").where({ id: userId }).update(userUpdates);
      }
    }

    // Update organization name
    if (typeof practiceName === "string" && practiceName.trim()) {
      await db("organizations").where({ id: orgId }).update({ name: practiceName.trim() });
    }

    console.log(`[Settings] Profile updated for user ${userId}`);
    return res.json({ success: true, message: "Profile updated" });
  } catch (error: any) {
    return handleSettingsError(res, error, "Update profile");
  }
}

