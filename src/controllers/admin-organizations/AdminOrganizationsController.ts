/**
 * Admin Organizations Controller
 *
 * Handles HTTP request/response for admin organization endpoints.
 * Delegates business logic to services and data access to models.
 */

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { db } from "../../database/connection";
import bcrypt from "bcrypt";
import { OrganizationModel } from "../../models/OrganizationModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { UserModel } from "../../models/UserModel";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { LocationModel } from "../../models/LocationModel";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import * as OrganizationEnrichmentService from "./feature-services/OrganizationEnrichmentService";
import * as ConnectionDetectionService from "./feature-services/ConnectionDetectionService";
import * as BusinessDataService from "../locations/BusinessDataService";
import { getValidOAuth2ClientByOrg } from "../../auth/oauth2Helper";
import * as TierManagementService from "./feature-services/TierManagementService";
import * as AdminOrgCreationService from "./feature-services/AdminOrgCreationService";
import * as QuickCreateService from "./feature-services/QuickCreateService";
import * as hostnameGenerator from "./feature-utils/hostnameGenerator";
import { deleteOrganization } from "../settings/feature-services/service.delete-organization";
import { sendEmail } from "../../emails/emailService";
import { getStripe, isStripeConfigured } from "../../config/stripe";
import { v4 as uuid } from "uuid";

const BCRYPT_SALT_ROUNDS = 12;

// =====================================================================
// Error handler (preserves original handleError response shape)
// =====================================================================

