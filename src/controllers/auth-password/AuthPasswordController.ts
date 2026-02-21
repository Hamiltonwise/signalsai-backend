/**
 * Auth Password Controller
 *
 * Handles email/password authentication:
 * - POST /register           — Register with email + password
 * - POST /verify-email       — Verify email with 6-digit code
 * - POST /login              — Login with email + password
 * - POST /resend-verification — Resend verification code
 */

import { Request, Response } from "express";
import bcrypt from "bcrypt";

import { UserModel } from "../../models/UserModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { generateToken } from "../auth-otp/feature-services/service.jwt-management";
import { generateSixDigitCode } from "../auth-otp/feature-services/service.otp-generation";
import { buildAuthCookieOptions } from "../auth-otp/feature-utils/util.cookie-config";
import { sendVerificationCode } from "../../utils/core/mail";

const BCRYPT_SALT_ROUNDS = 12;
const VERIFICATION_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const PASSWORD_MIN_LENGTH = 8;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/**
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response) {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ error: "Email, password, and confirmPassword are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters with 1 uppercase letter and 1 number",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await UserModel.findByEmail(normalizedEmail);
    if (existing) {
      // Don't reveal whether the email exists — generic message
      return res.status(409).json({
        error: "An account with this email already exists",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Generate verification code
    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

    // Create user
    await UserModel.create({
      email: normalizedEmail,
      password_hash: passwordHash,
      email_verification_code: code,
      email_verification_expires_at: expiresAt,
    });

    // Send verification email
    const sent = await sendVerificationCode(normalizedEmail, code);
    if (!sent) {
      console.error(`[AUTH] Failed to send verification email to ${normalizedEmail}`);
    }

    console.log(`[AUTH] User registered: ${normalizedEmail}`);

    return res.status(201).json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error) {
    console.error("[AUTH] Register error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/verify-email
 */
export async function verifyEmail(req: Request, res: Response) {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email + valid code
    const user = await UserModel.findByVerificationCode(normalizedEmail, code);

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    // Mark email as verified
    await UserModel.setEmailVerified(user.id);

    // Generate JWT
    const token = generateToken(user.id, user.email);

    // Get org info if available
    const orgUser = await OrganizationUserModel.findByUserId(user.id);

    // Set cookie for cross-app auth sync
    res.cookie("auth_token", token, buildAuthCookieOptions());

    console.log(`[AUTH] Email verified: ${normalizedEmail}`);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id || null,
        role: orgUser?.role || "viewer",
      },
    });
  } catch (error) {
    console.error("[AUTH] Verify email error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await UserModel.findByEmail(normalizedEmail);

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.email_verified) {
      return res
        .status(403)
        .json({ error: "Please verify your email first" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Get org info
    const orgUser = await OrganizationUserModel.findByUserId(user.id);

    // Generate JWT
    const token = generateToken(user.id, user.email);

    // Set cookie for cross-app auth sync
    res.cookie("auth_token", token, buildAuthCookieOptions());

    console.log(`[AUTH] User logged in: ${normalizedEmail}`);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id || null,
        role: orgUser?.role || "viewer",
      },
    });
  } catch (error) {
    console.error("[AUTH] Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/resend-verification
 */
export async function resendVerification(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await UserModel.findByEmail(normalizedEmail);

    if (!user) {
      // Don't reveal whether email exists
      return res.json({
        success: true,
        message: "If an account exists, a new code has been sent",
      });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    // Generate new code
    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

    await UserModel.setVerificationCode(user.id, code, expiresAt);

    const sent = await sendVerificationCode(normalizedEmail, code);
    if (!sent) {
      console.error(`[AUTH] Failed to resend verification email to ${normalizedEmail}`);
    }

    console.log(`[AUTH] Verification code resent: ${normalizedEmail}`);

    return res.json({
      success: true,
      message: "If an account exists, a new code has been sent",
    });
  } catch (error) {
    console.error("[AUTH] Resend verification error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
