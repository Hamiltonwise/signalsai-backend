import { google } from "googleapis";
import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import { OAuth2Client } from "google-auth-library";

export async function fetchAvailableGA4Properties(
  oauth2Client: OAuth2Client
): Promise<any[]> {
  const analyticsAdmin = google.analyticsadmin({
    version: "v1beta",
    auth: oauth2Client,
  });

  const response = await analyticsAdmin.accountSummaries.list();
  const summaries = response.data.accountSummaries || [];

  const availableProperties: any[] = [];
  summaries.forEach((summary) => {
    if (summary.propertySummaries) {
      summary.propertySummaries.forEach((prop) => {
        availableProperties.push({
          id: prop.property,
          name: prop.displayName,
          account: summary.displayName,
        });
      });
    }
  });

  return availableProperties;
}

export async function fetchAvailableGSCProperties(
  oauth2Client: OAuth2Client
): Promise<any[]> {
  const searchConsole = google.searchconsole({
    version: "v1",
    auth: oauth2Client,
  });

  const response = await searchConsole.sites.list();
  const sites = response.data.siteEntry || [];

  return sites.map((site) => ({
    id: site.siteUrl,
    name: site.siteUrl,
    permissionLevel: site.permissionLevel,
  }));
}

export async function fetchAvailableGBPProperties(
  oauth2Client: OAuth2Client
): Promise<any[]> {
  const accountManagement =
    new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({
      auth: oauth2Client,
    });

  const businessInfo =
    new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
      auth: oauth2Client,
    });

  const accountsResp = await accountManagement.accounts.list();
  const accounts = accountsResp.data.accounts || [];

  const availableProperties: any[] = [];
  for (const account of accounts) {
    if (account.name) {
      const locationsResp = await businessInfo.accounts.locations.list({
        parent: account.name,
        readMask: "name,title,storeCode,metadata",
      });

      const locations = locationsResp.data.locations || [];
      locations.forEach((loc) => {
        availableProperties.push({
          id: loc.name,
          name: loc.title,
          accountId: account.name?.split("/")[1],
          locationId: loc.name?.split("/")[1],
          address: loc.storeCode,
        });
      });
    }
  }

  return availableProperties;
}

export async function getAvailablePropertiesByType(
  type: string,
  oauth2Client: OAuth2Client
): Promise<any[]> {
  if (type === "ga4") {
    return fetchAvailableGA4Properties(oauth2Client);
  } else if (type === "gsc") {
    return fetchAvailableGSCProperties(oauth2Client);
  } else if (type === "gbp") {
    return fetchAvailableGBPProperties(oauth2Client);
  }

  const error = new Error("Invalid property type") as any;
  error.statusCode = 400;
  error.body = { error: "Invalid property type" };
  throw error;
}