function handleError(res: Response, error: any, operation: string): Response {
  console.error(`[Admin/Orgs] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
}

// =====================================================================
// Handlers
// =====================================================================

/**
 * GET /api/admin/organizations
 * Fetch all organizations with summary data
 */
export async function listAll(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const organizations = await OrganizationModel.listAll();

    const enrichedOrgs =
      await OrganizationEnrichmentService.enrichWithMetadata(organizations);

    return res.json({
      success: true,
      organizations: enrichedOrgs,
    });
  } catch (error) {
    return handleError(res, error, "Fetch all organizations");
  }
}

/**
 * GET /api/admin/organizations/:id
 * Fetch details for a specific organization (users, full connection details)
 */
export async function getById(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const organization = await OrganizationModel.findById(orgId);

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Fetch users - map to original response shape
    const rawUsers = await OrganizationUserModel.listByOrgWithUsers(orgId);
    const users = rawUsers.map((u) => ({
      id: u.user_id,
      name: u.name,
      email: u.email,
      role: u.role,
      joined_at: u.created_at,
      has_password: !!u.password_hash,
    }));

    // Fetch connection details
    const linkedAccounts = await GoogleConnectionModel.findByOrganization(orgId);
    const connections =
      ConnectionDetectionService.formatConnectionDetails(linkedAccounts);

    // Fetch linked website - project only the original fields
    const rawWebsite = await ProjectModel.findByOrganizationId(orgId);
    const website = rawWebsite
      ? {
          id: rawWebsite.id,
          generated_hostname: (rawWebsite as any).generated_hostname,
          status: rawWebsite.status,
          created_at: rawWebsite.created_at,
        }
      : null;

    return res.json({
      success: true,
      organization,
      users,
      connections,
      website,
    });
  } catch (error) {
    return handleError(res, error, "Fetch organization details");
  }
}

/**
 * PATCH /api/admin/organizations/:id
 * Update organization name
 */
export async function updateName(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    const { name } = req.body;

    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }

    const updated = await OrganizationModel.updateById(orgId, {
      name: name.trim(),
      updated_at: new Date(),
    });

    if (!updated) {
      return res.status(404).json({ error: "Organization not found" });
    }

    return res.json({
      success: true,
      message: "Organization updated successfully",
      organization: { id: orgId, name: name.trim() },
    });
  } catch (error) {
    return handleError(res, error, "Update organization");
  }
}

/**
 * DELETE /api/admin/organizations/:id
 * Permanently delete an organization and all related data.
 * Super-admin only. Requires { confirmDelete: true } in request body.
 */
export async function deleteOrg(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const confirmDelete = req.body?.confirmDelete === true || req.query?.confirmDelete === "true";
    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        error: "Confirmation required. Send { confirmDelete: true } to proceed.",
      });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    await deleteOrganization(orgId);

    return res.status(204).send();
  } catch (error) {
    return handleError(res, error, "Delete organization");
  }
}

/**
 * PATCH /api/admin/organizations/:id/tier
 * Update organization subscription tier
 */
export async function updateTier(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  const trx = await db.transaction();

  try {
    const orgId = parseInt(req.params.id);
    const { tier } = req.body;

    if (isNaN(orgId)) {
      await trx.rollback();
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!tier || !["DWY", "DFY"].includes(tier)) {
      await trx.rollback();
      return res
        .status(400)
        .json({ error: "Tier must be either DWY or DFY" });
    }

    const result = await TierManagementService.updateTier(orgId, tier, trx);

    if (!result.success) {
      await trx.rollback();
      return res.status(404).json({ error: "Organization not found" });
    }

    await trx.commit();

    return res.json({
      success: true,
      tier,
      message: result.message,
    });
  } catch (error) {
    await trx.rollback();
    return handleError(res, error, "Update organization tier");
  }
}

/**
 * PATCH /api/admin/organizations/:id/type
 * Set organization type (health or saas). Immutable once set.
 */
export async function updateOrganizationType(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    const { type } = req.body;

    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!type || !["health", "saas"].includes(type)) {
      return res
        .status(400)
        .json({ error: "Type must be either 'health' or 'saas'" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Immutable once set
    if (organization.organization_type) {
      return res.status(409).json({
        success: false,
        error: `Organization type is already set to "${organization.organization_type}" and cannot be changed.`,
      });
    }

    await OrganizationModel.updateById(orgId, {
      organization_type: type,
      updated_at: new Date(),
    } as any);

    return res.json({
      success: true,
      type,
      message: `Organization type set to "${type}".`,
    });
  } catch (error) {
    return handleError(res, error, "Update organization type");
  }
}

/**
 * GET /api/admin/organizations/:id/locations
 * Fetch all locations for an organization with their Google Properties
 */
export async function getOrgLocations(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Fetch all locations for this organization
    const locations = await LocationModel.findByOrganizationId(orgId);

    // Fetch google properties for each location in parallel
    const locationsWithProperties = await Promise.all(
      locations.map(async (location) => {
        const properties = await GooglePropertyModel.findByLocationId(location.id);
        return {
          ...location,
          googleProperties: properties,
        };
      })
    );

    return res.json({
      success: true,
      locations: locationsWithProperties,
      total: locationsWithProperties.length,
    });
  } catch (error) {
    return handleError(res, error, "Fetch organization locations");
  }
}

/**
 * POST /api/admin/organizations
 * Create a new organization with an initial admin user.
 * Super-admin only.
 */
export async function createOrganization(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const { organization, user, location } = req.body;

    if (!organization || !user || !location) {
      return res.status(400).json({
        success: false,
        error:
          "Request body must include 'organization', 'user', and 'location' objects.",
      });
    }

    const result =
      await AdminOrgCreationService.createOrganizationWithUser({
        organization,
        user,
        location,
      });

    return res.status(201).json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }
    return handleError(res, error, "Create organization");
  }
}

/**
 * PATCH /api/admin/organizations/:id/lockout
 * Lock out an organization (sets subscription_status to inactive).
 * Cannot lockout orgs with an active Stripe subscription.
 */
export async function lockoutOrganization(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Cannot lock out paying customers
    if (organization.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        error:
          "Cannot lock out an organization with an active Stripe subscription. Cancel their subscription first.",
      });
    }

    await OrganizationModel.updateById(orgId, {
      subscription_status: "inactive",
      updated_at: new Date(),
    } as any);

    return res.json({
      success: true,
      message: `Organization "${organization.name}" has been locked out.`,
    });
  } catch (error) {
    return handleError(res, error, "Lockout organization");
  }
}

/**
 * PATCH /api/admin/organizations/:id/unlock
 * Unlock an organization (sets subscription_status back to active).
 */
export async function unlockOrganization(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    await OrganizationModel.updateById(orgId, {
      subscription_status: "active",
      updated_at: new Date(),
    } as any);

    return res.json({
      success: true,
      message: `Organization "${organization.name}" has been unlocked.`,
    });
  } catch (error) {
    return handleError(res, error, "Unlock organization");
  }
}

/**
 * POST /api/admin/organizations/:id/remove-payment-method
 * Cancel the Stripe subscription and clear Stripe IDs from the organization.
 * Reverts the org to admin-granted state (active, DFY, no billing).
 * Super-admin only.
 */
export async function removePaymentMethod(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // If no Stripe info, nothing to remove
    if (!organization.stripe_customer_id && !organization.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        error: "This organization has no payment method to remove.",
      });
    }

    // Cancel the Stripe subscription if it exists
    if (organization.stripe_subscription_id && isStripeConfigured()) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(organization.stripe_subscription_id);
        console.log(
          `[Admin] Cancelled Stripe subscription ${organization.stripe_subscription_id} for org ${orgId}`
        );
      } catch (stripeErr: any) {
        // Best-effort — if it fails (already cancelled, etc.), log and continue
        console.warn(
          `[Admin] Failed to cancel Stripe subscription for org ${orgId}:`,
          stripeErr?.message || stripeErr
        );
      }
    }

    // Clear Stripe fields and revert to admin-granted state
    await OrganizationModel.updateById(orgId, {
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: "active",
      subscription_updated_at: new Date(),
      updated_at: new Date(),
    } as any);

    console.log(
      `[Admin] Payment method removed for org ${orgId} (${organization.name}). Reverted to admin-granted state.`
    );

    return res.json({
      success: true,
      message: `Payment method removed for "${organization.name}". Organization reverted to admin-granted state.`,
    });
  } catch (error) {
    return handleError(res, error, "Remove payment method");
  }
}

/**
 * POST /api/admin/organizations/:id/create-project
 * Create a website project for an organization.
 * Extracts project creation logic from TierManagementService.handleDfyUpgrade().
 * Only creates if no project already exists.
 */
export async function createProject(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Check if project already exists
    const existingProject = await ProjectModel.findByOrganizationId(orgId);
    if (existingProject) {
      return res.status(409).json({
        success: false,
        error: "This organization already has a website project.",
        project: {
          id: existingProject.id,
          generated_hostname: (existingProject as any).generated_hostname,
          status: existingProject.status,
        },
      });
    }

    // Generate hostname and create project (same logic as TierManagementService.handleDfyUpgrade)
    const hostname = hostnameGenerator.generate(organization.name);

    await ProjectModel.create({
      id: uuid(),
      organization_id: orgId,
      generated_hostname: hostname,
      status: "CREATED",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    console.log(
      `[Admin] Website project created for org ${orgId} (${organization.name}) — hostname: ${hostname}`
    );

    return res.status(201).json({
      success: true,
      message: `Website project created for "${organization.name}".`,
      project: {
        generated_hostname: hostname,
        status: "CREATED",
      },
    });
  } catch (error) {
    return handleError(res, error, "Create project for organization");
  }
}

// =====================================================================
// Admin Set Password
// =====================================================================

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;

  // Ensure at least 1 uppercase, 1 lowercase, 1 digit
  let password = "";
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];

  for (let i = 3; i < 12; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

/**
 * POST /api/admin/users/:userId/set-password
 * Admin sets a temporary password for a user
 */
export async function setUserPassword(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const { notifyUser } = req.body;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);

    await UserModel.updatePasswordHash(userId, passwordHash);

    // Ensure email is verified so user can log in
    if (!user.email_verified) {
      await UserModel.setEmailVerified(userId);
    }

    if (notifyUser) {
      const appUrl = process.env.NODE_ENV === "production"
        ? "https://app.getalloro.com"
        : "http://localhost:5173";

      const emailResult = await sendEmail({
        subject: "Your Alloro password has been set",
        body: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #1a1a1a;">Hello${user.name ? `, ${user.name}` : ""}!</h2>
            <p style="color: #4a5568; font-size: 16px;">
              Alloro has set a temporary password for your account. You can now sign in using your email and the password below.
            </p>
            <div style="background: #f7f7f7; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Your temporary password</p>
              <p style="font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 0; color: #1a1a1a; font-family: monospace;">${tempPassword}</p>
            </div>
            <p style="color: #4a5568; font-size: 16px;">
              We recommend changing your password as soon as possible. You can do this from your
              <a href="${appUrl}/settings" style="color: #F97316; text-decoration: underline;">Account Settings</a>.
            </p>
            <p style="color: #718096; font-size: 14px; margin-top: 24px;">
              If you have any questions, please contact our team.
            </p>
          </div>
        `,
        recipients: [user.email],
      });

      if (!emailResult.success) {
        console.error(`[Admin] Failed to send password notification to ${user.email}:`, emailResult.error);
      }
    }

    console.log(`[Admin] Temporary password set for user ${userId} (${user.email}) by admin ${req.user?.email}`);

    return res.json({
      success: true,
      temporaryPassword: tempPassword,
      message: notifyUser
        ? `Password set and notification sent to ${user.email}`
        : `Password set for ${user.email}`,
    });
  } catch (error) {
    return handleError(res, error, "Set user password");
  }
}

