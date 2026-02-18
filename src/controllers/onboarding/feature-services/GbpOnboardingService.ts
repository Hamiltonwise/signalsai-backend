import { OAuth2Client } from "google-auth-library";
import { fetchAvailableGBPProperties } from "../../settings/feature-services/service.google-properties";
import { updateProperty } from "../../settings/feature-services/service.properties";
import { buildAuthHeaders } from "../../gbp/gbp-services/gbp-api.service";
import { extractDomainFromUrl } from "../../places/feature-utils/domainExtractor";
import axios from "axios";

export interface GBPLocationItem {
  accountId: string;
  locationId: string;
  displayName: string;
}

/**
 * Fetch available GBP locations for the authenticated user's Google account.
 * Delegates to the shared settings service function.
 */
export async function getAvailableGBPLocations(
  oauth2Client: OAuth2Client
): Promise<any[]> {
  return fetchAvailableGBPProperties(oauth2Client);
}

/**
 * Save selected GBP locations to google_property_ids.gbp.
 * Delegates to the shared settings service (same flow as settings page).
 */
export async function saveGBPSelection(
  googleAccountId: number,
  data: GBPLocationItem[]
): Promise<any> {
  return updateProperty(googleAccountId, "gbp", data, "connect");
}

/**
 * Fetch the websiteUri for a specific GBP location and return the clean domain.
 *
 * Uses the Business Information REST API to fetch the location profile
 * with websiteUri in the readMask.
 */
export async function getGBPLocationWebsite(
  oauth2Client: OAuth2Client,
  accountId: string,
  locationId: string
): Promise<{ websiteUri: string | null; domain: string }> {
  const name = `accounts/${accountId}/locations/${locationId}`;
  const headers = await buildAuthHeaders(oauth2Client);

  try {
    const { data } = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${name}`,
      {
        params: {
          readMask: "websiteUri",
        },
        headers,
      }
    );

    const websiteUri = data?.websiteUri || null;
    const domain = extractDomainFromUrl(websiteUri);

    console.log(
      `[GBP Onboarding] Fetched website for ${locationId}: ${websiteUri} → ${domain}`
    );

    return { websiteUri, domain };
  } catch (error: any) {
    console.warn(
      `[GBP Onboarding] Could not fetch website for location ${locationId}: ${error.message}`
    );
    return { websiteUri: null, domain: "" };
  }
}
