import express from "express";
import rateLimit from "express-rate-limit";
import {
  discoverCompetitorsViaPlaces,
  filterBySpecialty,
} from "../controllers/practice-ranking/feature-services/service.places-competitor-discovery";
import { OrganizationModel } from "../models/OrganizationModel";
import { sendCheckupResultEmail } from "../emails/templates/CheckupResultEmail";
import { BehavioralEventModel } from "../models/BehavioralEventModel";

const checkupRoutes = express.Router();

// Rate limiters — protect Google Places API costs and email abuse
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 analyses per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again in a few minutes." },
});

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,                    // 5 emails per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." },
});

/**
 * POST /api/checkup/analyze
 *
 * Runs a competitor analysis for the Free Referral Base Checkup.
 * Takes a practice's Place details, discovers competitors via Google Places,
 * and returns a Business Health Score with sub-scores.
 *
 * Body: { name, city, state, category, types, rating, reviewCount, placeId }
 */
checkupRoutes.post("/analyze", analyzeLimiter, async (req, res) => {
  try {
    const { name, city, state, category, types, rating, reviewCount, placeId, location } =
      req.body;

    if (!name || !city) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, city",
      });
    }

    const marketLocation = state ? `${city}, ${state}` : city;
    const specialty = category || "dentist";

    // Build location bias from practice coordinates (25-mile radius)
    const locationBias = location?.latitude && location?.longitude
      ? { lat: location.latitude, lng: location.longitude, radiusMeters: 40234 }
      : undefined;

    console.log(
      `[Checkup] Analyzing: ${name} in ${marketLocation} (${specialty})${locationBias ? ` [${locationBias.lat.toFixed(4)},${locationBias.lng.toFixed(4)}]` : " [no coordinates]"}`
    );

    // Discover competitors — biased to practice's actual location
    const allCompetitors = await discoverCompetitorsViaPlaces(
      specialty,
      marketLocation,
      15,
      locationBias
    );

    // Filter to relevant specialty
    const competitors = filterBySpecialty(allCompetitors, specialty);

    // Remove the practice itself from competitors
    const otherCompetitors = competitors.filter(
      (c) => c.placeId !== placeId && c.name.toLowerCase() !== name.toLowerCase()
    );

    // --- Score Calculation ---
    const clientRating = rating ?? 0;
    const clientReviews = reviewCount ?? 0;

    // Competitor averages
    const compCount = otherCompetitors.length || 1;
    const avgRating =
      otherCompetitors.reduce((s, c) => s + c.totalScore, 0) / compCount;
    const avgReviews =
      otherCompetitors.reduce((s, c) => s + c.reviewsCount, 0) / compCount;
    const maxReviews = Math.max(
      ...otherCompetitors.map((c) => c.reviewsCount),
      1
    );

    // --- Sub-scores (WO4 spec: Local Visibility /40, Online Presence /40, Review Health /20) ---

    // Local Visibility (0-40) — rank in market + review volume relative to competitors
    const allWithClient = [
      { name, reviewsCount: clientReviews, totalScore: clientRating },
      ...otherCompetitors,
    ].sort((a, b) => {
      if (b.reviewsCount !== a.reviewsCount)
        return b.reviewsCount - a.reviewsCount;
      return b.totalScore - a.totalScore;
    });
    const rank =
      allWithClient.findIndex(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      ) + 1;
    const totalInMarket = allWithClient.length;
    const rankPct = (totalInMarket - rank) / Math.max(totalInMarket - 1, 1);
    const reviewRatio = clientReviews / maxReviews;
    const localVisibility = Math.round(
      Math.min(40, Math.max(0, (rankPct * 0.5 + reviewRatio * 0.5) * 40))
    );

    // Online Presence (0-40) — rating relative to competitors + website presence
    const ratingDiff = clientRating - avgRating;
    const ratingPct = Math.min(1, Math.max(0, 0.5 + ratingDiff * 0.2 + (clientRating >= 4.5 ? 0.1 : 0)));
    const onlinePresence = Math.round(
      Math.min(40, Math.max(0, ratingPct * 40))
    );

    // Review Health (0-20) — review count vs market average
    const reviewHealthPct = avgReviews > 0 ? Math.min(1, clientReviews / avgReviews) : 0.5;
    const reviewHealth = Math.round(
      Math.min(20, Math.max(0, reviewHealthPct * 20))
    );

    // Composite score (sum of sub-scores, 0-100)
    const compositeScore = localVisibility + onlinePresence + reviewHealth;

    // Top competitor (for blur gate CTA)
    const topCompetitor = otherCompetitors[0] || null;

    // Build findings
    const findings = [];

    // Finding 1: Review gap
    if (topCompetitor && topCompetitor.reviewsCount > clientReviews) {
      const gap = topCompetitor.reviewsCount - clientReviews;
      findings.push({
        type: "review_gap",
        title: "Review Gap",
        detail: `${topCompetitor.name} has ${gap} more reviews than you`,
        value: gap,
        impact: Math.round(gap * 45), // ~$45 per review in estimated value
      });
    } else {
      findings.push({
        type: "review_lead",
        title: "Review Leadership",
        detail: `You lead your market in review count`,
        value: clientReviews,
        impact: 0,
      });
    }

    // Finding 2: Rating comparison
    if (clientRating < avgRating) {
      findings.push({
        type: "rating_gap",
        title: "Rating Below Average",
        detail: `Your ${clientRating}★ rating is below the market average of ${avgRating.toFixed(1)}★`,
        value: avgRating - clientRating,
        impact: Math.round((avgRating - clientRating) * 2400),
      });
    } else {
      findings.push({
        type: "rating_strong",
        title: "Strong Rating",
        detail: `Your ${clientRating}★ rating ${clientRating > avgRating ? "beats" : "matches"} the market average of ${avgRating.toFixed(1)}★`,
        value: clientRating - avgRating,
        impact: 0,
      });
    }

    // Finding 3: Market position
    findings.push({
      type: "market_rank",
      title: "Market Position",
      detail: `You rank #${rank} of ${totalInMarket} ${specialty}s in ${city}`,
      value: rank,
      impact: rank > 3 ? Math.round((rank - 3) * 1800) : 0,
    });

    // Total estimated annual impact
    const totalImpact = findings.reduce((s, f) => s + f.impact, 0);

    console.log(
      `[Checkup] Score: ${compositeScore} | Competitors: ${otherCompetitors.length} | Top: ${topCompetitor?.name || "none"}`
    );

    return res.json({
      success: true,
      score: {
        composite: compositeScore,
        visibility: localVisibility,
        reputation: onlinePresence,
        competitive: reviewHealth,
      },
      topCompetitor: topCompetitor
        ? {
            name: topCompetitor.name,
            rating: topCompetitor.totalScore,
            reviewCount: topCompetitor.reviewsCount,
            placeId: topCompetitor.placeId,
            location: topCompetitor.location,
          }
        : null,
      competitors: otherCompetitors.slice(0, 5).map((c) => ({
        name: c.name,
        rating: c.totalScore,
        reviewCount: c.reviewsCount,
        placeId: c.placeId,
        location: c.location,
      })),
      findings,
      totalImpact,
      market: {
        city,
        totalCompetitors: otherCompetitors.length,
        avgRating: Math.round(avgRating * 10) / 10,
        avgReviews: Math.round(avgReviews),
        rank,
      },
    });
  } catch (error: any) {
    console.error("[Checkup] Analysis error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Analysis failed. Please try again.",
    });
  }
});

