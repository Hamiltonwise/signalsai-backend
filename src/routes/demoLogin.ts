/**
 * Demo Login — WO-DEMO
 *
 * GET /api/demo/login — returns a valid session token for demo@getalloro.com.
 * No auth required. Used by /demo route for auto-login at AAE.
 */

import express from "express";
import { db } from "../database/connection";
import { generateToken } from "../controllers/auth-otp/feature-services/service.jwt-management";

const demoLoginRoutes = express.Router();

const DEMO_EMAIL = "demo@getalloro.com";

demoLoginRoutes.get(
  "/login",
  async (_req, res) => {
    // Block in production unless explicitly enabled
    if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    try {
      const user = await db("users").where({ email: DEMO_EMAIL }).first();

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "Demo account not found. Run: npm run seed:demo",
        });
      }

      const orgUser = await db("organization_users")
        .where({ user_id: user.id })
        .first();

      const token = generateToken(user.id, user.email);

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
          organizationId: orgUser?.organization_id || null,
          role: orgUser?.role || "admin",
        },
      });
    } catch (error: any) {
      console.error("[DemoLogin] Error:", error.message);
      return res.status(500).json({ success: false, error: "Demo login failed" });
    }
  },
);

export default demoLoginRoutes;
