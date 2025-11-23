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
 * POST /api/onboarding/save-properties
 *
 * Save user's profile information to database and mark onboarding as complete
 *
 * Request body:
 * {
 *   profile: {
 *     firstName: string,
 *     lastName: string,
 *     practiceName: string,
 *     domainName: string
 *   }
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

      const { profile } = req.body;

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

      // Update database with profile info only
      // Also create organization if it doesn't exist (handled by migration for existing users, 
      // but new users need org creation here or in auth)
      // For this refactor, let's assume auth creates the user/account, and here we just update profile.
      // We should also ensure an organization exists.

      await db.transaction(async (trx) => {
        const googleAccount = await trx("google_accounts")
          .where({ id: googleAccountId })
          .first();

        if (!googleAccount) {
          throw new Error("Google account not found");
        }

        let orgId = googleAccount.organization_id;

        // If no organization exists (e.g. new user), create one
        if (!orgId) {
          const [newOrg] = await trx("organizations")
            .insert({
              name: profile.practiceName || `${profile.firstName}'s Organization`,
              domain: profile.domainName,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning("id");
          
          orgId = newOrg.id;

          // Link user to organization as admin
          await trx("organization_users").insert({
            organization_id: orgId,
            user_id: googleAccount.user_id,
            role: "admin",
            created_at: new Date(),
            updated_at: new Date(),
          });
        } else {
          // Update existing organization name/domain
          await trx("organizations")
            .where({ id: orgId })
            .update({
              name: profile.practiceName,
              domain: profile.domainName,
              updated_at: new Date(),
            });
        }

        // Update google account
        await trx("google_accounts")
          .where({ id: googleAccountId })
          .update({
            first_name: profile.firstName,
            last_name: profile.lastName,
            practice_name: profile.practiceName,
            domain_name: profile.domainName,
            organization_id: orgId,
            onboarding_completed: true,
            updated_at: new Date(),
          });
      });

      console.log(
        `[Onboarding] Completed onboarding for account ${googleAccountId}`
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
      });
    } catch (error) {
      return handleError(res, error, "Save properties");
    }
  }
);

export default onboardingRoutes;
