import express, { Response } from "express";
import { db } from "../../database/connection";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { sendToAdmins } from "../../emails/emailService";
import { v4 as uuid } from "uuid";

const organizationsRoutes = express.Router();

/**
 * Helper to handle errors
 */
const handleError = (res: Response, error: any, operation: string) => {
  console.error(`[Admin/Orgs] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
};

/**
 * GET /api/admin/organizations
 * Fetch all organizations with summary data
 */
organizationsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      // Fetch all organizations
      const organizations = await db("organizations")
        .select("id", "name", "domain", "subscription_tier", "created_at")
        .orderBy("name", "asc");

      // Enrich with user counts and connection status
      const enrichedOrgs = await Promise.all(
        organizations.map(async (org) => {
          // Count users
          const userCount = await db("organization_users")
            .where({ organization_id: org.id })
            .count("id as count")
            .first();

          // Check connections via google_accounts
          // We look for any google_account linked to this org that has properties set
          const linkedAccounts = await db("google_accounts")
            .where({ organization_id: org.id })
            .select("google_property_ids");

          let hasGa4 = false;
          let hasGsc = false;
          let hasGbp = false;

          for (const acc of linkedAccounts) {
            let props = acc.google_property_ids;
            if (typeof props === "string") {
              try {
                props = JSON.parse(props);
              } catch (e) {
                continue;
              }
            }
            if (props?.ga4) hasGa4 = true;
            if (props?.gsc) hasGsc = true;
            if (props?.gbp && Array.isArray(props.gbp) && props.gbp.length > 0)
              hasGbp = true;
          }

          return {
            ...org,
            userCount: userCount?.count || 0,
            connections: {
              ga4: hasGa4,
              gsc: hasGsc,
              gbp: hasGbp,
            },
          };
        })
      );

      return res.json({
        success: true,
        organizations: enrichedOrgs,
      });
    } catch (error) {
      return handleError(res, error, "Fetch all organizations");
    }
  }
);

/**
 * GET /api/admin/organizations/:id
 * Fetch details for a specific organization (users, full connection details)
 */
organizationsRoutes.get(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const orgId = parseInt(req.params.id);
      if (isNaN(orgId)) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      const organization = await db("organizations")
        .where({ id: orgId })
        .first();

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      // Fetch users
      const users = await db("organization_users")
        .join("users", "organization_users.user_id", "users.id")
        .where("organization_users.organization_id", orgId)
        .select(
          "users.id",
          "users.name",
          "users.email",
          "organization_users.role",
          "organization_users.created_at as joined_at"
        );

      // Fetch connection details
      const linkedAccounts = await db("google_accounts")
        .where({ organization_id: orgId })
        .select("id", "email", "google_property_ids");

      const connections = linkedAccounts.map((acc) => {
        let props = acc.google_property_ids;
        if (typeof props === "string") {
          try {
            props = JSON.parse(props);
          } catch (e) {
            props = {};
          }
        }
        return {
          accountId: acc.id,
          email: acc.email,
          properties: props,
        };
      });

      return res.json({
        success: true,
        organization,
        users,
        connections,
      });
    } catch (error) {
      return handleError(res, error, "Fetch organization details");
    }
  }
);

/**
 * PATCH /api/admin/organizations/:id
 * Update organization details
 */
organizationsRoutes.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const { name } = req.body;

      if (isNaN(orgId)) {
        return res.status(400).json({ error: "Invalid organization ID" });
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Name is required" });
      }

      const updated = await db("organizations")
        .where({ id: orgId })
        .update({
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
);

/**
 * PATCH /api/admin/organizations/:id/tier
 * Update organization subscription tier
 */
organizationsRoutes.patch(
  "/:id/tier",
  authenticateToken,
  superAdminMiddleware,
  async (req: AuthRequest, res) => {
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

      const org = await trx("organizations").where({ id: orgId }).first();
      if (!org) {
        await trx.rollback();
        return res.status(404).json({ error: "Organization not found" });
      }

      const oldTier = org.subscription_tier;

      // Update tier
      await trx("organizations").where({ id: orgId }).update({
        subscription_tier: tier,
        subscription_updated_at: new Date(),
      });

      // UPGRADE TO DFY: Create empty website project
      if (oldTier === "DWY" && tier === "DFY") {
        const existingProject = await trx("website_builder.projects")
          .where({ organization_id: orgId })
          .first();

        if (!existingProject) {
          // Generate hostname based on org name
          const baseHostname = org.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .substring(0, 30);
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          const hostname = `${baseHostname}-${randomSuffix}`;

          // Auto-create project
          await trx("website_builder.projects").insert({
            id: uuid(),
            organization_id: orgId,
            generated_hostname: hostname,
            status: "CREATED",
            created_at: new Date(),
            updated_at: new Date(),
          });

          // Send email to admins
          await sendToAdmins(
            `New DFY Website Ready for Setup: ${org.name}`,
            `Organization "${org.name}" has been upgraded to DFY tier.

A website project has been created but needs pages generated.

Action required:
1. Go to Admin > Websites
2. Find project: ${hostname}
3. Click "Create Page" and select template

Organization ID: ${orgId}
Hostname: ${hostname}.sites.getalloro.com`
          );
        }
      }

      // DOWNGRADE TO DWY: Make website read-only
      if (oldTier === "DFY" && tier === "DWY") {
        await trx("website_builder.projects")
          .where({ organization_id: orgId })
          .update({ is_read_only: true });
      }

      await trx.commit();

      return res.json({
        success: true,
        tier,
        message:
          tier === "DFY"
            ? "Organization upgraded. Website project created."
            : "Organization downgraded. Website is now read-only.",
      });
    } catch (error) {
      await trx.rollback();
      return handleError(res, error, "Update organization tier");
    }
  }
);

export default organizationsRoutes;