/**
 * GET /api/admin/organizations/:id/business-data
 * Get business data for an organization (org-level + all locations)
 */
export async function getBusinessData(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const data = await BusinessDataService.getOrgBusinessData(orgId);

    return res.json({ success: true, ...data });
  } catch (error) {
    return handleError(res, error, "Get business data");
  }
}

/**
 * POST /api/admin/organizations/:id/locations/:locationId/refresh-business-data
 * Refresh location business data from Google (admin-scoped)
 */
export async function refreshBusinessData(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    const locationId = parseInt(req.params.locationId);
    if (isNaN(orgId) || isNaN(locationId)) {
      return res.status(400).json({ error: "Invalid organization or location ID" });
    }

    const oauth2Client = await getValidOAuth2ClientByOrg(orgId);

    const businessData = await BusinessDataService.refreshLocationBusinessData(
      locationId,
      orgId,
      oauth2Client
    );

    return res.json({ success: true, business_data: businessData });
  } catch (error) {
    return handleError(res, error, "Refresh business data");
  }
}

/**
 * POST /api/admin/organizations/:id/sync-org-business-data
 * Copy primary location's business_data to the org-level record.
 */
export async function syncOrgBusinessData(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const locations = await LocationModel.findByOrganizationId(orgId);
    const primary = locations.find((l) => l.is_primary) || locations[0];

    if (!primary?.business_data) {
      return res.status(400).json({
        error: "Primary location has no business data. Refresh the location first.",
      });
    }

    const synced = await BusinessDataService.updateOrgBusinessData(
      orgId,
      primary.business_data as Record<string, unknown>,
    );

    return res.json({ success: true, business_data: synced });
  } catch (error) {
    return handleError(res, error, "Sync org business data");
  }
}

