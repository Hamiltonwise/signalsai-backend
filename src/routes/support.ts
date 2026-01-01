/**
 * Support Routes
 *
 * Handles user inquiries and support requests
 * - POST /api/support/inquiry - Submit a support request (sends email to admins)
 */

import express, { Request, Response } from "express";
import { forwardUserInquiry } from "../utils/notificationHelper";

const router = express.Router();

/**
 * POST /api/support/inquiry
 * Submit a support request / inquiry
 * This forwards the message to admin team via email
 *
 * Body:
 * - userName: string (required) - User's name
 * - userEmail: string (required) - User's email
 * - practiceName: string (optional) - Practice name
 * - subject: string (required) - Subject of the inquiry
 * - message: string (required) - The inquiry message
 */
router.post("/inquiry", async (req: Request, res: Response) => {
  try {
    const { userName, userEmail, practiceName, subject, message } = req.body;

    // Validate required fields
    if (!userName || typeof userName !== "string" || !userName.trim()) {
      return res.status(400).json({
        success: false,
        error: "MISSING_NAME",
        message: "Name is required",
      });
    }

    if (!userEmail || typeof userEmail !== "string" || !userEmail.trim()) {
      return res.status(400).json({
        success: false,
        error: "MISSING_EMAIL",
        message: "Email is required",
      });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail.trim())) {
      return res.status(400).json({
        success: false,
        error: "INVALID_EMAIL",
        message: "Please enter a valid email address",
      });
    }

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return res.status(400).json({
        success: false,
        error: "MISSING_SUBJECT",
        message: "Subject is required",
      });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "MISSING_MESSAGE",
        message: "Message is required",
      });
    }

    console.log(
      `[Support] Received inquiry from ${userName} (${userEmail}): ${subject}`
    );

    // Send email to admin team
    const result = await forwardUserInquiry({
      userName: userName.trim(),
      userEmail: userEmail.trim(),
      practiceName: practiceName?.trim() || undefined,
      subject: subject.trim(),
      message: message.trim(),
    });

    if (!result.success) {
      console.error(`[Support] Failed to forward inquiry: ${result.error}`);
      return res.status(500).json({
        success: false,
        error: "EMAIL_FAILED",
        message:
          "We couldn't send your message at this time. Please try again later or contact us directly.",
      });
    }

    console.log(`[Support] ✓ Inquiry forwarded successfully to admin team`);

    return res.json({
      success: true,
      message:
        "Your message has been sent successfully. We'll get back to you soon!",
      messageId: "messageId" in result ? result.messageId : undefined,
    });
  } catch (error: any) {
    console.error(
      "[Support] Error processing inquiry:",
      error.message || error
    );
    return res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    });
  }
});

/**
 * GET /api/support/health
 * Health check endpoint
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

export default router;
