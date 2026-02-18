import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import { validateGoogleAccountId, validateUpdateFields } from "./profile-utils/validation.util";
import { formatProfileDataResponse, formatProfileUpdateResponse, formatErrorResponse } from "./profile-utils/response.util";
import { getProfileData, updateProfileData } from "./profile-services/profile.service";

export async function getProfile(req: RBACRequest, res: Response) {
  try {
    const googleAccountId = req.googleAccountId;

    validateGoogleAccountId(googleAccountId);

    const profileData = await getProfileData(googleAccountId);

    return res.json(formatProfileDataResponse(profileData));
  } catch (error: any) {
    const errorResponse = formatErrorResponse(error, "Fetch profile data");
    return res.status(errorResponse.statusCode).json(errorResponse.body);
  }
}

export async function updateProfile(req: RBACRequest, res: Response) {
  try {
    const googleAccountId = req.googleAccountId;
    const { phone, operational_jurisdiction } = req.body;

    validateGoogleAccountId(googleAccountId);

    const updates = validateUpdateFields(phone, operational_jurisdiction);

    const profileData = await updateProfileData(googleAccountId, updates);

    return res.json(formatProfileUpdateResponse(profileData));
  } catch (error: any) {
    const errorResponse = formatErrorResponse(error, "Update profile data");
    return res.status(errorResponse.statusCode).json(errorResponse.body);
  }
}
