import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
import { SetupProgress } from "../feature-utils/onboardingValidation";

const DEFAULT_PROGRESS: SetupProgress = {
  step1_api_connected: false,
  step2_pms_uploaded: false,
  dismissed: false,
  completed: false,
};

/**
 * Get the setup wizard progress for a google account.
 *
 * Fetches the account and parses the setup_progress JSON field.
 * BaseModel's jsonFields deserialization handles parsing automatically,
 * but we also handle the edge case where the value is a string (e.g. double-encoded)
 * and merge with defaults to ensure all keys exist.
 *
 * Throws with statusCode 404 if the google account is not found.
 */
export async function getSetupProgress(
  googleAccountId: number
): Promise<SetupProgress> {
  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount) {
    const error = new Error("Google account not found");
    (error as any).statusCode = 404;
    throw error;
  }

  let progress: SetupProgress = { ...DEFAULT_PROGRESS };

  if (googleAccount.setup_progress) {
    try {
      const stored =
        typeof googleAccount.setup_progress === "string"
          ? JSON.parse(googleAccount.setup_progress)
          : googleAccount.setup_progress;
      progress = { ...DEFAULT_PROGRESS, ...stored };
    } catch {
      // Use default if parse fails
    }
  }

  return progress;
}

/**
 * Update the setup wizard progress for a google account.
 *
 * BaseModel's serializeJsonFields handles JSON.stringify automatically
 * because setup_progress is declared in GoogleAccountModel.jsonFields.
 */
export async function updateSetupProgress(
  googleAccountId: number,
  progress: SetupProgress
): Promise<void> {
  await GoogleAccountModel.updateById(googleAccountId, {
    setup_progress: progress as any,
  });
}
