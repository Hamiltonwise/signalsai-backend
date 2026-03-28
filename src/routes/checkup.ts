import express from "express";
import rateLimit from "express-rate-limit";
import {
  discoverCompetitorsViaPlaces,
  filterBySpecialty,
} from "../controllers/practice-ranking/feature-services/service.places-competitor-discovery";
import { filterByDriveTime } from "../utils/driveTimeMarket";
import bcrypt from "bcrypt";
import { OrganizationModel } from "../models/OrganizationModel";
import { UserModel } from "../models/UserModel";
import { OrganizationUserModel } from "../models/OrganizationUserModel";
import { generateReferralCode } from "../utils/referralCode";
import { generateToken } from "../controllers/auth-otp/feature-services/service.jwt-management";
import { sendCheckupResultEmail } from "../emails/templates/CheckupResultEmail";
import { BehavioralEventModel } from "../models/BehavioralEventModel";
import { analyzeReviewSentiment } from "../services/reviewSentiment";
import { db } from "../database/connection";
import { getMindsQueue } from "../workers/queues";

const checkupRoutes = express.Router();

// Rate limiters — protect Google Places API costs and email abuse
import {
  checkupAnalyzeLimiter as analyzeLimiter,
  checkupCreateAccountLimiter,
  scraperDetection,
} from "../middleware/publicRateLimiter";

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
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
checkupRoutes.post("/analyze", analyzeLimiter, scraperDetection, async (req, res) => {
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

    // Specialty-aware economics: use vertical avgCaseValue for dollar estimates
    const specialtyEconomics: Record<string, { avgCaseValue: number; conversionRate: number }> = {
      endodontist: { avgCaseValue: 1500, conversionRate: 0.03 },
      orthodontist: { avgCaseValue: 800, conversionRate: 0.025 },
      dentist: { avgCaseValue: 500, conversionRate: 0.02 },
      chiropractor: { avgCaseValue: 400, conversionRate: 0.025 },
      "physical therapist": { avgCaseValue: 350, conversionRate: 0.02 },
      optometrist: { avgCaseValue: 300, conversionRate: 0.02 },
      attorney: { avgCaseValue: 3000, conversionRate: 0.015 },
      veterinarian: { avgCaseValue: 250, conversionRate: 0.03 },
      "financial advisor": { avgCaseValue: 5000, conversionRate: 0.01 },
    };
    const specKey = specialty.toLowerCase();
    const econ = specialtyEconomics[specKey] || { avgCaseValue: 500, conversionRate: 0.02 };
    // Per-review dollar impact: each review gap costs a fraction of a case per month
    const perReviewImpact = Math.round(econ.avgCaseValue * econ.conversionRate * 12);
    // Per-star dollar impact: each 0.1 star gap reduces conversion
    const perStarImpact = Math.round(econ.avgCaseValue * 4);
    // Per-rank dollar impact: each position below #3 costs visibility
    const perRankImpact = Math.round(econ.avgCaseValue * 1.5);

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
    const specialtyFiltered = filterBySpecialty(allCompetitors, specialty);

    // Remove the practice itself from competitors
    const selfFiltered = specialtyFiltered.filter(
      (c) => c.placeId !== placeId && c.name.toLowerCase() !== name.toLowerCase()
    );

    // Filter by drive time — only competitors within specialty threshold
    const otherCompetitors = locationBias
      ? await filterByDriveTime(
          locationBias.lat,
          locationBias.lng,
          specialty,
          selfFiltered
        )
      : selfFiltered.map((c) => ({ ...c, driveTimeMinutes: 0 }));

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

    // --- Sub-scores: Market Rank /40, Rating vs Market /40, Review Volume /20 ---
    // Honest names for what we actually measure with Stage 1 (public) data.
    // Balanced: average business = 50-65. Leaders = 75-85. Struggling = 35-50.

    // Market Rank (0-40) — rank by review count among nearby competitors
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
    const reviewRatio = Math.min(1, clientReviews / maxReviews);
    // 60% rank, 40% reviews. Mid-pack with decent reviews = ~18/40.
    const localVisibility = Math.round(
      Math.min(40, Math.max(0, (rankPct * 0.6 + reviewRatio * 0.4) * 40))
    );

    // Rating vs Market (0-40) — star rating compared to market average
    const ratingDiff = clientRating - avgRating;
    // Baseline 0.42 (average = ~17/40). Beat average to go higher.
    // 4.5+ gets a small bonus (these are genuinely strong).
    const ratingPct = Math.min(1, Math.max(0,
      0.42 + ratingDiff * 0.3 + (clientRating >= 4.5 ? 0.05 : 0)
    ));
    const onlinePresence = Math.round(
      Math.min(40, Math.max(0, ratingPct * 40))
    );

    // Review Volume (0-20) — review count relative to market average
    // At average = 12/20. 1.5x average = 16/20. 2x+ = 20/20.
    const reviewHealthRaw = avgReviews > 0
      ? Math.pow(clientReviews / avgReviews, 0.5) // gentle diminishing returns
      : 0.4;
    const reviewHealth = Math.round(
      Math.min(20, Math.max(0, Math.min(1, reviewHealthRaw) * 20))
    );

    // Composite score (sum of sub-scores, 0-100)
    const compositeScore = localVisibility + onlinePresence + reviewHealth;

    // Score breakdown logged to behavioral_events, not console

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
        impact: Math.round(gap * perReviewImpact / 12), // specialty-adjusted annual impact
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
        impact: Math.round((avgRating - clientRating) * perStarImpact),
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
      impact: rank > 3 ? Math.round((rank - 3) * perRankImpact) : 0,
    });

    // Total estimated annual impact
    const totalImpact = findings.reduce((s, f) => s + f.impact, 0);

    // --- Gap-to-next: concrete closeable units ---
    // Find the competitor directly above client in the ranking
    const clientRankIndex = allWithClient.findIndex(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    const nextAbove = clientRankIndex > 0 ? allWithClient[clientRankIndex - 1] : null;
    const nextAboveFull = nextAbove
      ? otherCompetitors.find(
          (c) => c.name.toLowerCase() === nextAbove.name.toLowerCase()
        )
      : null;

    interface GapItem {
      id: string;
      label: string;
      current: number;
      target: number;
      unit: string;
      action: string;
      timeEstimate: string;
      competitorName: string | null;
      velocity?: {
        clientWeekly: number;
        competitorWeekly: number;
        weeksToPass: number | null;
        thisWeekAsk: number;
        competitorName: string;
      };
    }

    const gaps: GapItem[] = [];

    // Gap 1: Review Race — velocity-based model to pass next competitor
    if (nextAbove && nextAbove.reviewsCount > clientReviews) {
      const reviewsNeeded = nextAbove.reviewsCount - clientReviews + 1;

      // Estimate current velocity: assume ~2 year accumulation for both parties
      // With no real velocity data, estimate from total count
      const clientWeeklyVelocity = Math.max(0.2, clientReviews / 104); // ~2 years of weeks
      const competitorWeeklyVelocity = Math.max(0.2, nextAbove.reviewsCount / 104);

      // Net weekly gain needed: must outpace competitor's velocity + close the gap
      const netWeeklyGain = Math.max(0.1, clientWeeklyVelocity - competitorWeeklyVelocity);
      const weeksToPass = netWeeklyGain > 0
        ? Math.ceil(reviewsNeeded / netWeeklyGain)
        : null; // never catches up at current pace

      // This week's target: how many reviews to ask for this week
      const thisWeekAsk = Math.max(1, Math.ceil(competitorWeeklyVelocity + 1));

      gaps.push({
        id: "review_race",
        label: `${reviewsNeeded} review${reviewsNeeded !== 1 ? "s" : ""} to pass ${nextAbove.name}`,
        current: clientReviews,
        target: nextAbove.reviewsCount + 1,
        unit: "reviews",
        action: `Ask ${thisWeekAsk} customer${thisWeekAsk !== 1 ? "s" : ""} for a Google review this week. Start with your most recent happy customer — they remember you best.`,
        timeEstimate: weeksToPass
          ? weeksToPass <= 4 ? `~${weeksToPass} week${weeksToPass !== 1 ? "s" : ""} at current pace`
            : weeksToPass <= 12 ? `~${Math.ceil(weeksToPass / 4)} months at current pace`
            : `${Math.ceil(weeksToPass / 4)} months — increase to ${thisWeekAsk + 1}/week to cut that in half`
          : `You need to increase your review pace to close this gap`,
        competitorName: nextAbove.name,
        // Extra velocity fields for the frontend race display
        velocity: {
          clientWeekly: Math.round(clientWeeklyVelocity * 10) / 10,
          competitorWeekly: Math.round(competitorWeeklyVelocity * 10) / 10,
          weeksToPass,
          thisWeekAsk,
          competitorName: nextAbove.name,
        },
      });
    } else if (nextAbove) {
      // Client leads in reviews — show the lead
      const lead = clientReviews - nextAbove.reviewsCount;
      gaps.push({
        id: "review_race",
        label: `You lead ${nextAbove.name} by ${lead} review${lead !== 1 ? "s" : ""}`,
        current: clientReviews,
        target: nextAbove.reviewsCount,
        unit: "reviews",
        action: "Keep your pace up. One review per week maintains your lead.",
        timeEstimate: "Leading",
        competitorName: nextAbove.name,
        velocity: {
          clientWeekly: Math.round(Math.max(0.2, clientReviews / 104) * 10) / 10,
          competitorWeekly: Math.round(Math.max(0.2, nextAbove.reviewsCount / 104) * 10) / 10,
          weeksToPass: null,
          thisWeekAsk: 1,
          competitorName: nextAbove.name,
        },
      });
    }

    // Gap 2: Rating improvement needed
    if (clientRating < avgRating) {
      const starsNeeded = Math.round((avgRating - clientRating) * 10) / 10;
      gaps.push({
        id: "rating",
        label: `${starsNeeded} star improvement matches the market average`,
        current: clientRating,
        target: Math.round(avgRating * 10) / 10,
        unit: "stars",
        action: "Respond to every negative review within 24 hours. Ask satisfied customers to share their experience.",
        timeEstimate: starsNeeded <= 0.2 ? "1-2 months" : "3-6 months",
        competitorName: null,
      });
    }

    // Gap 4: GBP completeness (we know if they have website/phone from Places data)
    const missingGbpItems: string[] = [];
    if (!req.body.websiteUri) missingGbpItems.push("website");
    if (!req.body.phone) missingGbpItems.push("phone number");
    if (missingGbpItems.length > 0) {
      gaps.push({
        id: "gbp_completeness",
        label: `Add your ${missingGbpItems.join(" and ")} to your Google Business Profile`,
        current: 0,
        target: missingGbpItems.length,
        unit: "items",
        action: `Log into Google Business Profile and add your ${missingGbpItems.join(" and ")}. Complete profiles rank higher.`,
        timeEstimate: "10 minutes",
        competitorName: null,
      });
    }

    // Review sentiment analysis: the "how did they know that" finding
    // Runs in parallel with gap calculations. Non-blocking: if it fails, checkup still works.
    let sentimentInsight = null;
    if (placeId) {
      try {
        sentimentInsight = await analyzeReviewSentiment(
          placeId,
          name,
          topCompetitor?.placeId || null,
          topCompetitor?.name || null,
          specialty,
        );
        if (sentimentInsight) {
          findings.push({
            type: "sentiment_insight",
            title: sentimentInsight.title,
            detail: sentimentInsight.detail,
            value: 0,
            impact: 0,
          });
        }
      } catch (err: any) {
        console.error("[Checkup] Sentiment analysis failed (non-blocking):", err.message);
      }
    }

    console.log(
      `[Checkup] Score: ${compositeScore} | Competitors: ${otherCompetitors.length} | Top: ${topCompetitor?.name || "none"}${sentimentInsight ? " | Sentiment: ✓" : ""}`
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
        driveTimeMinutes: (c as any).driveTimeMinutes ?? null,
      })),
      findings,
      sentimentInsight: sentimentInsight || null,
      totalImpact,
      market: {
        city,
        totalCompetitors: otherCompetitors.length,
        avgRating: Math.round(avgRating * 10) / 10,
        avgReviews: Math.round(avgReviews),
        rank,
      },
      gaps,
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

