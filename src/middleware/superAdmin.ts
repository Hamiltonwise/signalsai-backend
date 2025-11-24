import { Response, NextFunction } from "express";
import { db } from "../database/connection";
import { AuthenticatedRequest } from "./tokenRefresh";
import { AuthRequest } from "./auth";

/**
 * Super Admin Middleware
 * Restricts access to users whose emails are in the SUPER_ADMIN_EMAILS env var.
 */
export const superAdminMiddleware = async (
  req: AuthenticatedRequest & AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    let userEmail = req.user?.email;

    // If no email from JWT, try to get from Google Account ID (legacy/main app flow)
    if (!userEmail) {
      const googleAccountId = req.googleAccountId;

      if (googleAccountId) {
        // Get user from google account
        const googleAccount = await db("google_accounts")
          .where({ id: googleAccountId })
          .first();

        if (googleAccount && googleAccount.user_id) {
          const user = await db("users")
            .where({ id: googleAccount.user_id })
            .first();
          if (user) {
            userEmail = user.email;
          }
        }
      }
    }

    if (!userEmail) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Check against allowed emails
    const allowedEmails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    if (!allowedEmails.includes(userEmail.toLowerCase())) {
      return res.status(403).json({
        error: "Access denied. Super Admin privileges required.",
      });
    }

    next();
  } catch (error) {
    console.error("[SuperAdmin] Error checking permissions:", error);
    return res.status(500).json({ error: "Failed to verify permissions" });
  }
};
