/**
 * Organization Enrichment Service
 *
 * Enriches a list of organizations with user counts and connection status.
 * Orchestrates calls to OrganizationUserModel and GoogleConnectionModel.
 */

import { IOrganization } from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import * as ConnectionDetectionService from "./ConnectionDetectionService";
import type { ConnectionStatus } from "./ConnectionDetectionService";

export interface EnrichedOrganization extends IOrganization {
  userCount: number;
  connections: ConnectionStatus;
}

/**
 * Enrich a list of organizations with user counts and connection status.
 * Preserves the exact enrichment logic from the original GET / handler.
 */
export async function enrichWithMetadata(
  orgs: IOrganization[]
): Promise<EnrichedOrganization[]> {
  return Promise.all(
    orgs.map(async (org) => {
      const userCount = await OrganizationUserModel.countByOrg(org.id);

      const linkedAccounts = await GoogleConnectionModel.findByOrganization(
        org.id
      );

      const connections =
        ConnectionDetectionService.detectConnections(linkedAccounts);

      return {
        ...org,
        userCount,
        connections,
      };
    })
  );
}