/**
 * GET /api/checkup/referral/:code
 *
 * Validates a referral code and returns the referring org name.
 * Used by the Checkup entry screen when ?ref= is present.
 */
checkupRoutes.get("/referral/:code", async (req, res) => {
  try {
    const { code } = req.params;
    if (!code || code.length !== 8) {
      return res.json({ success: false, valid: false });
    }

    const org = await OrganizationModel.findByReferralCode(code.toUpperCase());
    if (!org) {
      return res.json({ success: true, valid: false });
    }

    return res.json({
      success: true,
      valid: true,
      referrerOrgId: org.id,
      referrerName: org.name,
    });
  } catch (error: any) {
    console.error("[Checkup] Referral lookup error:", error.message);
    return res.json({ success: false, valid: false });
  }
});

/**
 * POST /api/checkup/email
 *
 * Sends the checkup result email to the prospect.
 * Called from the blur gate email capture on ResultsScreen.
 * Must deliver in under 60 seconds (WO7).
 */
checkupRoutes.post("/email", emailLimiter, async (req, res) => {
  try {
    const {
      email,
      practiceName,
      city,
      compositeScore,
      topCompetitorName,
      topCompetitorReviews,
      practiceReviews,
      finding,
      rank,
      totalCompetitors,
    } = req.body;

    if (!email || !practiceName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: email, practiceName",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
      });
    }

    console.log(`[Checkup] Sending result email to ${email} for ${practiceName}`);

    const result = await sendCheckupResultEmail({
      recipientEmail: email,
      practiceName,
      city: city || "",
      compositeScore: compositeScore || 0,
      topCompetitorName: topCompetitorName || null,
      topCompetitorReviews: topCompetitorReviews || null,
      practiceReviews: practiceReviews || 0,
      finding: finding || "",
      rank: rank || 0,
      totalCompetitors: totalCompetitors || 0,
    });

    if (result.success) {
      console.log(`[Checkup] Result email sent to ${email}`);

      // Track: result_email.sent (no PII — no email address stored)
      BehavioralEventModel.create({
        event_type: "result_email.sent",
        session_id: req.body.sessionId || null,
        properties: {
          practice_name: practiceName,
          city,
          score: compositeScore,
          competitor_name: topCompetitorName || null,
          subject: topCompetitorName
            ? `Your score vs ${topCompetitorName} in ${city}`
            : `Your Business Health Score: ${compositeScore}`,
        },
      }).catch(() => {}); // Fire-and-forget

      return res.json({ success: true, messageId: result.messageId });
    } else {
      console.error(`[Checkup] Email send failed: ${result.error}`);
      return res.status(500).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error("[Checkup] Email error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to send email. Please try again.",
    });
  }
});

