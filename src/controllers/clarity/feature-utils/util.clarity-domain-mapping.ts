/**
 * Domain mapping lookup utilities for Clarity.
 */
import { domainMappings, type DomainMapping } from "../../../utils/core/domainMappings";

/**
 * Find a domain mapping by clientId.
 * Searches both `domain` and `gsc_domainkey` fields.
 */
export const findMappingByClientId = (
  clientId: string
): DomainMapping | undefined => {
  return domainMappings.find(
    (m) => m.domain === clientId || m.gsc_domainkey === clientId
  );
};
