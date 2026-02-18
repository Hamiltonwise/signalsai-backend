/**
 * Website Contact Form API Route (Public — no auth required)
 *
 * Handles contact form submissions from rendered sites at *.sites.getalloro.com.
 * Verifies reCAPTCHA, sanitizes input, builds HTML email, and forwards to n8n webhook.
 */

import express from "express";
import { handleContactSubmission } from "../controllers/websiteContact/websiteContactController";

const router = express.Router();

router.post("/contact", handleContactSubmission);

export default router;
