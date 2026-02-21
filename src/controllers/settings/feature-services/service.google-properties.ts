import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import { OAuth2Client } from "google-auth-library";

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
  if (type === "gbp") {
    return fetchAvailableGBPProperties(oauth2Client);
  }

  const error = new Error("Invalid property type") as any;
  error.statusCode = 400;
  error.body = { error: "Invalid property type" };
  throw error;
}
