import express from "express";
import { Request, Response } from "express";
import { LocationModel } from "../models/LocationModel";
import { GooglePropertyModel } from "../models/GooglePropertyModel";
import { authenticateToken } from "../middleware/auth";
import {
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole,
  LocationScopedRequest,
  RBACRequest,
} from "../middleware/rbac";
import {
  createLocation,
  removeLocation,
  updateLocation,
  setLocationGBP,
  disconnectLocationGBP,
} from "../controllers/locations/LocationService";

const router = express.Router();

// =====================================================================
// READ endpoints
// =====================================================================

/**
 * GET /api/locations
 * Fetch locations for the authenticated user's organization.
 * Returns locations with their associated Google Properties.
 */
router.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  async (req: Request, res: Response) => {
    try {
      const scopedReq = req as LocationScopedRequest;
      const organizationId = scopedReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: "Organization not found",
          message: "User must be onboarded to an organization",
        });
      }

      const allLocations =
        await LocationModel.findByOrganizationId(organizationId);

      // Filter to accessible locations for non-admin users
      const accessibleIds = scopedReq.accessibleLocationIds;
      const locations = accessibleIds
        ? allLocations.filter((l) => accessibleIds.includes(l.id))
        : allLocations;

      // Fetch google properties for each location
      const locationsWithProperties = await Promise.all(
        locations.map(async (location) => {
          const properties = await GooglePropertyModel.findByLocationId(
            location.id
          );
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
    } catch (error: any) {
      console.error("[LOCATIONS] Error fetching locations:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch locations",
        message: error.message || "Unknown error",
      });
    }
  }
);

/**
 * GET /api/locations/primary
 * Fetch the primary location for the authenticated user's organization.
 */
router.get(
  "/primary",
  authenticateToken,
  rbacMiddleware,
  async (req: Request, res: Response) => {
    try {
      const scopedReq = req as LocationScopedRequest;
      const organizationId = scopedReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: "Organization not found",
        });
      }

      const primary =
        await LocationModel.findPrimaryByOrganizationId(organizationId);

      if (!primary) {
        return res.status(404).json({
          success: false,
          error: "No primary location found",
        });
      }

      const properties = await GooglePropertyModel.findByLocationId(primary.id);

      return res.json({
        success: true,
        location: {
          ...primary,
          googleProperties: properties,
        },
      });
    } catch (error: any) {
      console.error("[LOCATIONS] Error fetching primary location:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch primary location",
        message: error.message || "Unknown error",
      });
    }
  }
);

// =====================================================================
// WRITE endpoints (admin only)
// =====================================================================

/**
 * POST /api/locations
 * Create a new location with a required GBP profile.
 * Body: { name: string, domain?: string, gbp: { accountId, locationId, displayName } }
 */
router.post(
  "/",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req as RBACRequest;
      if (!organizationId) {
        return res.status(400).json({ success: false, error: "Organization not found" });
      }

      const { name, domain, gbp } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ success: false, error: "Location name is required" });
      }
      if (!gbp || !gbp.locationId || !gbp.displayName) {
        return res.status(400).json({ success: false, error: "GBP profile is required" });
      }

      const location = await createLocation(organizationId, name, gbp, domain);

      const properties = await GooglePropertyModel.findByLocationId(location.id);

      return res.status(201).json({
        success: true,
        location: { ...location, googleProperties: properties },
      });
    } catch (error: any) {
      console.error("[LOCATIONS] Error creating location:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to create location",
      });
    }
  }
);

/**
 * PUT /api/locations/:id
 * Update location metadata (name, domain, is_primary).
 * Body: { name?: string, domain?: string, is_primary?: boolean }
 */
