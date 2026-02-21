import { OrganizationModel } from "../../../models/OrganizationModel";

/**
 * Get the product tour wizard completion status.
 *
 * Reads from organizations.onboarding_wizard_completed.
 */
export async function getWizardStatus(
  organizationId: number
): Promise<boolean> {
  const org = await OrganizationModel.findById(organizationId);

  if (!org) {
    return false;
  }

  return !!org.onboarding_wizard_completed;
}

/**
 * Mark the product tour wizard as completed.
 */
export async function markWizardComplete(
  organizationId: number
): Promise<void> {
  await OrganizationModel.updateById(organizationId, {
    onboarding_wizard_completed: true,
  });
}

/**
 * Reset the product tour wizard completion flag.
 */
export async function resetWizard(
  organizationId: number
): Promise<void> {
  await OrganizationModel.updateById(organizationId, {
    onboarding_wizard_completed: false,
  });
}
