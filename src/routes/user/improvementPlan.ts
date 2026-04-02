/**
 * Score Improvement Plan API
 *
 * GET /api/user/improvement-plan
 *
 * Analyzes the org's checkup data and sub-scores to generate
 * the top 3 actionable improvements with estimated point gains.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const improvementPlanRoutes = express.Router();

interface ImprovementAction {
  action: string;
  subScore: string;
  currentPoints: number;
  maxPoints: number;
  estimatedGain: number;
  difficulty: "easy" | "medium" | "hard";
  timeEstimate: string;
  id: string;
}

improvementPlanRoutes.get(
  "/improvement-plan",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.status(401).json({ success: false, error: "Auth required" });
      }

      const org = await db("organizations")
        .where({ id: orgId })
        .select("checkup_data", "checkup_score", "top_competitor_name")
        .first();

      if (!org?.checkup_data) {
        return res.json({
          success: true,
          actions: [],
          totalPotentialGain: 0,
          currentScore: null,
          estimatedNewScore: null,
        });
      }

      const data = typeof org.checkup_data === "string"
        ? JSON.parse(org.checkup_data)
        : org.checkup_data;

      // Extract sub-scores from checkup data
      const score = data?.score ?? {};
      const trustSignal = score.trustSignal ?? score.visibility ?? 0;
      const firstImpression = score.firstImpression ?? score.reputation ?? 0;
      const responsiveness = score.responsiveness ?? score.competitive ?? 0;
      const competitiveEdge = score.competitiveEdge ?? 0;
      const composite = score.composite ?? org.checkup_score ?? 0;

      // Extract profile data from checkup
      const place = data?.place ?? {};
      const photoCount = place.photoCount ?? place.photos ?? 0;
      const reviewCount = place.reviewCount ?? 0;
      const lastReviewDaysAgo = data?.lastReviewDaysAgo ?? 999;
      const hasDescription = !!place.editorialSummary;
      const hasHours = !!place.hours || !!place.hasHours;
      const hasPhone = !!place.phone;
      const hasWebsite = !!place.website;

      // Market data
      const market = data?.market ?? {};
      const topCompetitor = data?.topCompetitor ?? null;

      // Build all possible improvement actions
      const allActions: ImprovementAction[] = [];

      // 1. Low photos
      if (photoCount < 8) {
        const gap = 30 - firstImpression;
        const gain = Math.min(gap, photoCount < 2 ? 6 : photoCount < 5 ? 5 : 4);
        if (gain > 0) {
          allActions.push({
            id: "add_photos",
            action: `Add ${Math.max(1, 8 - photoCount)} photos to your Google profile showing your office, team, and equipment. You have ${photoCount}. Businesses with 8 or more get significantly more profile views.`,
            subScore: "First Impression",
            currentPoints: firstImpression,
            maxPoints: 30,
            estimatedGain: gain,
            difficulty: "easy",
            timeEstimate: "15 minutes",
          });
        }
      }

      // 2. No description / editorial summary
      if (!hasDescription) {
        const gap = 30 - firstImpression;
        const gain = Math.min(gap, 3);
        if (gain > 0) {
          allActions.push({
            id: "add_description",
            action: "Add a business description to your Google profile. This helps prospects understand what makes you different before they call.",
            subScore: "First Impression",
            currentPoints: firstImpression,
            maxPoints: 30,
            estimatedGain: gain,
            difficulty: "easy",
            timeEstimate: "5 minutes",
          });
        }
      }

      // 3. Stale reviews (>30 days)
      if (lastReviewDaysAgo > 30) {
        const gap = 30 - trustSignal;
        const gain = Math.min(gap, lastReviewDaysAgo > 60 ? 8 : 4);
        if (gain > 0) {
          allActions.push({
            id: "fresh_reviews",
            action: "Ask your 3 most recent clients for a Google review. Fresh reviews signal an active, thriving business to prospects.",
            subScore: "Trust Signal",
            currentPoints: trustSignal,
            maxPoints: 30,
            estimatedGain: gain,
            difficulty: "easy",
            timeEstimate: "10 minutes",
          });
        }
      }

      // 4. Low review volume
      const avgReviews = market.avgReviews ?? 0;
      if (avgReviews > 0 && reviewCount < avgReviews) {
        const gap = 30 - trustSignal;
        const gain = Math.min(gap, reviewCount < avgReviews * 0.5 ? 5 : 3);
        if (gain > 0) {
          allActions.push({
            id: "review_volume",
            action: `You have ${reviewCount} reviews. Top businesses in your area have ${Math.round(avgReviews)}. Request 2-3 reviews per week to close the gap.`,
            subScore: "Trust Signal",
            currentPoints: trustSignal,
            maxPoints: 30,
            estimatedGain: gain,
            difficulty: "medium",
            timeEstimate: "Ongoing",
          });
        }
      }

      // 5. No hours listed
      if (!hasHours) {
        const gap = 30 - firstImpression;
        const gain = Math.min(gap, 4);
        if (gain > 0) {
          allActions.push({
            id: "add_hours",
            action: "Add business hours to your Google profile. Prospects who can't see your hours move on to a competitor who shows them.",
            subScore: "First Impression",
            currentPoints: firstImpression,
            maxPoints: 30,
            estimatedGain: gain,
            difficulty: "easy",
            timeEstimate: "2 minutes",
          });
        }
      }

      // 6. Missing phone or website
      if (!hasPhone) {
        allActions.push({
          id: "add_phone",
          action: "Add your phone number to your Google profile. Prospects need a way to reach you directly.",
          subScore: "First Impression",
          currentPoints: firstImpression,
          maxPoints: 30,
          estimatedGain: Math.min(30 - firstImpression, 3),
          difficulty: "easy",
          timeEstimate: "2 minutes",
        });
      }

      if (!hasWebsite) {
        allActions.push({
          id: "add_website",
          action: "Add a website link to your Google profile. People searching for you are more likely to click when they see a website listed.",
          subScore: "First Impression",
          currentPoints: firstImpression,
          maxPoints: 30,
          estimatedGain: Math.min(30 - firstImpression, 3),
          difficulty: "easy",
          timeEstimate: "2 minutes",
        });
      }

      // 7. Low competitive edge
      if (topCompetitor && competitiveEdge < 14) {
        const topReviews = topCompetitor.reviewCount ?? 0;
        const reviewGap = topReviews - reviewCount;
        if (reviewGap > 0) {
          const weeksToClose = Math.ceil(reviewGap / 3); // at 3 reviews/week
          allActions.push({
            id: "competitive_gap",
            action: `Your top competitor has ${reviewGap} more reviews. Close the gap at 3 reviews per week (about ${weeksToClose} weeks).`,
            subScore: "Competitive Edge",
            currentPoints: competitiveEdge,
            maxPoints: 20,
            estimatedGain: Math.min(20 - competitiveEdge, reviewGap > 50 ? 8 : 4),
            difficulty: "hard",
            timeEstimate: "Ongoing",
          });
        }
      }

      // Sort by estimated gain descending, take top 3
      allActions.sort((a, b) => b.estimatedGain - a.estimatedGain);
      const topActions = allActions.filter((a) => a.estimatedGain > 0).slice(0, 3);

      const totalPotentialGain = topActions.reduce((sum, a) => sum + a.estimatedGain, 0);
      const estimatedNewScore = Math.min(100, composite + totalPotentialGain);

      return res.json({
        success: true,
        actions: topActions,
        totalPotentialGain,
        currentScore: composite,
        estimatedNewScore,
      });
    } catch (error: any) {
      console.error("[ImprovementPlan] Error:", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to generate improvement plan",
      });
    }
  },
);

export default improvementPlanRoutes;
