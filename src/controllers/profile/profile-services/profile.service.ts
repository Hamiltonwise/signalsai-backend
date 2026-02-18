import {
  GoogleAccountModel,
  IGoogleAccount,
} from "../../../models/GoogleAccountModel";

export interface ProfileFields {
  phone: string | null;
  operational_jurisdiction: string | null;
}

function extractProfileFields(
  account: IGoogleAccount | undefined
): ProfileFields | null {
  if (!account) {
    return null;
  }
  return {
    phone: account.phone || null,
    operational_jurisdiction: account.operational_jurisdiction || null,
  };
}

export async function getProfileData(
  googleAccountId: number
): Promise<ProfileFields> {
  const account = await GoogleAccountModel.findById(googleAccountId);

  if (!account) {
    const error = new Error("Account not found");
    (error as any).statusCode = 404;
    throw error;
  }

  return extractProfileFields(account)!;
}

export async function updateProfileData(
  googleAccountId: number,
  updates: { phone?: string; operational_jurisdiction?: string }
): Promise<ProfileFields> {
  const updated = await GoogleAccountModel.updateById(
    googleAccountId,
    updates
  );

  if (!updated) {
    const error = new Error("Account not found");
    (error as any).statusCode = 404;
    throw error;
  }

  const account = await GoogleAccountModel.findById(googleAccountId);

  return extractProfileFields(account)!;
}
