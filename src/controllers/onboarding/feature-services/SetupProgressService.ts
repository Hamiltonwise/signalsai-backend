import { OrganizationModel } from "../../../models/OrganizationModel";
import { SetupProgress } from "../feature-utils/onboardingValidation";

const DEFAULT_PROGRESS: SetupProgress = {
  step1_api_connected: false,
  step2_pms_uploaded: false,
  dismissed: false,
  completed: false,
};

/**
 * Get the setup wizard progress for an organization.
 *
 * Reads from organizations.setup_progress JSON column.
 */
export async function getSetupProgress(
  organizationId: number
): Promise<SetupProgress> {
  const org = await OrganizationModel.findById(organizationId);

  if (!org) {
    const error = new Error("Organization not found");
    (error as any).statusCode = 404;
    throw error;
  }

  let progress: SetupProgress = { ...DEFAULT_PROGRESS };

  if (org.setup_progress) {
    try {
      const stored =
        typeof org.setup_progress === "string"
          ? JSON.parse(org.setup_progress)
          : org.setup_progress;
      progress = { ...DEFAULT_PROGRESS, ...stored };
    } catch {
      // Use default if parse fails
    }
  }

  return progress;
}

/**
 * Update the setup wizard progress for an organization.
 */
export async function updateSetupProgress(
  organizationId: number,
  progress: SetupProgress
): Promise<void> {
  await OrganizationModel.updateById(organizationId, {
    setup_progress: progress as any,
  });
}
