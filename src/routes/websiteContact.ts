/**
 * Website Contact Form API Route (Public — no auth required)
 *
 * Handles contact form submissions from rendered sites at *.sites.getalloro.com.
 * Verifies reCAPTCHA, sanitizes input, builds HTML email, and forwards to n8n webhook.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import { handleContactSubmission } from "../controllers/websiteContact/websiteContactController";
import { handleFormSubmission } from "../controllers/websiteContact/formSubmissionController";

const router = express.Router();

const formSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});

router.post("/contact", handleContactSubmission);
router.post("/form-submission", formSubmissionLimiter, handleFormSubmission);

export default router;
