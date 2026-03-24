import express from "express";
import rateLimit from "express-rate-limit";
import { ReviewRequestModel } from "../models/ReviewRequestModel";
import { BehavioralEventModel } from "../models/BehavioralEventModel";
import { sendReviewRequestEmail } from "../emails/templates/ReviewRequestEmail";

const reviewRequestRoutes = express.Router();

// Rate limit: 20 requests per org per day enforced in handler,
// plus IP-based limit as a safety net
const sendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." },
});

/**
 * POST /api/review-requests/send
 *
 * Send a review request email to a patient.
 * Requires auth (organization context from middleware).
 */
reviewRequestRoutes.post("/send", sendLimiter, async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { recipientEmail, recipientName, placeId, locationId } = req.body;

    if (!recipientEmail || typeof recipientEmail !== "string") {
      return res.status(400).json({ success: false, error: "recipientEmail is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(recipientEmail.trim())) {
      return res.status(400).json({ success: false, error: "Invalid email format" });
    }

    if (!placeId) {
      return res.status(400).json({ success: false, error: "placeId is required to generate review link" });
    }

    // Enforce daily limit per org
    const todayCount = await ReviewRequestModel.countTodayByOrg(orgId);
    if (todayCount >= 20) {
      return res.status(429).json({
        success: false,
        error: "Daily limit reached (20 review requests per day)",
      });
    }

    const googleReviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;

    // Create the request record
    const request = await ReviewRequestModel.create({
      organization_id: orgId,
      location_id: locationId ?? null,
      place_id: placeId,
      recipient_email: recipientEmail.trim(),
      recipient_name: recipientName?.trim() || null,
      google_review_url: googleReviewUrl,
    });

    // Build tracking URL — when patient clicks, it marks the request as clicked
    // then redirects to the actual Google review page
    const baseUrl = process.env.APP_URL || "https://app.getalloro.com";
    const trackingUrl = `${baseUrl}/api/review-requests/track/${request.id}`;

    // Send the email
    const emailResult = await sendReviewRequestEmail({
      recipientEmail: recipientEmail.trim(),
      recipientName: recipientName?.trim() || null,
      practiceName: req.body.practiceName || "your practice",
      trackingUrl,
    });

    // Track behavioral event
    BehavioralEventModel.create({
      event_type: "review_request.sent",
      org_id: orgId,
      properties: {
        request_id: request.id,
        place_id: placeId,
        location_id: locationId ?? null,
      },
    }).catch(() => {}); // fire-and-forget

    console.log(`[ReviewRequest] Sent to ${recipientEmail} for org ${orgId} (${request.id})`);

    return res.json({
      success: true,
      requestId: request.id,
      messageId: emailResult.messageId,
    });
  } catch (error: any) {
    console.error("[ReviewRequest] Send error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to send review request" });
  }
});

/**
 * GET /api/review-requests/track/:id
 *
 * Public endpoint — no auth. Called when patient clicks the review link in the email.
 * Marks the request as "clicked" and redirects to the Google review page.
 */
reviewRequestRoutes.get("/track/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ReviewRequestModel.findById(id);

    if (!request) {
      // Still redirect to Google search — don't break the user experience
      return res.redirect("https://www.google.com");
    }

    // Mark as clicked
    await ReviewRequestModel.markClicked(id);

    // Track behavioral event
    BehavioralEventModel.create({
      event_type: "review_request.clicked",
      org_id: request.organization_id,
      properties: {
        request_id: id,
        place_id: request.place_id,
      },
    }).catch(() => {});

    console.log(`[ReviewRequest] Clicked: ${id}`);

    // Redirect to Google review page
    return res.redirect(request.google_review_url);
  } catch (error: any) {
    console.error("[ReviewRequest] Track error:", error.message);
    return res.redirect("https://www.google.com");
  }
});

/**
 * GET /api/review-requests
 *
 * List review requests for the authenticated org.
 * Returns requests + conversion stats.
 */
reviewRequestRoutes.get("/", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const [{ requests, total }, stats] = await Promise.all([
      ReviewRequestModel.listByOrganization(orgId, limit, offset),
      ReviewRequestModel.getStats(orgId),
    ]);

    return res.json({
      success: true,
      requests,
      total,
      stats,
    });
  } catch (error: any) {
    console.error("[ReviewRequest] List error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to list review requests" });
  }
});

export default reviewRequestRoutes;
