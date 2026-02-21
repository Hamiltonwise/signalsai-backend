import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import { validateOrganizationId, validateUpdateFields } from "./profile-utils/validation.util";
import { formatProfileDataResponse, formatProfileUpdateResponse, formatErrorResponse } from "./profile-utils/response.util";
import { getProfileData, updateProfileData } from "./profile-services/profile.service";

export async function getProfile(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId;

    validateOrganizationId(organizationId);

    const profileData = await getProfileData(organizationId);

    return res.json(formatProfileDataResponse(profileData));
  } catch (error: any) {
    const errorResponse = formatErrorResponse(error, "Fetch profile data");
    return res.status(errorResponse.statusCode).json(errorResponse.body);
  }
}

export async function updateProfile(req: RBACRequest, res: Response) {
  try {
    const organizationId = req.organizationId;
    const { phone, operational_jurisdiction } = req.body;

    validateOrganizationId(organizationId);

    const updates = validateUpdateFields(phone, operational_jurisdiction);

    const profileData = await updateProfileData(organizationId, updates);

    return res.json(formatProfileUpdateResponse(profileData));
  } catch (error: any) {
    const errorResponse = formatErrorResponse(error, "Update profile data");
    return res.status(errorResponse.statusCode).json(errorResponse.body);
  }
}
