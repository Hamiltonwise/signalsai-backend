import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/tokenRefresh";
import { extractGoogleAccountId } from "./feature-utils/onboardingHelpers";
import {
  validateProfileData,
  validateProgressData,
} from "./feature-utils/onboardingValidation";
import { completeOnboardingWithProfile } from "./feature-services/ProfileCompletionService";
import {
  getWizardStatus as getWizardStatusService,
  markWizardComplete,
  resetWizard,
} from "./feature-services/WizardStatusService";
import {
  getSetupProgress as getSetupProgressService,
  updateSetupProgress as updateSetupProgressService,
} from "./feature-services/SetupProgressService";
import { GoogleAccountModel } from "../../models/GoogleAccountModel";

/**
 * Consistent error handler preserving the exact response shape
 * from the original onboarding route handlers.
 */
function handleError(res: Response, error: any, operation: string): void {
  console.error(`[Onboarding] ${operation} Error:`, error?.message || error);

  const statusCode = error?.statusCode || 500;

  if (statusCode === 500) {
    res.status(500).json({
      success: false,
      error: `Failed to ${operation.toLowerCase()}`,
      message: error?.message || "Unknown error occurred",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // For 4xx errors, match the original response shapes
  if (statusCode === 400) {
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (statusCode === 404) {
    res.status(404).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(statusCode).json({
    success: false,
    error: error.message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/onboarding/status
 *
 * Check if user has completed onboarding and return profile data.
 */
export async function getOnboardingStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const googleAccountId = extractGoogleAccountId(req);

    const googleAccount = await GoogleAccountModel.findById(googleAccountId);

    if (!googleAccount) {
      const error = new Error("Google account not found");
      (error as any).statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      onboardingCompleted: !!googleAccount.onboarding_completed,
      hasPropertyIds: !!googleAccount.google_property_ids,
      propertyIds: googleAccount.google_property_ids || null,
      profile: {
        firstName: googleAccount.first_name || null,
        lastName: googleAccount.last_name || null,
        phone: googleAccount.phone || null,
        practiceName: googleAccount.practice_name || null,
        operationalJurisdiction:
          googleAccount.operational_jurisdiction || null,
        domainName: googleAccount.domain_name || null,
        email: googleAccount.email || null,
      },
    });
  } catch (error) {
    handleError(res, error, "Check onboarding status");
  }
}

/**
 * POST /api/onboarding/save-properties
 *
 * Save user's profile information and mark onboarding as complete.
 * Creates or updates the organization within a transaction.
 */
export async function completeOnboarding(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const googleAccountId = extractGoogleAccountId(req);

    const { profile } = req.body;
    const profileData = validateProfileData(profile);

    const result = await completeOnboardingWithProfile(
      googleAccountId,
      profileData
    );

    res.json({
      success: true,
      message: "Onboarding completed successfully",
      profile: result.profile,
    });
  } catch (error) {
    handleError(res, error, "Save properties");
  }
}

/**
 * GET /api/onboarding/wizard/status
 *
 * Check if user has completed the product tour wizard.
 */
export async function getWizardStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const googleAccountId = extractGoogleAccountId(req);

    const wizardCompleted = await getWizardStatusService(googleAccountId);

    res.json({
      onboarding_wizard_completed: wizardCompleted,
    });
  } catch (error) {
    handleError(res, error, "Check wizard status");
  }
}

/**
 * PUT /api/onboarding/wizard/complete
 *
 * Mark the product tour wizard as completed.
 */
export async function completeWizard(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const googleAccountId = extractGoogleAccountId(req);

    await markWizardComplete(googleAccountId);

    res.json({
      success: true,
      onboarding_wizard_completed: true,
    });
  } catch (error) {
    handleError(res, error, "Complete wizard");
  }
}

/**
 * POST /api/onboarding/wizard/restart
 *
 * Reset the product tour wizard completion flag.
 */
export async function restartWizard(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const googleAccountId = extractGoogleAccountId(req);

    await resetWizard(googleAccountId);

    res.json({
      success: true,
      onboarding_wizard_completed: false,
    });
  } catch (error) {
    handleError(res, error, "Restart wizard");
  }
}

/**
 * GET /api/onboarding/setup-progress
 *
 * Get the setup progress wizard state.
 */
export async function getSetupProgress(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const googleAccountId = extractGoogleAccountId(req);

    const progress = await getSetupProgressService(googleAccountId);

    res.json({
      success: true,
      progress,
    });
  } catch (error) {
    handleError(res, error, "Get setup progress");
  }
}

/**
 * PUT /api/onboarding/setup-progress
 *
 * Update the setup progress wizard state.
 */
export async function updateSetupProgress(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const googleAccountId = extractGoogleAccountId(req);

    const { progress } = req.body;
    const validatedProgress = validateProgressData(progress);

    await updateSetupProgressService(googleAccountId, validatedProgress);

    res.json({
      success: true,
      progress,
    });
  } catch (error) {
    handleError(res, error, "Update setup progress");
  }
}