/**
 * POST /api/admin/organizations/quick-create
 * Create account from a Google Places placeId with full data hydration.
 */
export async function quickCreate(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const { placeId, email, accountType, firstName, lastName, skipTrialEmails, trialDays } = req.body;

    if (!placeId || !email) {
      return res.status(400).json({
        success: false,
        error: "placeId and email are required",
      });
    }

    const validTypes = ["prospect", "paying", "partner", "foundation", "case_study", "internal"];
    if (accountType && !validTypes.includes(accountType)) {
      return res.status(400).json({
        success: false,
        error: `accountType must be one of: ${validTypes.join(", ")}`,
      });
    }

    const result = await QuickCreateService.quickCreateFromPlace({
      placeId,
      email,
      accountType: accountType || "prospect",
      firstName,
      lastName,
      skipTrialEmails,
      trialDays,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error("[QuickCreate] Error:", error?.message || error, error?.stack);
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    return res.status(500).json({
      success: false,
      error: error?.message || "Quick create failed",
      detail: process.env.NODE_ENV !== "production" ? error?.stack : undefined,
    });
  }
}

/**
 * PATCH /api/admin/organizations/:id/billing-controls
 * Update billing/trial settings for an organization.
 */
export async function updateBillingControls(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ success: false, error: "Invalid organization ID" });
    }

    const org = await OrganizationModel.findById(orgId);
    if (!org) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const { accountType, trialEndAt, trialDays, subscriptionStatus, subscriptionTier } = req.body;

    const updates: Record<string, any> = {};

    // Account type
    if (accountType !== undefined) {
      const validTypes = ["prospect", "paying", "partner", "foundation", "case_study", "internal", null];
      if (!validTypes.includes(accountType)) {
        return res.status(400).json({ success: false, error: "Invalid account type" });
      }
      updates.account_type = accountType;
    }

    // Trial end date (explicit date)
    if (trialEndAt !== undefined) {
      if (trialEndAt === null) {
        updates.trial_end_at = null;
        updates.trial_status = null;
      } else {
        updates.trial_end_at = new Date(trialEndAt);
        updates.trial_status = new Date(trialEndAt) > new Date() ? "active" : "expired";
        if (!updates.trial_start_at && !org.trial_start_at) {
          updates.trial_start_at = new Date();
        }
      }
    }

    // Trial days (relative extension from now)
    if (trialDays !== undefined && trialDays > 0) {
      updates.trial_end_at = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      updates.trial_status = "active";
      if (!org.trial_start_at) {
        updates.trial_start_at = new Date();
      }
    }

    // Subscription status (active/inactive/trial/cancelled)
    if (subscriptionStatus !== undefined) {
      const validStatuses = ["active", "inactive", "trial", "cancelled"];
      if (!validStatuses.includes(subscriptionStatus)) {
        return res.status(400).json({ success: false, error: "Invalid subscription status" });
      }
      updates.subscription_status = subscriptionStatus;
    }

    // Subscription tier
    if (subscriptionTier !== undefined) {
      const validTiers = ["DWY", "DFY"];
      if (!validTiers.includes(subscriptionTier)) {
        return res.status(400).json({ success: false, error: "Invalid subscription tier" });
      }
      updates.subscription_tier = subscriptionTier;
      updates.subscription_updated_at = new Date();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "No valid fields to update" });
    }

    await db("organizations").where({ id: orgId }).update(updates);

    const updated = await OrganizationModel.findById(orgId);
    return res.json({ success: true, organization: updated });
  } catch (error) {
    return handleError(res, error, "Update billing controls");
  }
}

