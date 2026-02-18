import { GoogleAccountModel } from "../../../models/GoogleAccountModel";

/**
 * Get the product tour wizard completion status.
 *
 * Throws with statusCode 404 if the google account is not found.
 * Returns the boolean flag for onboarding_wizard_completed.
 */
export async function getWizardStatus(
  googleAccountId: number
): Promise<boolean> {
  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount) {
    const error = new Error("Google account not found");
    (error as any).statusCode = 404;
    throw error;
  }

  return !!googleAccount.onboarding_wizard_completed;
}

/**
 * Mark the product tour wizard as completed.
 */
export async function markWizardComplete(
  googleAccountId: number
): Promise<void> {
  await GoogleAccountModel.updateById(googleAccountId, {
    onboarding_wizard_completed: true,
  });
}

/**
 * Reset the product tour wizard completion flag.
 */
export async function resetWizard(
  googleAccountId: number
): Promise<void> {
  await GoogleAccountModel.updateById(googleAccountId, {
    onboarding_wizard_completed: false,
  });
}
