/**
 * Domain mapping lookup utilities for Clarity.
 */
import { domainMappings, type DomainMapping } from "../../../utils/core/domainMappings";

/**
 * Find a domain mapping by clientId.
 * Searches by `domain` field.
 */
export const findMappingByClientId = (
  clientId: string
): DomainMapping | undefined => {
  return domainMappings.find(
    (m) => m.domain === clientId
  );
};
