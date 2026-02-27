/**
 * Admin Organizations Controller
 *
 * Handles HTTP request/response for admin organization endpoints.
 * Delegates business logic to services and data access to models.
 */

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { db } from "../../database/connection";
import { OrganizationModel } from "../../models/OrganizationModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { LocationModel } from "../../models/LocationModel";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import * as OrganizationEnrichmentService from "./feature-services/OrganizationEnrichmentService";
import * as ConnectionDetectionService from "./feature-services/ConnectionDetectionService";
import * as TierManagementService from "./feature-services/TierManagementService";
import * as AdminOrgCreationService from "./feature-services/AdminOrgCreationService";
import * as hostnameGenerator from "./feature-utils/hostnameGenerator";
import { deleteOrganization } from "../settings/feature-services/service.delete-organization";
import { getStripe, isStripeConfigured } from "../../config/stripe";
import { v4 as uuid } from "uuid";

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
