import { apiGet, apiPut } from "./index";

export interface ProfileData {
  phone: string | null;
  operational_jurisdiction: string | null;
}

export interface ProfileResponse {
  success: boolean;
  data?: ProfileData;
  errorMessage?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  errorMessage?: string;
}

/**
 * Fetches the user's profile data (phone and operational_jurisdiction)
 * from the google_accounts table
 */
export const getProfile = async (): Promise<ProfileResponse> => {
  return apiGet({ path: "/profile/get" });
};

/**
 * Updates the user's profile data (phone and/or operational_jurisdiction)
 * in the google_accounts table
 */
export const updateProfile = async (
  data: Partial<ProfileData>
): Promise<UpdateProfileResponse> => {
  return apiPut({ path: "/profile/update", passedData: data });
};

// Password management

export interface PasswordStatusResponse {
  success: boolean;
  hasPassword: boolean;
}

export interface ChangePasswordRequest {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
  error?: string;
}

export const getPasswordStatus = async (): Promise<PasswordStatusResponse> => {
  return apiGet({ path: "/settings/password-status" });
};

export const changePassword = async (
  data: ChangePasswordRequest
): Promise<ChangePasswordResponse> => {
  return apiPut({ path: "/settings/password", passedData: data });
};

export default {
  getProfile,
  updateProfile,
  getPasswordStatus,
  changePassword,
};
