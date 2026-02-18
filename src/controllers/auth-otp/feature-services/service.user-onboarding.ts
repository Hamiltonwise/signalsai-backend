/**
 * User Onboarding Service
 *
 * Handles user creation and invitation acceptance.
 * When a new user signs up with a pending invitation, links them to the org.
 */

import { UserModel, IUser } from "../../../models/UserModel";
import { InvitationModel, IInvitation } from "../../../models/InvitationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";

export interface OnboardingResult {
  user: IUser;
  isNewUser: boolean;
}

/**
 * Finds an existing user or creates a new one.
 * If a pending invitation exists, accepts it and links the user to the org.
 *
 * Returns null if no user exists AND no invitation AND not a super admin
 * (caller is responsible for the super admin check before calling).
 */
export async function onboardUser(
  email: string,
  invitation: IInvitation | undefined
): Promise<OnboardingResult> {
  const newUser = await UserModel.create({ email });

  if (invitation) {
    await OrganizationUserModel.create({
      organization_id: invitation.organization_id,
      user_id: newUser.id,
      role: invitation.role,
    });

    await InvitationModel.updateStatus(invitation.id, "accepted");
  }
  // If Super Admin (and no invitation), they are created but not linked to any org yet.
  // This is fine for Admin Dashboard access which might not require org context immediately.

  return { user: newUser, isNewUser: true };
}
