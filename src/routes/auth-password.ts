/**
 * Auth Password Routes
 *
 * Email/password authentication endpoints:
 * - POST /api/auth/register            -- Register with email + password
 * - POST /api/auth/verify-email        -- Verify email with 6-digit code
 * - POST /api/auth/login               -- Login with email + password
 * - POST /api/auth/resend-verification -- Resend verification code
 * - POST /api/auth/forgot-password     -- Request password reset code
 * - POST /api/auth/reset-password      -- Reset password with code
 */

import express from "express";
import rateLimit from "express-rate-limit";
import * as authPasswordController from "../controllers/auth-password/AuthPasswordController";

const authPasswordRoutes = express.Router();

// Rate limiters: prevent brute force on auth endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per 15 min
  message: { success: false, error: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per IP per hour
  message: { success: false, error: "Too many accounts created. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: "Too many reset attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

authPasswordRoutes.post("/register", registerLimiter, authPasswordController.register);
authPasswordRoutes.post("/verify-email", loginLimiter, authPasswordController.verifyEmail);
authPasswordRoutes.post("/login", loginLimiter, authPasswordController.login);
authPasswordRoutes.post("/resend-verification", passwordResetLimiter, authPasswordController.resendVerification);
authPasswordRoutes.post("/forgot-password", passwordResetLimiter, authPasswordController.forgotPassword);
authPasswordRoutes.post("/reset-password", passwordResetLimiter, authPasswordController.resetPassword);

export default authPasswordRoutes;