/**
 * POST /api/checkup/create-account
 *
 * Streamlined account creation from the Checkup gate.
 * Creates user + org + returns JWT. No email verification.
 * If email exists: returns token for existing account (auto-login).
 */
checkupRoutes.post("/create-account", checkupCreateAccountLimiter, async (req, res) => {
  try {
    const {
      email,
      password,
      practice_name,
      place_id,
      relationship,
      checkup_score,
      checkup_data,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: "Invalid email format" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists -- if so, verify password and return token
    const existing = await UserModel.findByEmail(normalizedEmail);
    if (existing) {
      if (!existing.password_hash) {
        return res.status(409).json({
          success: false,
          error: "Account exists via Google sign-in. Please sign in with Google.",
          existingAccount: true,
        });
      }
      const passwordMatch = await bcrypt.compare(password, existing.password_hash);
      if (!passwordMatch) {
        return res.status(409).json({
          success: false,
          error: "An account with this email already exists. Sign in instead.",
          existingAccount: true,
        });
      }
      // Password matches -- auto-login
      const token = generateToken(existing.id, normalizedEmail, true);
      return res.json({ success: true, token, userId: existing.id, existingAccount: true });
    }

    // Create user + org + link in a transaction (prevents orphan records)
    const passwordHash = await bcrypt.hash(password, 10);
    const { user, org } = await db.transaction(async (trx) => {
      const newUser = await UserModel.create({
        email: normalizedEmail,
        password_hash: passwordHash,
      }, trx);

      // Mark email as verified (skip verification for Checkup gate)
      await trx("users").where({ id: newUser.id }).update({ email_verified: true });

      // Create organization
      const newOrg = await OrganizationModel.create({
        name: practice_name || `${normalizedEmail.split("@")[0]}'s Practice`,
        referral_code: generateReferralCode(),
      }, trx);

      // Set source_channel from referral or source query param
      const sourceChannel = req.body.source_channel || req.query.ref || req.query.source || null;
      if (sourceChannel) {
        await trx("organizations").where({ id: newOrg.id }).update({ source_channel: sourceChannel });
      }

      // Store checkup data on org for dashboard pre-population
      if (checkup_score || checkup_data || place_id) {
        const checkupUpdates: Record<string, any> = {};
        if (checkup_score) checkupUpdates.checkup_score = checkup_score;
        if (checkup_data) checkupUpdates.checkup_data = JSON.stringify(checkup_data);
        if (checkup_data?.topCompetitor?.name) {
          checkupUpdates.top_competitor_name = checkup_data.topCompetitor.name;
        }
        // Baseline review count for First Win Attribution (WO-22)
        if (checkup_data?.reviewCount != null) {
          checkupUpdates.checkup_review_count_at_creation = checkup_data.reviewCount;
        }
        // Session key links this org back to the checkup session
        if (req.body.session_id) {
          checkupUpdates.session_checkup_key = req.body.session_id;
        }
        // Also keep business_data for backward compat
        checkupUpdates.business_data = JSON.stringify({
          checkup_score,
          checkup_place_id: place_id,
          checkup_relationship: relationship,
          checkup_data: checkup_data || null,
        });

        await trx("organizations").where({ id: newOrg.id }).update(checkupUpdates);
      }

      // Link user to org
      await OrganizationUserModel.create({
        organization_id: newOrg.id,
        user_id: newUser.id,
        role: "admin",
      }, trx);

      return { user: newUser, org: newOrg };
    });

    // Generate JWT
    const token = generateToken(user.id, normalizedEmail, true);

    // Track event
    BehavioralEventModel.create({
      event_type: "checkup.account_created",
      org_id: org.id,
      properties: {
        practice_name,
        place_id,
        relationship,
        checkup_score,
      },
    }).catch(() => {});

    console.log(`[Checkup] Account created: ${normalizedEmail} -> org ${org.id}`);

    // Enqueue PatientPath build pipeline (Phase 1: research)
    try {
      const ppQueue = getMindsQueue("patientpath-build");
      await ppQueue.add(
        `patientpath:build:${org.id}`,
        { orgId: org.id, placeId: place_id || undefined },
        { jobId: `patientpath-build-${org.id}`, attempts: 3, backoff: { type: "exponential", delay: 30000 } }
      );
      console.log(`[Checkup] PatientPath build enqueued for org ${org.id}`);
    } catch (ppErr: any) {
      console.error(`[Checkup] Failed to enqueue PatientPath build:`, ppErr.message);
    }

    // Seed initial weekly_ranking_snapshot so the first Monday email has data.
    // Frontend sends checkup_data as: { score, topCompetitor (object or string), market, findingSummary, placeId, reviewCount }
    try {
      const parsed = typeof checkup_data === "string" ? JSON.parse(checkup_data) : checkup_data;
      if (parsed) {
        const tc = parsed.topCompetitor;
        const competitorName = typeof tc === "string" ? tc : tc?.name || null;
        const competitorReviewCount = typeof tc === "object" && tc?.reviewCount ? tc.reviewCount : null;
        const clientReviewCount = parsed.reviewCount || 0;
        const marketRank = parsed.market?.rank ?? null;
        const marketCity = parsed.market?.city || "your area";
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());

        await db("weekly_ranking_snapshots").insert({
          org_id: org.id,
          week_start: weekStart.toISOString().split("T")[0],
          position: marketRank,
          keyword: `${practice_name || "specialist"} in ${marketCity}`,
          bullets: JSON.stringify([
            `Your practice scored ${checkup_score || "N/A"} on the Business Health Checkup.`,
            competitorName ? `${competitorName} leads your market with ${competitorReviewCount || "many"} reviews.` : "Competitor data is being gathered for your market.",
            "Your full competitive analysis is building now. More insights next Monday.",
          ]),
          finding_headline: parsed.findingSummary || "Your competitive landscape is being analyzed",
          competitor_name: competitorName,
          competitor_review_count: competitorReviewCount,
          client_review_count: clientReviewCount,
          dollar_figure: parsed.totalImpact || null,
        }).catch(() => {
          // Unique constraint may fire if snapshot already exists for this week
        });
        console.log(`[Checkup] Seeded initial ranking snapshot for org ${org.id}`);
      }
    } catch (snapErr: any) {
      console.error(`[Checkup] Failed to seed snapshot:`, snapErr.message);
    }

    // Enqueue Welcome Intelligence (fires 4 hours later with new insights)
    try {
      const parsed = typeof checkup_data === "string" ? JSON.parse(checkup_data) : checkup_data;
      const wiQueue = getMindsQueue("welcome-intelligence");
      await wiQueue.add(
        `welcome:intel:${org.id}`,
        {
          orgId: org.id,
          userId: user.id,
          email: normalizedEmail,
          practiceName: practice_name || "your practice",
          placeId: place_id || null,
          specialty: parsed?.market?.specialty || null,
          city: parsed?.market?.city || null,
          stateAbbr: parsed?.market?.stateAbbr || null,
          checkupScore: checkup_score || null,
          topCompetitorName: typeof parsed?.topCompetitor === "string"
            ? parsed.topCompetitor
            : parsed?.topCompetitor?.name || null,
        },
        {
          jobId: `welcome-intel-${org.id}`,
          delay: 4 * 60 * 60 * 1000, // 4 hours
          attempts: 2,
          backoff: { type: "exponential", delay: 60000 },
        }
      );
      console.log(`[Checkup] Welcome Intelligence enqueued for org ${org.id} (fires in 4h)`);
    } catch (wiErr: any) {
      console.error(`[Checkup] Failed to enqueue Welcome Intelligence:`, wiErr.message);
    }

    // Queue Week 1 Win job (24 hours after signup)
    try {
      const w1Queue = getMindsQueue("week1-win");
      await w1Queue.add(
        `week1:win:${org.id}`,
        { orgId: org.id },
        {
          jobId: `week1-win-${org.id}`,
          delay: 24 * 60 * 60 * 1000, // 24 hours
          attempts: 2,
          backoff: { type: "exponential", delay: 60000 },
        }
      );
      console.log(`[Checkup] Week 1 Win enqueued for org ${org.id} (fires in 24h)`);
    } catch (w1Err: any) {
      console.error(`[Checkup] Failed to enqueue Week 1 Win:`, w1Err.message);
    }

    return res.json({
      success: true,
      token,
      userId: user.id,
      organizationId: org.id,
      existingAccount: false,
    });
  } catch (error: any) {
    console.error("[Checkup] Create account error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to create account" });
  }
});

