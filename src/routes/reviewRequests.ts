import express from "express";
import rateLimit from "express-rate-limit";
import { ReviewRequestModel } from "../models/ReviewRequestModel";
import { BehavioralEventModel } from "../models/BehavioralEventModel";
import { sendReviewRequestEmail } from "../emails/templates/ReviewRequestEmail";
import { sendSms, isSmsConfigured } from "../sms/smsService";

const reviewRequestRoutes = express.Router();

const sendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/; // E.164-ish: 7-15 digits

/**
 * POST /api/review-requests/send
 *
 * Send a review request via email or SMS.
 * Body: { recipientEmail?, recipientPhone?, recipientName?, placeId, practiceName, locationId? }
 * At least one of recipientEmail or recipientPhone is required.
 */
reviewRequestRoutes.post("/send", sendLimiter, async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { recipientEmail, recipientPhone, recipientName, placeId, locationId, practiceName } = req.body;

    if (!placeId) {
      return res.status(400).json({ success: false, error: "placeId is required to generate review link" });
    }

    // Determine delivery method
    const hasEmail = recipientEmail && EMAIL_REGEX.test(recipientEmail.trim());
    const rawPhone = recipientPhone?.replace(/[\s()-]/g, "").trim();
    const hasPhone = rawPhone && PHONE_REGEX.test(rawPhone);

    if (!hasEmail && !hasPhone) {
      return res.status(400).json({
        success: false,
        error: "A valid email or phone number is required",
      });
    }

    // Prefer SMS if phone provided and Twilio is configured, else email
    const deliveryMethod: "sms" | "email" =
      hasPhone && isSmsConfigured() ? "sms" : hasEmail ? "email" : "sms";

    if (deliveryMethod === "sms" && !isSmsConfigured()) {
      return res.status(400).json({
        success: false,
        error: "SMS is not configured. Please send via email instead.",
      });
    }

    // Enforce daily limit
    const todayCount = await ReviewRequestModel.countTodayByOrg(orgId);
    if (todayCount >= 20) {
      return res.status(429).json({
        success: false,
        error: "Daily limit reached (20 review requests per day)",
      });
    }

    const googleReviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;
    const baseUrl = process.env.APP_URL || "https://app.getalloro.com";

    // Create the record
    const request = await ReviewRequestModel.create({
      organization_id: orgId,
      location_id: locationId ?? null,
      place_id: placeId,
      recipient_email: hasEmail ? recipientEmail.trim() : null,
      recipient_phone: hasPhone ? rawPhone : null,
      recipient_name: recipientName?.trim() || null,
      delivery_method: deliveryMethod,
      google_review_url: googleReviewUrl,
    });

    const trackingUrl = `${baseUrl}/api/review-requests/track/${request.id}`;
    let messageId: string | undefined;

    // Send via chosen method
    if (deliveryMethod === "sms") {
      const pName = practiceName || "your practice";
      const smsBody = recipientName
        ? `Hi ${recipientName.trim()}, thank you for visiting ${pName}! We'd love your feedback. Leave a quick Google review: ${trackingUrl}`
        : `Thank you for visiting ${pName}! We'd love your feedback. Leave a quick Google review: ${trackingUrl}`;

      const smsResult = await sendSms(rawPhone!, smsBody);
      messageId = smsResult.messageId;

      if (!smsResult.success) {
        console.error(`[ReviewRequest] SMS failed: ${smsResult.error}`);
        // Don't fail the request — record is created, SMS just didn't go through
      }
    } else {
      const emailResult = await sendReviewRequestEmail({
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName?.trim() || null,
        practiceName: practiceName || "your practice",
        trackingUrl,
      });
      messageId = emailResult.messageId;
    }

    // Track event
    BehavioralEventModel.create({
      event_type: "review_request.sent",
      org_id: orgId,
      properties: {
        request_id: request.id,
        place_id: placeId,
        delivery_method: deliveryMethod,
        location_id: locationId ?? null,
      },
    }).catch(() => {});

    const dest = deliveryMethod === "sms" ? rawPhone : recipientEmail?.trim();
    console.log(`[ReviewRequest] ${deliveryMethod.toUpperCase()} sent to ${dest} for org ${orgId} (${request.id})`);

    return res.json({
      success: true,
      requestId: request.id,
      deliveryMethod,
      messageId,
      smsConfigured: isSmsConfigured(),
    });
  } catch (error: any) {
    console.error("[ReviewRequest] Send error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to send review request" });
  }
});

/**
 * GET /api/review-requests/track/:id
 *
 * Public — no auth. Patient clicks → marks clicked → redirects to Google review page.
 */
reviewRequestRoutes.get("/track/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ReviewRequestModel.findById(id);

    if (!request) {
      return res.redirect("https://www.google.com");
    }

    await ReviewRequestModel.markClicked(id);

    BehavioralEventModel.create({
      event_type: "review_request.clicked",
      org_id: request.organization_id,
      properties: {
        request_id: id,
        place_id: request.place_id,
        delivery_method: request.delivery_method,
      },
    }).catch(() => {});

    console.log(`[ReviewRequest] Clicked: ${id} (${request.delivery_method})`);
    return res.redirect(request.google_review_url);
  } catch (error: any) {
    console.error("[ReviewRequest] Track error:", error.message);
    return res.redirect("https://www.google.com");
  }
});

/**
 * GET /api/review-requests
 *
 * List review requests for the authenticated org + conversion stats.
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
      smsConfigured: isSmsConfigured(),
    });
  } catch (error: any) {
    console.error("[ReviewRequest] List error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to list review requests" });
  }
});

export default reviewRequestRoutes;
