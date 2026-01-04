import express, { Response } from "express";
import { db } from "../database/connection";
import {
  tokenRefreshMiddleware,
  AuthenticatedRequest,
} from "../middleware/tokenRefresh";
import { rbacMiddleware, RBACRequest } from "../middleware/rbac";

const profileRoutes = express.Router();

/**
 * Helper to handle errors
 */
const handleError = (res: Response, error: any, operation: string) => {
  console.error(`[Profile] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
};

// =====================================================================
// PROFILE DATA (phone & operational_jurisdiction)
// =====================================================================

/**
 * GET /api/profile/get
 * Fetch the user's profile data (phone and operational_jurisdiction)
 * from the google_accounts table
 */
profileRoutes.get(
  "/get",
  tokenRefreshMiddleware,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;

      if (!googleAccountId) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
        });
      }

      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .select("phone", "operational_jurisdiction")
        .first();

      if (!googleAccount) {
        return res.status(404).json({
          success: false,
          error: "Account not found",
        });
      }

      return res.json({
        success: true,
        data: {
          phone: googleAccount.phone || null,
          operational_jurisdiction:
            googleAccount.operational_jurisdiction || null,
        },
      });
    } catch (error) {
      return handleError(res, error, "Fetch profile data");
    }
  }
);

/**
 * PUT /api/profile/update
 * Update the user's profile data (phone and/or operational_jurisdiction)
 * in the google_accounts table
 */
profileRoutes.put(
  "/update",
  tokenRefreshMiddleware,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const googleAccountId = req.googleAccountId;
      const { phone, operational_jurisdiction } = req.body;

      if (!googleAccountId) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
        });
      }

      // Build update object only with provided fields
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };

      if (phone !== undefined) {
        updateData.phone = phone;
      }

      if (operational_jurisdiction !== undefined) {
        updateData.operational_jurisdiction = operational_jurisdiction;
      }

      // Check if there's anything to update
      if (Object.keys(updateData).length === 1) {
        return res.status(400).json({
          success: false,
          error: "No valid fields provided for update",
        });
      }

      const updated = await db("google_accounts")
        .where({ id: googleAccountId })
        .update(updateData);

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: "Account not found",
        });
      }

      // Fetch and return the updated data
      const googleAccount = await db("google_accounts")
        .where({ id: googleAccountId })
        .select("phone", "operational_jurisdiction")
        .first();

      return res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          phone: googleAccount?.phone || null,
          operational_jurisdiction:
            googleAccount?.operational_jurisdiction || null,
        },
      });
    } catch (error) {
      return handleError(res, error, "Update profile data");
    }
  }
);

export default profileRoutes;
