import express from "express";
import jwt from "jsonwebtoken";
import { db } from "../../database/connection";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-in-prod";

/**
 * POST /api/admin/pilot/:userId
 * Generates an impersonation token for the target user.
 * Restricted to Super Admins.
 */
router.post(
  "/pilot/:userId",
  authenticateToken,
  superAdminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;

      // 1. Fetch target user
      const targetUser = await db("users").where({ id: userId }).first();

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // 2. Get google_account_id for the user (needed for some frontend logic)
      const googleAccount = await db("google_accounts")
        .where({ user_id: userId })
        .first();

      // 3. Generate pilot token (short-lived 1 hour expiration)
      const pilotToken = jwt.sign(
        {
          userId: targetUser.id,
          email: targetUser.email,
          isPilot: true, // Marker for pilot tokens
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      console.log(
        `[ADMIN PILOT] Super Admin ${req.user?.email} started pilot session for user ${targetUser.email}`
      );

      return res.json({
        success: true,
        token: pilotToken,
        googleAccountId: googleAccount?.id || null,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
        },
      });
    } catch (error) {
      console.error("[ADMIN PILOT] Error creating pilot session:", error);
      return res
        .status(500)
        .json({ error: "Failed to create pilot session token" });
    }
  }
);

/**
 * GET /api/admin/validate
 * Checks if the current user is a Super Admin.
 * Used by AdminGuard on the frontend.
 */
router.get("/validate", authenticateToken, superAdminMiddleware, (req, res) => {
  res.json({ success: true, message: "Authorized" });
});

export default router;