/**
 * POST /api/checkup/build-trigger
 *
 * Triggers ClearPath website build after email capture.
 * Logs intent to behavioral_events. In production, kicks off the pipeline.
 * For now: logs the intent, returns queued status.
 */
checkupRoutes.post("/build-trigger", emailLimiter, async (req, res) => {
  try {
    const { email, placeId, practiceName, specialty, city } = req.body;

    if (!practiceName) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: practiceName",
      });
    }

    console.log(`[Checkup] ClearPath build triggered for ${practiceName}`);

    // Log the build request (no PII — email not stored in properties)
    await BehavioralEventModel.create({
      event_type: "clearpath.build_triggered",
      session_id: req.body.sessionId || null,
      properties: {
        place_id: placeId,
        practice_name: practiceName,
        specialty: specialty || null,
        city: city || null,
      },
    });

    return res.json({
      success: true,
      status: "queued",
      estimated_minutes: 60,
    });
  } catch (error: any) {
    console.error("[Checkup] Build trigger error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Build trigger failed.",
    });
  }
});

/**
 * POST /api/checkup/track
 *
 * Records a behavioral event from the checkup flow.
 * No PII. No patient data. Only behavioral signals.
 */
checkupRoutes.post("/track", async (req, res) => {
  try {
    const { eventType, sessionId, properties } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, error: "Missing eventType" });
    }

    await BehavioralEventModel.create({
      event_type: eventType,
      session_id: sessionId || null,
      properties: properties || {},
    });

    return res.json({ success: true });
  } catch (error: any) {
    // Never block the user flow for tracking failures
    console.error("[Checkup] Track error:", error.message);
    return res.json({ success: true });
  }
});

export default checkupRoutes;
