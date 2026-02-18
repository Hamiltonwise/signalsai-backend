/**
 * Connection Detection Service
 *
 * Analyzes google_accounts to determine which platform connections
 * (GA4, GSC, GBP) an organization has active.
 */

import { IGoogleAccount } from "../../../models/GoogleAccountModel";
import * as propertyIdsParser from "../feature-utils/propertyIdsParser";
import type { ParsedProperties } from "../feature-utils/propertyIdsParser";

export interface ConnectionStatus {
  ga4: boolean;
  gsc: boolean;
  gbp: boolean;
}

export interface ConnectionDetail {
  accountId: number;
  email: string;
  properties: ParsedProperties;
}

/**
 * Detect which connections exist across an array of google accounts.
 * Returns boolean flags for ga4, gsc, gbp.
 * Preserves the exact detection logic from the original GET / handler.
 */
export function detectConnections(
  accounts: Pick<IGoogleAccount, "google_property_ids">[]
): ConnectionStatus {
  let hasGa4 = false;
  let hasGsc = false;
  let hasGbp = false;

  for (const acc of accounts) {
    const props = propertyIdsParser.parse(
      acc.google_property_ids as string | Record<string, unknown> | null
    );
    if (props?.ga4) hasGa4 = true;
    if (props?.gsc) hasGsc = true;
    if (
      props?.gbp &&
      Array.isArray(props.gbp) &&
      props.gbp.length > 0
    ) {
      hasGbp = true;
    }
  }

  return { ga4: hasGa4, gsc: hasGsc, gbp: hasGbp };
}

/**
 * Format connection details for a detail view.
 * Preserves the exact format from the original GET /:id handler.
 */
export function formatConnectionDetails(
  accounts: Pick<IGoogleAccount, "id" | "email" | "google_property_ids">[]
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