router.put(
  "/:id",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req as RBACRequest;
      if (!organizationId) {
        return res.status(400).json({ success: false, error: "Organization not found" });
      }

      const locationId = parseInt(req.params.id, 10);
      if (isNaN(locationId)) {
        return res.status(400).json({ success: false, error: "Invalid location ID" });
      }

      const { name, domain, is_primary } = req.body;

      await updateLocation(locationId, organizationId, {
        ...(name !== undefined && { name }),
        ...(domain !== undefined && { domain }),
        ...(is_primary !== undefined && { is_primary }),
      });

      const updated = await LocationModel.findById(locationId);
      const properties = updated
        ? await GooglePropertyModel.findByLocationId(updated.id)
        : [];

      return res.json({
        success: true,
        location: updated ? { ...updated, googleProperties: properties } : null,
      });
    } catch (error: any) {
      console.error("[LOCATIONS] Error updating location:", error);
      const status = error.message.includes("not found") ? 404 : 500;
      return res.status(status).json({
        success: false,
        error: error.message || "Failed to update location",
      });
    }
  }
);

/**
 * DELETE /api/locations/:id
 * Remove a location (cannot remove the last one).
 */
router.delete(
  "/:id",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req as RBACRequest;
      if (!organizationId) {
        return res.status(400).json({ success: false, error: "Organization not found" });
      }

      const locationId = parseInt(req.params.id, 10);
      if (isNaN(locationId)) {
        return res.status(400).json({ success: false, error: "Invalid location ID" });
      }

      await removeLocation(locationId, organizationId);

      return res.json({ success: true, message: "Location removed" });
    } catch (error: any) {
      console.error("[LOCATIONS] Error removing location:", error);
      const status = error.message.includes("not found")
        ? 404
        : error.message.includes("Cannot remove")
        ? 400
        : 500;
      return res.status(status).json({
        success: false,
        error: error.message || "Failed to remove location",
      });
    }
  }
);

/**
 * PUT /api/locations/:id/gbp
 * Set or change the GBP profile for a location.
 * Body: { accountId: string, locationId: string, displayName: string }
 */
router.put(
  "/:id/gbp",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req as RBACRequest;
      if (!organizationId) {
        return res.status(400).json({ success: false, error: "Organization not found" });
      }

      const locationId = parseInt(req.params.id, 10);
      if (isNaN(locationId)) {
        return res.status(400).json({ success: false, error: "Invalid location ID" });
      }

      const { accountId, locationId: gbpLocationId, displayName } = req.body;
      if (!gbpLocationId || !displayName) {
        return res.status(400).json({
          success: false,
          error: "accountId, locationId, and displayName are required",
        });
      }

      await setLocationGBP(locationId, organizationId, {
        accountId,
        locationId: gbpLocationId,
        displayName,
      });

      const location = await LocationModel.findById(locationId);
      const properties = location
        ? await GooglePropertyModel.findByLocationId(location.id)
        : [];

      return res.json({
        success: true,
        location: location ? { ...location, googleProperties: properties } : null,
      });
    } catch (error: any) {
      console.error("[LOCATIONS] Error setting GBP:", error);
      const status = error.message.includes("not found") ? 404 : 500;
      return res.status(status).json({
        success: false,
        error: error.message || "Failed to set GBP profile",
      });
    }
  }
);

/**
 * DELETE /api/locations/:id/gbp
 * Disconnect GBP from a location.
 */
router.delete(
  "/:id/gbp",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req as RBACRequest;
      if (!organizationId) {
        return res.status(400).json({ success: false, error: "Organization not found" });
      }

      const locationId = parseInt(req.params.id, 10);
      if (isNaN(locationId)) {
        return res.status(400).json({ success: false, error: "Invalid location ID" });
      }

      await disconnectLocationGBP(locationId, organizationId);

      return res.json({ success: true, message: "GBP disconnected" });
    } catch (error: any) {
      console.error("[LOCATIONS] Error disconnecting GBP:", error);
      const status = error.message.includes("not found") ? 404 : 500;
      return res.status(status).json({
        success: false,
        error: error.message || "Failed to disconnect GBP",
      });
    }
  }
);

export default router;
