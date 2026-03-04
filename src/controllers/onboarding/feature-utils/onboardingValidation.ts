/**
 * Validated profile data shape returned by validateProfileData.
 */
export interface ProfileData {
  firstName: string;
  lastName: string;
  phone?: string;
  practiceName: string;
  operationalJurisdiction?: string;
  domainName: string;
}

/**
 * Validated setup progress shape returned by validateProgressData.
 */
export interface SetupProgress {
  step1_api_connected: boolean;
  step2_pms_uploaded: boolean;
  dismissed: boolean;
  completed: boolean;
}

/**
 * Validate profile data from the request body.
 *
 * Throws with statusCode 400 if any required field is missing.
 * Preserves the exact error message from the original route handler.
 */
export function validateProfileData(profile: any): ProfileData {
  if (
    !profile ||
    !profile.firstName ||
    !profile.lastName ||
    !profile.practiceName ||
    !profile.domainName
  ) {
    const error = new Error(
      "Profile information is required (firstName, lastName, practiceName, domainName)"
    );
    (error as any).statusCode = 400;
    throw error;
  }

  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone || undefined,
    practiceName: profile.practiceName,
    operationalJurisdiction: profile.operationalJurisdiction || undefined,
    domainName: profile.domainName,
  };
}

/**
 * Validate progress data from the request body.
 *
 * Throws with statusCode 400 if the progress object is missing.
 * Preserves the exact error message from the original route handler.
 */
export function validateProgressData(progress: any): SetupProgress {
  if (!progress) {
    const error = new Error("Progress object is required");
    (error as any).statusCode = 400;
    throw error;
  }

  return progress as SetupProgress;
}
