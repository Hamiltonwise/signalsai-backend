/**
 * Admin Password Reset
 *
 * POST /api/admin/users/:userId/reset-password
 *
 * Allows super admins to reset any user's password directly.
 * No email required. No Mailgun dependency. Immediate.
 *
 * This exists because a customer should NEVER be locked out
 * of a product they're paying for because an email service
 * had a bad day.
 */

import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const adminPasswordResetRoutes = Router();

const BCRYPT_ROUNDS = 12;

adminPasswordResetRoutes.post(
  "/users/:userId/reset-password",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (!userId || isNaN(userId)) {
        return res.status(400).json({ success: false, error: "Invalid user ID" });
      }

      const { password } = req.body;
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
      }

      // Verify user exists
      const user = await db("users").where({ id: userId }).first();
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      // Hash and update
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db("users").where({ id: userId }).update({
        password_hash: hash,
        updated_at: new Date(),
      });

      console.log(`[Admin] Password reset for user ${userId} (${user.email}) by admin`);

      return res.json({
        success: true,
        message: `Password reset for ${user.email}`,
      });
    } catch (error: any) {
      console.error("[Admin] Password reset error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to reset password" });
    }
  }
);

export default adminPasswordResetRoutes;