/**
 * POST /api/admin/organizations/:id/hydrate
 * Run competitive analysis for a single org and persist results.
 */
export async function hydrateOrg(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) return res.status(400).json({ success: false, error: "Invalid org ID" });

    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) return res.status(404).json({ success: false, error: "Organization not found" });

    // Extract placeId from checkup_data or business_data
    let placeId: string | null = null;
    let businessName = org.name;
    let checkupData: any = null;

    try {
      checkupData = typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data;
      placeId = checkupData?.place?.placeId || null;
      businessName = checkupData?.place?.name || org.name;
    } catch { /* parse failed */ }

    if (!placeId) {
      try {
        const bd = typeof org.business_data === "string" ? JSON.parse(org.business_data) : org.business_data;
        placeId = bd?.checkup_place_id || null;
      } catch { /* parse failed */ }
    }

    if (!placeId) {
      return res.status(400).json({ success: false, error: "No placeId found for this org. Cannot run analysis." });
    }

    // Run the analyze endpoint internally
    const axios = (await import("axios")).default;
    const port = process.env.PORT || 3000;
    const city = checkupData?.place?.city || checkupData?.market?.city || "";
    const state = checkupData?.place?.stateAbbr || checkupData?.market?.stateAbbr || "";
    const category = checkupData?.place?.category || "";
    const types = checkupData?.place?.types || [];
    const rating = checkupData?.place?.rating || null;
    const reviewCount = checkupData?.place?.reviewCount || 0;

    const analyzeResponse = await axios.post(
      `http://localhost:${port}/api/checkup/analyze`,
      { name: businessName, city, state, category, types, rating, reviewCount, placeId },
      { timeout: 30000 }
    );

    if (analyzeResponse.data?.success === false) {
      return res.status(500).json({ success: false, error: "Analysis failed", detail: analyzeResponse.data });
    }

    const a = analyzeResponse.data;
    const compositeScore = a.score?.composite ?? null;

    // Persist
    const updates: Record<string, any> = {};
    if (compositeScore != null) updates.checkup_score = compositeScore;
    if (a.topCompetitor?.name) updates.top_competitor_name = a.topCompetitor.name;
    updates.checkup_data = JSON.stringify({
      ...(checkupData || {}),
      score: compositeScore,
      scoreLabel: a.scoreLabel,
      findings: a.findings || [],
      findingSummary: a.findings?.[0]?.title || null,
      topCompetitor: a.topCompetitor || null,
      competitors: a.competitors || [],
      market: { city, state, stateAbbr: state, specialty: a.market?.specialty || category, rank: a.market?.rank },
      subScores: a.score || null,
      totalImpact: a.totalImpact || 0,
    });

    await db("organizations").where({ id: orgId }).update(updates);

    // Update ranking snapshot if one exists
    try {
      const topComp = a.topCompetitor;
      const findings = a.findings || [];
      const richBullets = findings.slice(0, 3).map((f: any) => f.detail || f.title || "").filter(Boolean);
      if (richBullets.length === 0 && compositeScore) richBullets.push(`Business Clarity Score: ${compositeScore}/100.`);

      await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "desc")
        .limit(1)
        .update({
          position: a.market?.rank || null,
          bullets: JSON.stringify(richBullets),
          finding_headline: findings[0]?.title || "Your competitive landscape",
          competitor_name: topComp?.name || null,
          competitor_review_count: topComp?.reviewCount || null,
          client_review_count: reviewCount || null,
          dollar_figure: a.totalImpact || null,
        });
    } catch { /* best effort */ }

    return res.json({
      success: true,
      orgId,
      orgName: businessName,
      score: compositeScore,
      competitors: a.competitors?.length || 0,
      topCompetitor: a.topCompetitor?.name || null,
      findings: (a.findings || []).length,
    });
  } catch (error: any) {
    console.error("[Hydrate] Error:", error?.message);
    return res.status(500).json({ success: false, error: error?.message || "Hydration failed" });
  }
}

