/**
 * Connection Detection Service
 *
 * Analyzes google_connections to determine which platform connections
 * (GBP) an organization has active.
 */

import { IGoogleConnection } from "../../../models/GoogleConnectionModel";
import * as propertyIdsParser from "../feature-utils/propertyIdsParser";
import type { ParsedProperties } from "../feature-utils/propertyIdsParser";

export interface ConnectionStatus {
  gbp: boolean;
}

export interface ConnectionDetail {
  accountId: number;
  email: string;
  properties: ParsedProperties;
}

/**
 * Detect which connections exist across an array of google accounts.
 * Returns boolean flags for gbp.
 * Preserves the exact detection logic from the original GET / handler.
 */
export function detectConnections(
  accounts: Pick<IGoogleConnection, "google_property_ids">[]
): ConnectionStatus {
  let hasGbp = false;

  for (const acc of accounts) {
    const props = propertyIdsParser.parse(
      acc.google_property_ids as string | Record<string, unknown> | null
    );
    if (
      props?.gbp &&
      Array.isArray(props.gbp) &&
      props.gbp.length > 0
    ) {
      hasGbp = true;
    }
  }

  return { gbp: hasGbp };
}

/**
 * Format connection details for a detail view.
 * Preserves the exact format from the original GET /:id handler.
 */
export function formatConnectionDetails(
  accounts: Pick<IGoogleConnection, "id" | "email" | "google_property_ids">[]
): ConnectionDetail[] {
  return accounts.map((acc) => {
    const props = propertyIdsParser.parse(
      acc.google_property_ids as string | Record<string, unknown> | null
    );
    return {
      accountId: acc.id,
      email: acc.email,
      properties: props,
    };
  });
}
