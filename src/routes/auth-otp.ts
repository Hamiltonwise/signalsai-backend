import express, { Request, Response } from "express";
import { db } from "../database/connection";
import { sendOTP } from "../services/mail";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-in-prod";

// Test account email - bypasses OTP verification
const TEST_EMAIL = "tester@google.com";

// Helper to generate 6-digit code
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * POST /api/auth/otp/request
 * Request an OTP code via email
 */
router.post("/request", async (req: Request, res: Response) => {
  try {
    const { email, isAdminLogin } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Check if this is a test account - bypass OTP
    if (normalizedEmail === TEST_EMAIL) {
      console.log("[AUTH] Test account detected, skipping OTP email");
      return res.json({
        success: true,
        message: "Test account - no OTP required",
        isTestAccount: true,
      });
    }

    // Check if Super Admin
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    const isSuperAdmin = superAdminEmails.includes(normalizedEmail);

    // If Admin Login, STRICTLY require Super Admin status
    if (isAdminLogin && !isSuperAdmin) {
      return res.status(403).json({
        error: "Access denied. Your email is not authorized for Admin access.",
      });
    }

    // Check if user exists
    const user = await db("users").where({ email: normalizedEmail }).first();

    // Check if invitation exists
    const invitation = await db("invitations")
      .where({ email: normalizedEmail, status: "pending" })
      .first();

    if (!user && !invitation && !isSuperAdmin) {
      // For security, we shouldn't reveal if email exists or not,
      // but for this MVP/internal tool, we might want to be explicit or just allow it?
      // Let's allow it but maybe not send email?
      // Or better: Only allow if user or invitation exists.
      return res
        .status(404)
        .json({ error: "Email not found. Please ask an admin to invite you." });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save code
    await db("otp_codes").insert({
      email: normalizedEmail,
      code,
      expires_at: expiresAt,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Send email
    const sent = await sendOTP(normalizedEmail, code);

    if (!sent) {
      return res.status(500).json({ error: "Failed to send email" });
    }

    res.json({ success: true, message: "OTP sent to email" });
  } catch (error) {
    console.error("OTP Request Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/otp/verify
 * Verify OTP code and login/register
 */
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { email, code, isAdminLogin } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Check if this is a test account - bypass OTP verification
    const isTestAccount = normalizedEmail === TEST_EMAIL;

    // Check if Super Admin
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    const isSuperAdmin = superAdminEmails.includes(normalizedEmail);

    // If Admin Login, STRICTLY require Super Admin status
    if (isAdminLogin && !isSuperAdmin) {
      return res.status(403).json({
        error: "Access denied. Your email is not authorized for Admin access.",
      });
    }

    // Skip OTP verification for test account
    if (!isTestAccount) {
      // Verify code
      const otpRecord = await db("otp_codes")
        .where({
          email: normalizedEmail,
          code,
          used: false,
        })
        .where("expires_at", ">", new Date())
        .orderBy("created_at", "desc")
        .first();

      if (!otpRecord) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      // Mark code as used
      await db("otp_codes")
        .where({ id: otpRecord.id })
        .update({ used: true, updated_at: new Date() });
    } else {
      console.log("[AUTH] Test account - bypassing OTP verification");
    }

    // Find or create user
    let user = await db("users").where({ email: normalizedEmail }).first();
    let isNewUser = false;

    if (!user) {
      // Check for invitation
      const invitation = await db("invitations")
        .where({ email: normalizedEmail, status: "pending" })
        .first();

      // Check if Super Admin
      const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0);

      const isSuperAdmin = superAdminEmails.includes(normalizedEmail);

      if (!invitation && !isSuperAdmin) {
        return res
          .status(400)
          .json({ error: "No account found and no pending invitation." });
      }

      // Create user
      isNewUser = true;
      const [newUser] = await db("users")
        .insert({
          email: normalizedEmail,
          name: normalizedEmail.split("@")[0], // Default name
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");

      user = newUser;

      if (invitation) {
        // Accept invitation
        await db("organization_users").insert({
          organization_id: invitation.organization_id,
          user_id: user.id,
          role: invitation.role,
          created_at: new Date(),
          updated_at: new Date(),
        });

        await db("invitations")
          .where({ id: invitation.id })
          .update({ status: "accepted", updated_at: new Date() });
      }
      // If Super Admin (and no invitation), they are created but not linked to any org yet.
      // This is fine for Admin Dashboard access which might not require org context immediately.
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Get user role and org (if any)
    const orgUser = await db("organization_users")
      .where({ user_id: user.id })
      .first();

    let googleAccountId = null;
    if (orgUser) {
      // Find the primary google account for this organization
      const googleAccount = await db("google_accounts")
        .where({ organization_id: orgUser.organization_id })
        .orderBy("created_at", "asc") // Assume first one is primary for now
        .first();

      if (googleAccount) {
        googleAccountId = googleAccount.id;
      }
    }

    // Set cookie for cross-app auth sync
    // Use shared domain in production for cross-app auth between app.getalloro.com and builder.getalloro.com
    res.cookie("auth_token", token, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      httpOnly: false, // Allow client-side access for cross-tab sync
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: process.env.NODE_ENV === "production" ? ".getalloro.com" : undefined,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id,
        role: orgUser?.role || "viewer", // Return role for RBAC
        googleAccountId, // Return this so frontend can use it for existing API calls
      },
      isNewUser,
    });
  } catch (error) {
    console.error("OTP Verify Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/otp/validate
 * Validate a JWT token and return user info
 * Used by website-builder for unified auth
 */
router.post("/validate", async (req: Request, res: Response) => {
  try {
    // Get token from Authorization header or body
    const authHeader = req.headers["authorization"];
    const headerToken = authHeader && authHeader.split(" ")[1];
    const bodyToken = req.body.token;
    const token = headerToken || bodyToken;

    if (!token) {
      return res.status(401).json({ 
        valid: false, 
        error: "No token provided" 
      });
    }

    // Verify JWT
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ 
        valid: false, 
        error: "Invalid or expired token" 
      });
    }

    const { userId, email } = decoded;

    // Check if Super Admin
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    const isSuperAdmin = superAdminEmails.includes(email.toLowerCase());

    // Get user from database (optional - for additional user info)
    const user = await db("users").where({ id: userId }).first();

    if (!user) {
      return res.status(401).json({ 
        valid: false, 
        error: "User not found" 
      });
    }

    // Get user role and org (if any)
    const orgUser = await db("organization_users")
      .where({ user_id: userId })
      .first();

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id,
        role: orgUser?.role || "viewer",
        isSuperAdmin,
      },
    });
  } catch (error) {
    console.error("Token Validate Error:", error);
    res.status(500).json({ 
      valid: false, 
      error: "Internal server error" 
    });
  }
});

export default router;
