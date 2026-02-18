import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
import { UserModel } from "../../../models/UserModel";

export async function getUserProfileWithRole(
  googleAccountId: number,
  userRole: string | undefined
) {
  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount) {
    const error = new Error("Account not found") as any;
    error.statusCode = 404;
    error.body = { error: "Account not found" };
    throw error;
  }

  const user = await UserModel.findById(googleAccount.user_id);

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
    organizationId: googleAccount.organization_id,
  };
}
