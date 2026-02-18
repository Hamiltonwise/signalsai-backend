/**
 * Auth OTP Routes
 *
 * OTP-based authentication endpoints:
 * - POST /api/auth/otp/request  — Request an OTP code via email
 * - POST /api/auth/otp/verify   — Verify OTP code and login/register
 * - POST /api/auth/otp/validate — Validate a JWT token and return user info
 */

import express from "express";
import * as authOtpController from "../controllers/auth-otp/AuthOtpController";

const otpRoutes = express.Router();

otpRoutes.post("/request", authOtpController.requestOtp);
otpRoutes.post("/verify", authOtpController.verifyOtp);
otpRoutes.post("/validate", authOtpController.validateToken);

export default otpRoutes;
