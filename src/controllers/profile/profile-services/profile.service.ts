import {
  OrganizationModel,
  IOrganization,
} from "../../../models/OrganizationModel";

export interface ProfileFields {
  operational_jurisdiction: string | null;
}

function extractProfileFields(
  org: IOrganization | undefined
): ProfileFields | null {
  if (!org) {
    return null;
  }
  return {
    operational_jurisdiction: org.operational_jurisdiction || null,
  };
}

export async function getProfileData(
  organizationId: number
): Promise<ProfileFields> {
  const org = await OrganizationModel.findById(organizationId);

  if (!org) {
    const error = new Error("Organization not found");
    (error as any).statusCode = 404;
    throw error;
  }

  return extractProfileFields(org)!;
}

export async function updateProfileData(
  organizationId: number,
  updates: { operational_jurisdiction?: string }
): Promise<ProfileFields> {
  const org = await OrganizationModel.findById(organizationId);

  if (!org) {
    const error = new Error("Organization not found");
    (error as any).statusCode = 404;
    throw error;
  }

  await OrganizationModel.updateById(organizationId, updates);

  const updated = await OrganizationModel.findById(organizationId);

  return extractProfileFields(updated)!;
}
