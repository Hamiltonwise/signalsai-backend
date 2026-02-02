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
        phone: googleAccount.phone || null,
        practiceName: googleAccount.practice_name || null,
        operationalJurisdiction: googleAccount.operational_jurisdiction || null,
        domainName: googleAccount.domain_name || null,
        email: googleAccount.email || null,
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
 *     phone: string,
 *     practiceName: string,
 *     operationalJurisdiction: string,
 *     domainName: string
 *   }
 * }
 */
onboardingRoutes.post(
  "/save-properties",
  async (req: AuthenticatedRequest, res) => {
    try {
      const googleAccountId =
        req.googleAccountId ?? getAccountIdFromHeader(req);

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
        !profile.phone ||
        !profile.practiceName ||
        !profile.operationalJurisdiction ||
        !profile.domainName
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Profile information is required (firstName, lastName, phone, practiceName, operationalJurisdiction, domainName)",
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
              name:
                profile.practiceName || `${profile.firstName}'s Organization`,
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
          await trx("organizations").where({ id: orgId }).update({
            name: profile.practiceName,
            domain: profile.domainName,
            updated_at: new Date(),
          });
        }

        // Update google account
        await trx("google_accounts").where({ id: googleAccountId }).update({
          first_name: profile.firstName,
          last_name: profile.lastName,
          phone: profile.phone,
          practice_name: profile.practiceName,
          operational_jurisdiction: profile.operationalJurisdiction,
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
          phone: profile.phone,
          practiceName: profile.practiceName,
          operationalJurisdiction: profile.operationalJurisdiction,
          domainName: profile.domainName,
        },
      });
    } catch (error) {
      return handleError(res, error, "Save properties");
    }
  }
);

/**
 * GET /api/onboarding/wizard/status
 *
 * Check if user has completed the product tour wizard
 */
onboardingRoutes.get("/wizard/status", async (req: AuthenticatedRequest, res) => {
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
      onboarding_wizard_completed: !!googleAccount.onboarding_wizard_completed,
    });
  } catch (error) {
    return handleError(res, error, "Check wizard status");
  }
});

/**
 * PUT /api/onboarding/wizard/complete
 *
 * Mark the product tour wizard as completed
 */
onboardingRoutes.put(
  "/wizard/complete",
  async (req: AuthenticatedRequest, res) => {
    try {
      const googleAccountId =
        req.googleAccountId ?? getAccountIdFromHeader(req);

      if (!googleAccountId) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
          timestamp: new Date().toISOString(),
        });
      }

      await db("google_accounts")
        .where({ id: googleAccountId })
        .update({
          onboarding_wizard_completed: true,
          updated_at: new Date(),
        });

      return res.json({
        success: true,
        onboarding_wizard_completed: true,
      });
    } catch (error) {
      return handleError(res, error, "Complete wizard");
    }
  }
);

/**
 * POST /api/onboarding/wizard/restart
 *
 * Reset the product tour wizard completion flag
 */
onboardingRoutes.post(
  "/wizard/restart",
  async (req: AuthenticatedRequest, res) => {
    try {
      const googleAccountId =
        req.googleAccountId ?? getAccountIdFromHeader(req);

      if (!googleAccountId) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
          timestamp: new Date().toISOString(),
        });
      }

      await db("google_accounts")
        .where({ id: googleAccountId })
        .update({
          onboarding_wizard_completed: false,
          updated_at: new Date(),
        });

      return res.json({
        success: true,
        onboarding_wizard_completed: false,
      });
    } catch (error) {
      return handleError(res, error, "Restart wizard");
    }
  }
);

/**
 * GET /api/onboarding/setup-progress
 *
 * Get the setup progress wizard state
 */
onboardingRoutes.get(
  "/setup-progress",
  async (req: AuthenticatedRequest, res) => {
    try {
      const googleAccountId =
        req.googleAccountId ?? getAccountIdFromHeader(req);

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

      const defaultProgress = {
        step1_api_connected: false,
        step2_pms_uploaded: false,
        dismissed: false,
        completed: false,
      };

      let progress = defaultProgress;
      if (googleAccount.setup_progress) {
        try {
          const stored =
            typeof googleAccount.setup_progress === "string"
              ? JSON.parse(googleAccount.setup_progress)
              : googleAccount.setup_progress;
          progress = { ...defaultProgress, ...stored };
        } catch {
          // Use default if parse fails
        }
      }

      return res.json({
        success: true,
        progress,
      });
    } catch (error) {
      return handleError(res, error, "Get setup progress");
    }
  }
);

/**
 * PUT /api/onboarding/setup-progress
 *
 * Update the setup progress wizard state
 */
onboardingRoutes.put(
  "/setup-progress",
  async (req: AuthenticatedRequest, res) => {
    try {
      const googleAccountId =
        req.googleAccountId ?? getAccountIdFromHeader(req);

      if (!googleAccountId) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
          timestamp: new Date().toISOString(),
        });
      }

      const { progress } = req.body;

      if (!progress) {
        return res.status(400).json({
          success: false,
          error: "Progress object is required",
          timestamp: new Date().toISOString(),
        });
      }

      await db("google_accounts")
        .where({ id: googleAccountId })
        .update({
          setup_progress: JSON.stringify(progress),
          updated_at: new Date(),
        });

      return res.json({
        success: true,
        progress,
      });
    } catch (error) {
      return handleError(res, error, "Update setup progress");
    }
  }
);

export default onboardingRoutes;
