/**
 * Auth Password Routes
 *
 * Email/password authentication endpoints:
 * - POST /api/auth/register            — Register with email + password
 * - POST /api/auth/verify-email        — Verify email with 6-digit code
 * - POST /api/auth/login               — Login with email + password
 * - POST /api/auth/resend-verification — Resend verification code
 * - POST /api/auth/forgot-password    — Request password reset code
 * - POST /api/auth/reset-password     — Reset password with code
 */

import express from "express";
import * as authPasswordController from "../controllers/auth-password/AuthPasswordController";

const authPasswordRoutes = express.Router();

authPasswordRoutes.post("/register", authPasswordController.register);
authPasswordRoutes.post("/verify-email", authPasswordController.verifyEmail);
authPasswordRoutes.post("/login", authPasswordController.login);
authPasswordRoutes.post(
  "/resend-verification",
  authPasswordController.resendVerification
);
authPasswordRoutes.post(
  "/forgot-password",
  authPasswordController.forgotPassword
);
authPasswordRoutes.post(
  "/reset-password",
  authPasswordController.resetPassword
);

export default authPasswordRoutes;
