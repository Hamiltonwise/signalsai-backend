import { Knex } from "knex";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";

export interface BootstrapResult {
  organizationId: number;
}

/**
 * Bootstrap an organization for a password-only user who has no org yet.
 *
 * Creates an organization row and links the user as admin,
 * all within the provided transaction.
 *
 * Checks for an existing link first to prevent duplicates on retry.
 */
export async function bootstrapOrganization(
  userId: number,
  practiceName: string,
  domain: string | undefined,
  trx: Knex.Transaction
): Promise<BootstrapResult> {
  // Guard: check if the user already has an org (retry safety)
  const existing = await OrganizationUserModel.findByUserId(userId, trx);
  if (existing) {
    return { organizationId: existing.organization_id };
  }

  const newOrg = await OrganizationModel.create(
    {
      name: practiceName || `User ${userId}'s Organization`,
      domain: domain,
    },
    trx
  );

  await OrganizationUserModel.create(
    {
      organization_id: newOrg.id,
      user_id: userId,
      role: "admin",
    },
    trx
  );

  return { organizationId: newOrg.id };
}
