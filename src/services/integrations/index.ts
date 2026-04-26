/**
 * Adapter registry. v1 ships HubSpot only; future vendors register here
 * without touching the controller, processor, or any other call site.
 */

import type { CrmPlatform, ICrmAdapter } from "./types";
import { hubspotAdapter } from "./hubspotAdapter";

const REGISTRY: Record<CrmPlatform, ICrmAdapter> = {
  hubspot: hubspotAdapter,
};

export function getAdapter(platform: string): ICrmAdapter {
  const adapter = (REGISTRY as Record<string, ICrmAdapter | undefined>)[platform];
  if (!adapter) {
    throw new Error(`No CRM adapter registered for platform: ${platform}`);
  }
  return adapter;
}

export type { CrmPlatform, ICrmAdapter, VendorForm, VendorFormField, ValidateConnectionResult, PushResult, MappedFieldPayload, SubmitFormContext } from "./types";
