import { Response } from "express";
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
  removeUserFromOrganization,
  updateUserRole,
} from "./feature-services/service.user-management";

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
