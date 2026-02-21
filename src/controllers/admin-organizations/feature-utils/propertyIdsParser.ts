/**
 * Property IDs Parser
 *
 * Parses google_property_ids JSON from google_connections.
 * Handles both string and object inputs with error tolerance.
 */

export interface ParsedProperties {
  gbp?: unknown[];
  [key: string]: unknown;
}

/**
 * Parse google_property_ids from a google_account row.
 * Returns a typed object with gbp properties.
 * Returns empty object on malformed input.
 */
export function parse(
  propertyIds: string | Record<string, unknown> | null | undefined
): ParsedProperties {
  if (propertyIds === null || propertyIds === undefined) {
    return {};
  }

  if (typeof propertyIds === "string") {
    try {
      return JSON.parse(propertyIds) as ParsedProperties;
    } catch {
      return {};
    }
  }

  return propertyIds as ParsedProperties;
}
