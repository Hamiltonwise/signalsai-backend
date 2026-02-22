import express from "express";
import { Request, Response } from "express";
import { LocationModel } from "../models/LocationModel";
import { GooglePropertyModel } from "../models/GooglePropertyModel";
import { LocationScopedRequest } from "../middleware/rbac";

const router = express.Router();

/**
 * GET /api/locations
 * Fetch locations for the authenticated user's organization.
 * Returns locations with their associated Google Properties.
 */
router.get("/", async (req: Request, res: Response) => {
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

    const allLocations = await LocationModel.findByOrganizationId(organizationId);

    // Filter to accessible locations for non-admin users
    const accessibleIds = scopedReq.accessibleLocationIds;
    const locations = accessibleIds
      ? allLocations.filter((l) => accessibleIds.includes(l.id))
      : allLocations;

    // Fetch google properties for each location
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
  } catch (error: any) {
    console.error("[LOCATIONS] Error fetching locations:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch locations",
      message: error.message || "Unknown error",
    });
  }
});

/**
 * GET /api/locations/primary
 * Fetch the primary location for the authenticated user's organization.
 */
router.get("/primary", async (req: Request, res: Response) => {
  try {
    const scopedReq = req as LocationScopedRequest;
    const organizationId = scopedReq.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: "Organization not found",
      });
    }

    const primary = await LocationModel.findPrimaryByOrganizationId(organizationId);

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
});

export default router;
