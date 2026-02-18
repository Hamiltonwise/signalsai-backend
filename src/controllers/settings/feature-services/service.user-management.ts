import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { InvitationModel } from "../../../models/InvitationModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { sendInvitation } from "../../../utils/core/mail";
import {
  generateInvitationToken,
  calculateTokenExpiry,
} from "../feature-utils/util.invitation-token";

export async function listOrganizationUsers(googleAccountId: number) {
  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount || !googleAccount.organization_id) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  const orgId = googleAccount.organization_id;

  const users = await OrganizationUserModel.listUsersForOrg(orgId);
  const invitations = await InvitationModel.listPendingByOrgWithSelect(orgId);

  return { users, invitations };
}

export async function inviteUserToOrganization(
  googleAccountId: number,
  email: string,
  role: string | undefined,
  inviterRole: string | undefined
) {
  if (!email) {
    const error = new Error("Email is required") as any;
    error.statusCode = 400;
    error.body = { error: "Email is required" };
    throw error;
  }

  // Managers can only invite managers and viewers, not admins
  if (inviterRole === "manager" && role === "admin") {
    const error = new Error("Managers cannot invite admins") as any;
    error.statusCode = 403;
    error.body = { error: "Managers cannot invite admins" };
    throw error;
  }

  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount || !googleAccount.organization_id) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  const orgId = googleAccount.organization_id;

  // Check if user is already in the organization
  const existingMember = await OrganizationUserModel.findByOrgAndEmail(
    orgId,
    email
  );

  if (existingMember) {
    const error = new Error(
      "User is already a member of this organization"
    ) as any;
    error.statusCode = 400;
    error.body = { error: "User is already a member of this organization" };
    throw error;
  }

  // Check if invitation already exists
  const existingInvite = await InvitationModel.findPendingByOrgAndEmail(
    orgId,
    email
  );

  if (existingInvite) {
    const error = new Error("Invitation already sent to this email") as any;
    error.statusCode = 400;
    error.body = { error: "Invitation already sent to this email" };
    throw error;
  }

  // Create invitation
  const token = generateInvitationToken();
  const expiresAt = calculateTokenExpiry(7);

  await InvitationModel.create({
    email: email.toLowerCase(),
    organization_id: orgId,
    role: role || "viewer",
    token,
    expires_at: expiresAt,
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Get organization name for email
  const organization = await OrganizationModel.findById(orgId);
  const organizationName = organization?.name || "the organization";

  // Send invitation email
  const emailSent = await sendInvitation(
    email.toLowerCase(),
    organizationName,
    role || "viewer"
  );

  if (!emailSent) {
    console.warn(`[Settings] Failed to send invitation email to ${email}`);
  } else {
    console.log(`[Settings] Invitation email sent to ${email}`);
  }

  return { message: `Invitation sent to ${email}` };
}

export async function removeUserFromOrganization(
  googleAccountId: number,
  userIdToRemove: number,
  requesterId: number
) {
  if (isNaN(userIdToRemove)) {
    const error = new Error("Invalid user ID") as any;
    error.statusCode = 400;
    error.body = { error: "Invalid user ID" };
    throw error;
  }

  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount || !googleAccount.organization_id) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  const orgId = googleAccount.organization_id;
  const userId = googleAccount.user_id;

  // Check requester's role
  const requester = await OrganizationUserModel.findByUserAndOrg(
    userId,
    orgId
  );

  if (!requester || requester.role !== "admin") {
    const error = new Error("Only admins can remove users") as any;
    error.statusCode = 403;
    error.body = { error: "Only admins can remove users" };
    throw error;
  }

  // Prevent removing yourself
  if (userId === userIdToRemove) {
    const error = new Error("You cannot remove yourself") as any;
    error.statusCode = 400;
    error.body = { error: "You cannot remove yourself" };
    throw error;
  }

  // Remove user
  await OrganizationUserModel.deleteByUserAndOrg(userIdToRemove, orgId);

  return { message: "User removed from organization" };
}

export async function updateUserRole(
  googleAccountId: number,
  userIdToUpdate: number,
  newRole: string,
  requesterId: number | undefined
) {
  if (isNaN(userIdToUpdate)) {
    const error = new Error("Invalid user ID") as any;
    error.statusCode = 400;
    error.body = { error: "Invalid user ID" };
    throw error;
  }

  if (!["admin", "manager", "viewer"].includes(newRole)) {
    const error = new Error("Invalid role") as any;
    error.statusCode = 400;
    error.body = { error: "Invalid role" };
    throw error;
  }

  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount || !googleAccount.organization_id) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  const orgId = googleAccount.organization_id;

  // Prevent changing own role
  if (requesterId === userIdToUpdate) {
    const error = new Error("You cannot change your own role") as any;
    error.statusCode = 400;
    error.body = { error: "You cannot change your own role" };
    throw error;
  }

  // Update role
  const updated = await OrganizationUserModel.updateRole(
    userIdToUpdate,
    orgId,
    newRole
  );

  if (!updated) {
    const error = new Error("User not found in organization") as any;
    error.statusCode = 404;
    error.body = { error: "User not found in organization" };
    throw error;
  }

  return {
    message: `Role updated to ${newRole}. User will need to log in again.`,
  };
}
