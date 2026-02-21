import {
  GoogleConnectionModel,
  IGoogleConnection,
} from "../../../models/GoogleConnectionModel";

export interface ProfileFields {
  phone: string | null;
  operational_jurisdiction: string | null;
}

function extractProfileFields(
  account: IGoogleConnection | undefined
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
  organizationId: number
): Promise<ProfileFields> {
  const account = await GoogleConnectionModel.findOneByOrganization(organizationId);

  if (!account) {
    const error = new Error("Account not found");
    (error as any).statusCode = 404;
    throw error;
  }

  return extractProfileFields(account)!;
}

export async function updateProfileData(
  organizationId: number,
  updates: { phone?: string; operational_jurisdiction?: string }
): Promise<ProfileFields> {
  const account = await GoogleConnectionModel.findOneByOrganization(organizationId);

  if (!account) {
    const error = new Error("Account not found");
    (error as any).statusCode = 404;
    throw error;
  }

  await GoogleConnectionModel.updateById(account.id, updates);

  const updated = await GoogleConnectionModel.findById(account.id);

  return extractProfileFields(updated)!;
}
