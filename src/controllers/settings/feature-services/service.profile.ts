import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { UserModel } from "../../../models/UserModel";

export async function getUserProfileWithRole(
  organizationId: number,
  userRole: string | undefined
) {
  const googleConnection = await GoogleConnectionModel.findOneByOrganization(organizationId);

  if (!googleConnection) {
    const error = new Error("Account not found") as any;
    error.statusCode = 404;
    error.body = { error: "Account not found" };
    throw error;
  }

  const user = await UserModel.findById(googleConnection.user_id);

  if (!user) {
    const error = new Error("User not found") as any;
    error.statusCode = 404;
    error.body = { error: "User not found" };
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
