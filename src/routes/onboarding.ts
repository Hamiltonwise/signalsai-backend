import express, { Response } from "express";
import { google } from "googleapis";
import axios from "axios";
import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import {
  tokenRefreshMiddleware,
  AuthenticatedRequest,
} from "../middleware/tokenRefresh";
import { db } from "../database/connection";

const onboardingRoutes = express.Router();

// Do NOT apply token middleware globally; only to routes that need Google APIs.

// Helper to parse google account id from header when middleware isn't used
const getAccountIdFromHeader = (req: express.Request): number | null => {
  const header = req.headers["x-google-account-id"]; 
  if (!header) return null;
  const id = parseInt(header as string, 10);
  return isNaN(id) ? null : id;
};

/**
 * Error handler
 */
const handleError = (res: Response, error: any, operation: string) => {
  console.error(`[Onboarding] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
};

/**
 * Helper to build auth headers for REST API calls
 */
const buildAuthHeaders = async (auth: any): Promise<Record<string, string>> => {
  const tokenResp = await auth.getAccessToken();
  const token =
    typeof tokenResp === "string" ? tokenResp : tokenResp?.token ?? "";
  return { Authorization: `Bearer ${token}` };
};

/**
 * GET /api/onboarding/status
 *
 * Check if user has completed onboarding
 */
onboardingRoutes.get("/status", async (req: AuthenticatedRequest, res) => {
  try {
    const googleAccountId = req.googleAccountId ?? getAccountIdFromHeader(req);

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        timestamp: new Date().toISOString(),
      });
    }

    const googleAccount = await db("google_accounts")
      .where({ id: googleAccountId })
      .first();

    if (!googleAccount) {
      return res.status(404).json({
        success: false,
        error: "Google account not found",
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      onboardingCompleted: !!googleAccount.onboarding_completed,
      hasPropertyIds: !!googleAccount.google_property_ids,
      propertyIds: googleAccount.google_property_ids || null,
      profile: {
        firstName: googleAccount.first_name || null,
        lastName: googleAccount.last_name || null,
        practiceName: googleAccount.practice_name || null,
        domainName: googleAccount.domain_name || null,
      },
    });
  } catch (error) {
    return handleError(res, error, "Check onboarding status");
  }
});

/**
 * GET /api/onboarding/available-properties
 *
 * Fetch all available GA4 properties, GSC sites, and GBP locations
 * that the user has access to
 */
onboardingRoutes.get(
  "/available-properties",
  tokenRefreshMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.oauth2Client) {
        return res.status(401).json({
          success: false,
          error: "OAuth client not initialized",
          timestamp: new Date().toISOString(),
        });
      }

      const auth = req.oauth2Client;
      const availableProperties: any = {
        ga4: [],
        gsc: [],
        gbp: [],
      };

      // Fetch GA4 properties
      try {
        console.log("[Onboarding] Fetching GA4 properties");
        const analyticsAdmin = google.analyticsadmin({
          version: "v1beta",
          auth,
        });
        const accountsResponse = await analyticsAdmin.accounts.list();

        if (accountsResponse.data.accounts) {
          for (const account of accountsResponse.data.accounts) {
            if (account.name) {
              try {
                const propertiesResponse = await analyticsAdmin.properties.list(
                  {
                    filter: `parent:${account.name}`,
                  }
                );

                if (propertiesResponse.data.properties) {
                  for (const prop of propertiesResponse.data.properties) {
                    if (prop.name && prop.displayName) {
                      availableProperties.ga4.push({
                        propertyId: prop.name,
                        displayName: prop.displayName,
                        accountName: account.displayName || account.name,
                      });
                    }
                  }
                }
              } catch (propError) {
                console.warn(
                  `[Onboarding] Failed to fetch properties for account ${account.name}`
                );
              }
            }
          }
        }
        console.log(
          `[Onboarding] Found ${availableProperties.ga4.length} GA4 properties`
        );
      } catch (ga4Error: any) {
        console.error("[Onboarding] GA4 fetch error:", ga4Error?.message);
        // Continue with other services even if GA4 fails
      }

      // Fetch GSC sites
      try {
        console.log("[Onboarding] Fetching GSC sites");
        const searchConsole = google.searchconsole({ version: "v1", auth });
        const sitesResponse = await searchConsole.sites.list({});

        if (sitesResponse.data.siteEntry) {
          availableProperties.gsc = sitesResponse.data.siteEntry
            .filter((site) => site.siteUrl)
            .map((site) => ({
              siteUrl: site.siteUrl!,
              displayName: site
                .siteUrl!.replace("sc-domain:", "")
                .replace("https://", "")
                .replace("http://", ""),
              permissionLevel: site.permissionLevel || "unknown",
            }));
        }
        console.log(
          `[Onboarding] Found ${availableProperties.gsc.length} GSC sites`
        );
      } catch (gscError: any) {
        console.error("[Onboarding] GSC fetch error:", gscError?.message);
        // Continue with other services even if GSC fails
      }

      // Fetch GBP locations
      try {
        console.log("[Onboarding] Fetching GBP locations");
        const acctMgmt =
          new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({
            auth,
          });
        const bizInfo =
          new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
            auth,
          });

        const accountsResponse = await acctMgmt.accounts.list({});

        if (accountsResponse.data.accounts) {
          for (const account of accountsResponse.data.accounts) {
            if (account.name) {
              try {
                // Extract accountId from account.name format: accounts/{accountId}
                const accountParts = account.name.split("/");
                const accountId = accountParts[1];

                if (!accountId) {
                  console.warn(
                    `[Onboarding] Skipping account with invalid name format: ${account.name}`
                  );
                  continue;
                }

                let pageToken: string | undefined;
                do {
                  const locationsResponse =
                    await bizInfo.accounts.locations.list({
                      parent: account.name,
                      readMask: "name,title,storeCode",
                      pageSize: 100,
                      pageToken,
                    });

                  if (locationsResponse.data.locations) {
                    for (const location of locationsResponse.data.locations) {
                      if (location.name) {
                        // Location name can be in two formats:
                        // 1. Full: accounts/{accountId}/locations/{locationId}
                        // 2. Short: locations/{locationId}
                        const nameParts = location.name.split("/");
                        let locationId: string;

                        if (nameParts.length === 4) {
                          // Full format: accounts/{accountId}/locations/{locationId}
                          locationId = nameParts[3];
                        } else if (nameParts.length === 2) {
                          // Short format: locations/{locationId}
                          locationId = nameParts[1];
                        } else {
                          console.warn(
                            `[Onboarding] Skipping location with unexpected name format: ${location.name}`
                          );
                          continue;
                        }

                        if (!locationId) {
                          console.warn(
                            `[Onboarding] Skipping location with missing locationId: ${location.name}`
                          );
                          continue;
                        }

                        availableProperties.gbp.push({
                          accountId,
                          locationId,
                          displayName: (location as any).title || location.name,
                          storeCode: (location as any).storeCode || null,
                          fullName: location.name,
                        });

                        console.log(
                          `[Onboarding] Added GBP location: ${location.name} -> accountId=${accountId}, locationId=${locationId}`
                        );
                      }
                    }
                  }

                  pageToken = locationsResponse.data.nextPageToken || undefined;
                } while (pageToken);
              } catch (locError) {
                console.warn(
                  `[Onboarding] Failed to fetch locations for account ${account.name}:`,
                  locError
                );
              }
            }
          }
        }
        console.log(
          `[Onboarding] Found ${availableProperties.gbp.length} GBP locations`
        );
      } catch (gbpError: any) {
        console.error("[Onboarding] GBP fetch error:", gbpError?.message);
        // Continue even if GBP fails
      }

      return res.json({
        success: true,
        properties: availableProperties,
        message: "Successfully fetched available properties",
      });
    } catch (error) {
      return handleError(res, error, "Fetch available properties");
    }
  }
);

/**
 * POST /api/onboarding/save-properties
 *
 * Save user's selected properties and profile information to database
 *
 * Request body:
 * {
 *   profile: {
 *     firstName: string,
 *     lastName: string,
 *     practiceName: string,
 *     domainName: string
 *   },
 *   ga4: { propertyId: string, displayName: string } | null,
 *   gsc: { siteUrl: string, displayName: string } | null,
 *   gbp: [{ accountId: string, locationId: string, displayName: string }] | []
 * }
 */
onboardingRoutes.post(
  "/save-properties",
  async (req: AuthenticatedRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId ?? getAccountIdFromHeader(req);

      if (!googleAccountId) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
          timestamp: new Date().toISOString(),
        });
      }

      const { profile, ga4, gsc, gbp } = req.body;

      // Validate profile data
      if (
        !profile ||
        !profile.firstName ||
        !profile.lastName ||
        !profile.practiceName ||
        !profile.domainName
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Profile information is required (firstName, lastName, practiceName, domainName)",
          timestamp: new Date().toISOString(),
        });
      }

      // Validate input structure
      if (ga4 && (!ga4.propertyId || !ga4.displayName)) {
        return res.status(400).json({
          success: false,
          error: "Invalid GA4 property data",
          timestamp: new Date().toISOString(),
        });
      }

      if (gsc && (!gsc.siteUrl || !gsc.displayName)) {
        return res.status(400).json({
          success: false,
          error: "Invalid GSC site data",
          timestamp: new Date().toISOString(),
        });
      }

      if (gbp && !Array.isArray(gbp)) {
        return res.status(400).json({
          success: false,
          error: "GBP locations must be an array",
          timestamp: new Date().toISOString(),
        });
      }

      // Validate GBP locations
      if (gbp && gbp.length > 0) {
        for (let i = 0; i < gbp.length; i++) {
          const location = gbp[i];
          const missingFields = [];

          if (!location.accountId) missingFields.push("accountId");
          if (!location.locationId) missingFields.push("locationId");
          if (!location.displayName) missingFields.push("displayName");

          if (missingFields.length > 0) {
            console.error(`[Onboarding] Invalid GBP location at index ${i}:`, {
              location,
              missingFields,
              receivedPayload: req.body,
            });

            return res.status(400).json({
              success: false,
              error: `Invalid GBP location data at index ${i}`,
              details: {
                missingFields,
                receivedLocation: location,
                expectedFields: ["accountId", "locationId", "displayName"],
              },
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // Build property IDs JSON
      const propertyIds: any = {};

      if (ga4) {
        propertyIds.ga4 = {
          propertyId: ga4.propertyId,
          displayName: ga4.displayName,
        };
      }

      if (gsc) {
        propertyIds.gsc = {
          siteUrl: gsc.siteUrl,
          displayName: gsc.displayName,
        };
      }

      if (gbp && gbp.length > 0) {
        propertyIds.gbp = gbp.map((location: any) => ({
          accountId: location.accountId,
          locationId: location.locationId,
          displayName: location.displayName,
        }));
      } else {
        propertyIds.gbp = [];
      }

      // Update database with profile and properties
      await db("google_accounts")
        .where({ id: googleAccountId })
        .update({
          first_name: profile.firstName,
          last_name: profile.lastName,
          practice_name: profile.practiceName,
          domain_name: profile.domainName,
          google_property_ids: JSON.stringify(propertyIds),
          onboarding_completed: true,
          updated_at: new Date(),
        });

      console.log(
        `[Onboarding] Saved properties for account ${googleAccountId}`
      );
      console.log(
        `[Onboarding] Properties:`,
        JSON.stringify(propertyIds, null, 2)
      );

      return res.json({
        success: true,
        message: "Onboarding completed successfully",
        profile: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          practiceName: profile.practiceName,
          domainName: profile.domainName,
        },
        propertyIds,
      });
    } catch (error) {
      return handleError(res, error, "Save properties");
    }
  }
);

export default onboardingRoutes;