/**
 * POST /api/admin/organizations/hydrate-all
 * Run competitive analysis for all orgs that have a placeId but no checkup_score.
 */
export async function hydrateAll(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    // Find orgs that need hydration
    const orgs = await db("organizations")
      .where("subscription_status", "active")
      .whereNull("checkup_score")
      .select("id", "name", "checkup_data", "business_data");

    const results: Array<{ orgId: number; name: string; status: string; score?: number }> = [];

    const axios = (await import("axios")).default;
    const port = process.env.PORT || 3000;

    for (const org of orgs) {
      let placeId: string | null = null;
      try {
        const cd = typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data;
        placeId = cd?.place?.placeId || null;
      } catch { /* skip */ }
      if (!placeId) {
        try {
          const bd = typeof org.business_data === "string" ? JSON.parse(org.business_data) : org.business_data;
          placeId = bd?.checkup_place_id || null;
        } catch { /* skip */ }
      }

      if (!placeId) {
        results.push({ orgId: org.id, name: org.name, status: "skipped_no_placeId" });
        continue;
      }

      try {
        // Call hydrate for this org
        const hydrateResp = await axios.post(
          `http://localhost:${port}/api/admin/organizations/${org.id}/hydrate`,
          {},
          {
            timeout: 45000,
            headers: { Authorization: req.headers.authorization || "" },
          }
        );
        results.push({
          orgId: org.id,
          name: org.name,
          status: "hydrated",
          score: hydrateResp.data?.score,
        });
      } catch (err: any) {
        results.push({ orgId: org.id, name: org.name, status: `failed: ${err.message}` });
      }
    }

    return res.json({
      success: true,
      total: orgs.length,
      results,
    });
  } catch (error: any) {
    console.error("[HydrateAll] Error:", error?.message);
    return res.status(500).json({ success: false, error: error?.message || "Hydrate-all failed" });
  }
}
