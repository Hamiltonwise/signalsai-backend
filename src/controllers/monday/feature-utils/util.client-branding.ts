import { domainMappings } from "../../../utils/core/domainMappings";

/**
 * Get client display name from domain using domainMappings lookup.
 */
export function getClientDisplayName(domain: string): string {
  const mapping = domainMappings.find(
    (mapping) => mapping.domain.toLowerCase() === domain.toLowerCase()
  );
  return mapping?.displayName || domain;
}

/**
 * Format comment with client branding prefix.
 */
export function formatClientComment(
  clientDisplayName: string,
  comment: string
): string {
  return `\u{1F3E2} **${clientDisplayName}**\n${comment}`;
}
