import { OrganizationUserModel } from "../../../models/OrganizationUserModel";

export async function getUserProfileWithRole(
  organizationId: number,
  userRole: string | undefined
) {
  // Find user via organization_users (user_id was dropped from google_connections)
  const users = await OrganizationUserModel.listUsersForOrg(organizationId);
  const user = users[0];

  if (!user) {
    const error = new Error("Account not found") as any;
    error.statusCode = 404;
    error.body = { error: "Account not found" };
    throw error;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: userRole,
    organizationId,
  };
}
