import { db } from "../../../database/connection";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { ProfileData } from "../feature-utils/onboardingValidation";

export interface ProfileCompletionResult {
  profile: ProfileData;
}

/**
 * Complete onboarding by saving profile data and creating/updating the organization.
 *
 * Runs the entire operation inside a database transaction:
 * 1. Fetch the google account (verify it exists)
 * 2. If no organization exists, create one and link the user as admin
 * 3. If an organization exists, update its name and domain
 * 4. Update the google account with profile fields and mark onboarding_completed = true
 *
 * Throws if the google account is not found (the transaction rolls back automatically).
 */
export async function completeOnboardingWithProfile(
  googleAccountId: number,
  profileData: ProfileData
): Promise<ProfileCompletionResult> {
  await db.transaction(async (trx) => {
    const googleAccount = await GoogleConnectionModel.findById(
      googleAccountId,
      trx
    );

    if (!googleAccount) {
      throw new Error("Google account not found");
    }

    let orgId = googleAccount.organization_id;

    // If no organization exists (e.g. new user), create one
    if (!orgId) {
      const newOrg = await OrganizationModel.create(
        {
          name:
            profileData.practiceName ||
            `${profileData.firstName}'s Organization`,
          domain: profileData.domainName,
        },
        trx
      );

      orgId = newOrg.id;

      // Link user to organization as admin
      await OrganizationUserModel.create(
        {
          organization_id: orgId,
          user_id: googleAccount.user_id,
          role: "admin",
        },
        trx
      );
    } else {
      // Update existing organization name/domain
      await OrganizationModel.updateById(
        orgId,
        {
          name: profileData.practiceName,
          domain: profileData.domainName,
        },
        trx
      );
    }

    // Update google account with profile fields and mark onboarding complete
    await GoogleConnectionModel.updateById(
      googleAccountId,
      {
        first_name: profileData.firstName,
        last_name: profileData.lastName,
        phone: profileData.phone,
        practice_name: profileData.practiceName,
        operational_jurisdiction: profileData.operationalJurisdiction,
        domain_name: profileData.domainName,
        organization_id: orgId,
        onboarding_completed: true,
      },
      trx
    );
  });

  console.log(
    `[Onboarding] Completed onboarding for account ${googleAccountId}`
  );

  return {
    profile: {
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      phone: profileData.phone,
      practiceName: profileData.practiceName,
      operationalJurisdiction: profileData.operationalJurisdiction,
      domainName: profileData.domainName,
    },
  };
}
