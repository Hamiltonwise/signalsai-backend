/**
 * GSC Sites Service
 * Handles site listing and URL extraction from Google Search Console.
 */

import {
  createSearchConsoleClient,
  fetchSitesList,
} from "./service.search-console-api";

/**
 * Fetches all sites with their permission levels.
 *
 * @param oauth2Client - Authenticated OAuth2 client
 * @returns Array of site objects with siteUrl and permissionLevel
 */
export const getSitesWithPermissions = async (oauth2Client: any) => {
  const searchconsole = createSearchConsoleClient(oauth2Client);
  const data = await fetchSitesList(searchconsole);

  return (data.siteEntry || []).map((s: any) => ({
    siteUrl: s.siteUrl,
    permissionLevel: s.permissionLevel,
  }));
};

/**
 * Fetches all available site URLs as a flat string array.
 *
 * @param oauth2Client - Authenticated OAuth2 client
 * @returns Array of site URL strings (null/undefined filtered out)
 */
export const getSiteUrls = async (oauth2Client: any) => {
  const searchconsole = createSearchConsoleClient(oauth2Client);
  const data = await fetchSitesList(searchconsole);

  return (data.siteEntry || []).map((s: any) => s.siteUrl).filter(Boolean);
};
