import express, { Request, Response } from "express";
import { db } from "../database/connection";
import { sendOTP } from "../services/mail";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-in-prod";

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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Check if user exists
    const user = await db("users").where({ email: normalizedEmail }).first();

    // Check if invitation exists
    const invitation = await db("invitations")
      .where({ email: normalizedEmail, status: "pending" })
      .first();

    if (!user && !invitation) {
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
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    const normalizedEmail = email.toLowerCase();

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

    // Find or create user
    let user = await db("users").where({ email: normalizedEmail }).first();
    let isNewUser = false;

    if (!user) {
      // Check for invitation
      const invitation = await db("invitations")
        .where({ email: normalizedEmail, status: "pending" })
        .first();

      if (!invitation) {
        return res
          .status(400)
          .json({ error: "No account found and no pending invitation." });
      }

      // Create user from invitation
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

export default router;
