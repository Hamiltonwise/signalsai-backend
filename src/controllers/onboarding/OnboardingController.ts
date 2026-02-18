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
import { checkDomain as checkDomainService } from "./feature-services/DomainCheckService";
import {
  getAvailableGBPLocations,
  saveGBPSelection,
  getGBPLocationWebsite,
} from "./feature-services/GbpOnboardingService";

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

/**
 * GET /api/onboarding/available-gbp
 *
 * Fetch available GBP locations for the authenticated user.
 * Requires tokenRefreshMiddleware (provides req.oauth2Client).
 */
export async function getAvailableGBP(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.oauth2Client) {
      res.status(401).json({ success: false, error: "Authentication failed" });
      return;
    }

    const properties = await getAvailableGBPLocations(req.oauth2Client);

    res.json({
      success: true,
      properties,
    });
  } catch (error) {
    handleError(res, error, "Fetch available GBP locations");
  }
}

/**
 * POST /api/onboarding/save-gbp
 *
 * Save selected GBP locations to google_property_ids.gbp.
 * Same storage pattern as the settings page.
 */
export async function saveGBP(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const googleAccountId = extractGoogleAccountId(req);
    const { data } = req.body;

    if (!data || !Array.isArray(data)) {
      const error = new Error("data must be an array of GBP locations");
      (error as any).statusCode = 400;
      throw error;
    }

    const result = await saveGBPSelection(googleAccountId, data);

    res.json({
      success: true,
      properties: result.properties,
      message: result.message,
    });
  } catch (error) {
    handleError(res, error, "Save GBP selection");
  }
}

/**
 * POST /api/onboarding/gbp-website
 *
 * Fetch the website URL for a specific GBP location.
 * Returns the raw websiteUri and a clean domain.
 */
export async function getGBPWebsite(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.oauth2Client) {
      res.status(401).json({ success: false, error: "Authentication failed" });
      return;
    }

    const { accountId, locationId } = req.body;

    if (!accountId || !locationId) {
      const error = new Error("accountId and locationId are required");
      (error as any).statusCode = 400;
      throw error;
    }

    const result = await getGBPLocationWebsite(
      req.oauth2Client,
      accountId,
      locationId
    );

    res.json({
      success: true,
      websiteUri: result.websiteUri,
      domain: result.domain,
    });
  } catch (error) {
    handleError(res, error, "Fetch GBP website");
  }
}

/**
 * POST /api/onboarding/check-domain
 *
 * Check if a domain is reachable and not behind a firewall.
 * Returns valid/warning/unreachable status.
 * Warning does not block — user can still proceed.
 */
export async function checkDomain(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { domain } = req.body;

    if (!domain || typeof domain !== "string") {
      const error = new Error("domain is required");
      (error as any).statusCode = 400;
      throw error;
    }

    const result = await checkDomainService(domain);

    res.json({
      success: true,
      status: result.status,
      message: result.message,
    });
  } catch (error) {
    handleError(res, error, "Check domain");
  }
}