/**
 * PATCH /api/checkup/first-login
 * Sets first_login_at on the org if not already set. Requires auth.
 */
checkupRoutes.patch("/first-login", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

    await db("organizations")
      .where({ id: orgId })
      .whereNull("first_login_at")
      .update({ first_login_at: new Date() });

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[TTFV] First login error:", error.message);
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

/**
 * PATCH /api/checkup/ttfv
 * Records TTFV response. Body: { response: 'yes' | 'not_yet' }
 */
checkupRoutes.patch("/ttfv", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

    const { response } = req.body;
    if (response !== "yes" && response !== "not_yet") {
      return res.status(400).json({ success: false, error: "Invalid response" });
    }

    await db("organizations")
      .where({ id: orgId })
      .whereNull("ttfv_response")
      .update({ ttfv_response: response, ttfv_responded_at: new Date() });

    BehavioralEventModel.create({
      event_type: `ttfv.${response}`,
      org_id: orgId,
    }).catch(() => {});

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[TTFV] Response error:", error.message);
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

/**
 * PATCH /api/checkup/billing-prompt-shown
 * Sets billing_prompt_shown_at so it doesn't show again.
 */
checkupRoutes.patch("/billing-prompt-shown", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

    await db("organizations")
      .where({ id: orgId })
      .whereNull("billing_prompt_shown_at")
      .update({ billing_prompt_shown_at: new Date() });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

/**
 * GET /api/checkup/ttfv-status
 * Returns TTFV state for the authenticated org.
 */
checkupRoutes.get("/ttfv-status", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

    const org = await db("organizations")
      .where({ id: orgId })
      .select("first_login_at", "ttfv_response", "billing_prompt_shown_at", "subscription_status")
      .first();

    if (!org) return res.status(404).json({ success: false });

    return res.json({
      success: true,
      firstLoginAt: org.first_login_at,
      ttfvResponse: org.ttfv_response,
      billingPromptShownAt: org.billing_prompt_shown_at,
      showTtfv: !!org.first_login_at && !org.ttfv_response,
      showBilling: org.ttfv_response === "yes" && !org.billing_prompt_shown_at && org.subscription_status !== "active",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

/**
 * POST /api/checkup/vendor
 * Saves vendor email from the Checkup gate Vendor Path.
 */
checkupRoutes.post("/vendor", async (req, res) => {
  try {
    const { email, referring_place_id, wants_checkup_for_other_practices } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "Email required" });

    await db("vendors")
      .insert({
        email: email.toLowerCase().trim(),
        referring_place_id: referring_place_id || null,
        wants_checkup_for_other_practices: !!wants_checkup_for_other_practices,
      })
      .onConflict("email")
      .merge({ referring_place_id, wants_checkup_for_other_practices });

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Checkup] Vendor save error:", error.message);
    return res.json({ success: true }); // Never fail visibly
  }
});

/**
 * POST /api/checkup/share
 *
 * Generate a shareable checkup result card.
 * Input: score, market city, rank, totalCompetitors, topCompetitorName
 * Returns: share_id that resolves to a public card at /checkup/shared/:id
 *
 * This is the viral loop. Every checkup becomes a distribution event.
 */
checkupRoutes.post("/share", async (req, res) => {
  try {
    const { score, city, rank, totalCompetitors, topCompetitorName, specialty } = req.body;

    if (!score || !city) {
      return res.status(400).json({ success: false, error: "Score and city required" });
    }

    // Generate a unique share ID (URL-safe, 10 chars)
    const shareId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 10);

    // Store the shareable card data (no PII, no practice name, just market data)
    await db("checkup_shares").insert({
      share_id: shareId,
      score: Math.round(score),
      city,
      specialty: specialty || null,
      rank: rank || null,
      total_competitors: totalCompetitors || null,
      top_competitor_name: topCompetitorName || null,
      created_at: new Date(),
    });

    return res.json({
      success: true,
      shareId,
      shareUrl: `${process.env.APP_URL || "https://app.getalloro.com"}/checkup/shared/${shareId}`,
    });
  } catch (error: any) {
    console.error("[Checkup] Share error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to create share link" });
  }
});

/**
 * GET /api/checkup/shared/:shareId
 *
 * Public endpoint. Returns the shareable card data.
 * No auth required. No PII exposed.
 */
checkupRoutes.get("/shared/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;

    const share = await db("checkup_shares")
      .where({ share_id: shareId })
      .first();

    if (!share) {
      return res.status(404).json({ success: false, error: "Share not found" });
    }

    // Increment view count
    db("checkup_shares")
      .where({ share_id: shareId })
      .increment("views", 1)
      .catch(() => {}); // fire-and-forget

    return res.json({
      success: true,
      card: {
        score: share.score,
        city: share.city,
        specialty: share.specialty,
        rank: share.rank,
        totalCompetitors: share.total_competitors,
        topCompetitorName: share.top_competitor_name,
      },
    });
  } catch (error: any) {
    console.error("[Checkup] Shared get error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to load share" });
  }
});

export default checkupRoutes;
