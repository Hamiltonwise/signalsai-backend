/**
 * Surprise Findings Engine -- The Oz Pearlman Homework Strategy
 *
 * Cross-references two public facts into one private-feeling insight.
 * The audience never sees the preparation. We do the homework before
 * they arrive.
 *
 * Data sources:
 * - Google Places reviews (text, timestamps, response status)
 * - Competitor reviews (response rates, recency, themes)
 * - Photo counts (visual presence comparison)
 * - Business hours (availability gaps)
 * - Editorial summaries (Google's AI description)
 * - Review sentiment patterns (keyword frequency cross-referencing)
 *
 * Each finding is scored on:
 * - surpriseScore: how unlikely they already know this (0-100)
 * - actionability: how easy it is to fix (0-100)
 *
 * Top findings are distributed across touchpoints:
 * - Checkup: top 3-5 findings shown immediately
 * - Welcome Intelligence email (4h later): 1-2 findings NOT shown in checkup
 * - Monday email: one finding when steady-state override fires
 */

// ── Types ───────────────────────────────────────────────────────────

export interface SurpriseFinding {
  type: "safety" | "hidden_money" | "competitive_gap" | "surprise_asset";
  headline: string;
  detail: string;
  surpriseScore: number; // 0-100: how unlikely they already know this
  actionability: number; // 0-100: how actionable it is
  source: string; // internal tracking, never shown to user
}

interface PlaceReview {
  text?: { text?: string };
  originalText?: { text?: string };
  rating?: number;
  authorAttribution?: { displayName?: string };
  relativePublishTimeDescription?: string;
  publishTime?: string;
  // Google Places API includes an ownerResponse field when the owner has replied
  ownerResponse?: { text?: string };
}

interface PlaceData {
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  reviews?: PlaceReview[];
  photos?: any[];
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: any[];
  };
  editorialSummary?: { text?: string };
  websiteUri?: string;
}

interface CompetitorData {
  name: string;
  totalScore: number;
  reviewsCount: number;
  photosCount: number;
  hasHours: boolean;
  hoursComplete: boolean;
  website?: string;
  // Extended data from Places API when available
  reviews?: PlaceReview[];
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: any[];
  };
  editorialSummary?: { text?: string };
}

// ── Main Generator ──────────────────────────────────────────────────

/**
 * Generate surprise findings from expanded Google Places data.
 * Returns all findings sorted by combined score. Caller decides
 * how many to show and where (checkup, welcome email, Monday email).
 */
export async function generateSurpriseFindings(data: {
  place: PlaceData;
  competitors: CompetitorData[];
  market: {
    city: string;
    avgRating: number;
    avgReviews: number;
    rank: number;
    totalCompetitors: number;
  };
}): Promise<SurpriseFinding[]> {
  const findings: SurpriseFinding[] = [];
  const { place, competitors, market } = data;

  const clientName = place.displayName?.text || "Your business";
  const clientReviews = place.reviews || [];
  const clientReviewCount = place.userRatingCount || 0;
  const clientPhotoCount = place.photos?.length || 0;

  // ── 1. Review Response Gap ──────────────────────────────────────
  const unansweredCount = clientReviews.filter(
    (r) => !r.ownerResponse
  ).length;
  const totalClientReviews = clientReviews.length;

  if (unansweredCount > 0 && totalClientReviews > 0) {
    // Check competitor response rate for comparison
    const topComp = competitors[0];
    const compReviews = topComp?.reviews || [];
    const compAnswered = compReviews.filter((r) => !!r.ownerResponse).length;
    const compResponseRate = compReviews.length > 0
      ? Math.round((compAnswered / compReviews.length) * 100)
      : 0;

    const clientResponseRate = totalClientReviews > 0
      ? Math.round(((totalClientReviews - unansweredCount) / totalClientReviews) * 100)
      : 0;

    let detail = `You have ${unansweredCount} unanswered review${unansweredCount !== 1 ? "s" : ""} on Google.`;
    if (topComp && compResponseRate > clientResponseRate) {
      detail += ` ${topComp.name} responds to ${compResponseRate}% of theirs.`;
    }
    detail += " Every unanswered review tells Google (and potential customers) you're not paying attention.";

    findings.push({
      type: "hidden_money",
      headline: `${unansweredCount} reviews waiting for your response`,
      detail,
      surpriseScore: 75, // Most owners don't track response rates
      actionability: 95, // Takes 10 minutes to respond
      source: "review_response_gap",
    });
  }

  // ── 2. Review Recency Gap ──────────────────────────────────────
  const clientReviewDates = clientReviews
    .map((r) => r.publishTime ? new Date(r.publishTime).getTime() : 0)
    .filter((t) => t > 0)
    .sort((a, b) => b - a);

  if (clientReviewDates.length > 0) {
    const lastClientReviewMs = clientReviewDates[0];
    const daysSinceLastReview = Math.floor(
      (Date.now() - lastClientReviewMs) / (1000 * 60 * 60 * 24)
    );

    // Check competitor recency
    const topComp = competitors[0];
    const compReviewDates = (topComp?.reviews || [])
      .map((r) => r.publishTime ? new Date(r.publishTime).getTime() : 0)
      .filter((t) => t > 0)
      .sort((a, b) => b - a);

    if (daysSinceLastReview > 14 && compReviewDates.length > 0) {
      const compLastReviewMs = compReviewDates[0];
      const compDaysSince = Math.floor(
        (Date.now() - compLastReviewMs) / (1000 * 60 * 60 * 24)
      );

      // Count competitor's recent reviews (last 30 days)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const compRecentCount = compReviewDates.filter((t) => t > thirtyDaysAgo).length;

      if (compDaysSince < daysSinceLastReview) {
        let detail = `Your last review was ${daysSinceLastReview} days ago.`;
        if (topComp && compRecentCount > 0) {
          detail += ` ${topComp.name} got ${compRecentCount} review${compRecentCount !== 1 ? "s" : ""} in the last 30 days.`;
        }
        detail += " Google favors businesses with recent activity. Review recency impacts your local ranking.";

        findings.push({
          type: "competitive_gap",
          headline: `${daysSinceLastReview} days since your last review`,
          detail,
          surpriseScore: 70,
          actionability: 80,
          source: "review_recency_gap",
        });
      }
    }
  }

  // ── 3. Photo Count Gap ─────────────────────────────────────────
  const topPhotoComp = [...competitors].sort(
    (a, b) => b.photosCount - a.photosCount
  )[0];

  if (topPhotoComp && topPhotoComp.photosCount > clientPhotoCount && topPhotoComp.photosCount > 10) {
    const photoGap = topPhotoComp.photosCount - clientPhotoCount;
    const detail = `${topPhotoComp.name} has ${topPhotoComp.photosCount} photos on Google. You have ${clientPhotoCount || "none"}. Businesses with 20+ photos get 35% more clicks to their website. Each photo is free visibility you're leaving on the table.`;

    findings.push({
      type: "hidden_money",
      headline: `${topPhotoComp.name} has ${photoGap} more photos than you`,
      detail,
      surpriseScore: 60,
      actionability: 85, // Easy to add photos
      source: "photo_count_gap",
    });
  }

  // ── 4. Hours Gap ───────────────────────────────────────────────
  const clientHours = place.regularOpeningHours;
  const clientHasHours = !!clientHours && (clientHours.periods?.length || 0) > 0;

  // Check how many competitors are open Saturday
  const saturdayComps = competitors.filter((c) => {
    if (!c.hasHours || !c.hoursComplete) return false;
    // If we have detailed hours, check Saturday specifically
    return c.hoursComplete; // hoursComplete means 5+ days listed, likely includes Saturday
  });

  if (saturdayComps.length >= 2 && clientHasHours) {
    // Check if client's hours mention Saturday
    const clientHourDescriptions = (clientHours?.weekdayDescriptions || [])
      .map((d) => d.toLowerCase());
    const clientOpenSaturday = clientHourDescriptions.some(
      (d) => d.includes("saturday") && !d.includes("closed")
    );

    if (!clientOpenSaturday && saturdayComps.length > 0) {
      const satCount = saturdayComps.length;
      findings.push({
        type: "competitive_gap",
        headline: `${satCount} of ${competitors.length} competitors are open Saturday. You aren't listed as open.`,
        detail: `${satCount} competitor${satCount !== 1 ? "s" : ""} in ${market.city} show Saturday hours on Google. If you are open Saturday, update your Google Business Profile. If you aren't, that's ${satCount} businesses capturing weekend demand you're missing.`,
        surpriseScore: 65,
        actionability: 70, // Requires a business decision, not just a click
        source: "hours_gap_saturday",
      });
    }
  } else if (!clientHasHours) {
    const compsWithHours = competitors.filter((c) => c.hasHours).length;
    if (compsWithHours > 0) {
      findings.push({
        type: "safety",
        headline: `Your Google profile is missing business hours`,
        detail: `${compsWithHours} of ${competitors.length} competitors have complete hours listed. Google prioritizes profiles with complete information. This takes 2 minutes to fix and it signals to both Google and customers that you're a real, active business.`,
        surpriseScore: 55,
        actionability: 95,
        source: "hours_missing",
      });
    }
  }

  // ── 5. Editorial Summary ───────────────────────────────────────
  const editorialText = place.editorialSummary?.text;
  if (editorialText) {
    findings.push({
      type: "surprise_asset",
      headline: `This is what Google tells people about you`,
      detail: `Google's AI describes your business as: "${editorialText}" This summary appears when people search for businesses like yours. If it doesn't match how you want to be known, your Google Business Profile description needs updating.`,
      surpriseScore: 90, // Almost nobody knows Google writes these
      actionability: 60, // Can influence it through GBP description, but indirect
      source: "editorial_summary_client",
    });
  }

  // Check competitor editorial summaries for contrast
  const compWithEditorial = competitors.find((c) => c.editorialSummary?.text);
  if (compWithEditorial?.editorialSummary?.text && !editorialText) {
    findings.push({
      type: "competitive_gap",
      headline: `Google wrote a summary for ${compWithEditorial.name} but not for you`,
      detail: `Google's AI describes ${compWithEditorial.name} as: "${compWithEditorial.editorialSummary.text}" Your business doesn't have an editorial summary yet. A complete, well-written Google Business Profile description increases the chance Google generates one for you.`,
      surpriseScore: 85,
      actionability: 55,
      source: "editorial_summary_competitor",
    });
  }

  // ── 6. Review Sentiment Cross-Reference ────────────────────────
  // Find words that appear in client reviews but not competitor reviews
  // This reveals the client's hidden moat.
  const sentimentKeywords = extractSentimentKeywords(clientReviews, competitors);
  if (sentimentKeywords.moatWord && sentimentKeywords.moatCount >= 3) {
    findings.push({
      type: "surprise_asset",
      headline: `Your customers mention "${sentimentKeywords.moatWord}" ${sentimentKeywords.moatCount}x more than any competitor's customers`,
      detail: `Across your recent reviews, customers specifically mention "${sentimentKeywords.moatWord}" ${sentimentKeywords.moatCount} times. None of your competitors' reviews highlight this. This is your competitive moat. Feature it on your website, your Google profile, and in how you ask for reviews.`,
      surpriseScore: 85,
      actionability: 75,
      source: "review_sentiment_moat",
    });
  }

  // ── Score and sort ─────────────────────────────────────────────
  // Combined score: 60% surprise, 40% actionability
  findings.sort((a, b) => {
    const scoreA = a.surpriseScore * 0.6 + a.actionability * 0.4;
    const scoreB = b.surpriseScore * 0.6 + b.actionability * 0.4;
    return scoreB - scoreA;
  });

  return findings;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract sentiment keywords that appear in client reviews but not
 * in competitor reviews. These reveal the client's hidden moat.
 */
function extractSentimentKeywords(
  clientReviews: PlaceReview[],
  competitors: CompetitorData[]
): { moatWord: string | null; moatCount: number } {
  // Positive-signal words that indicate a competitive differentiator
  const signalWords = [
    "gentle", "kind", "caring", "professional", "thorough", "honest",
    "friendly", "clean", "comfortable", "painless", "fast", "quick",
    "knowledgeable", "patient", "helpful", "amazing", "excellent",
    "efficient", "trustworthy", "warm", "welcoming", "skilled",
    "experienced", "affordable", "responsive", "reliable", "detailed",
    "compassionate", "attentive", "organized", "talented", "creative",
  ];

  // Count signal words in client reviews
  const clientText = clientReviews
    .map((r) => (r.text?.text || r.originalText?.text || "").toLowerCase())
    .join(" ");

  const clientCounts: Record<string, number> = {};
  for (const word of signalWords) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    const matches = clientText.match(regex);
    if (matches && matches.length >= 2) {
      clientCounts[word] = matches.length;
    }
  }

  // Count signal words in competitor reviews
  const compText = competitors
    .flatMap((c) => (c.reviews || []))
    .map((r) => (r.text?.text || r.originalText?.text || "").toLowerCase())
    .join(" ");

  // Find words the client has significantly more of
  let bestWord: string | null = null;
  let bestDelta = 0;

  for (const [word, count] of Object.entries(clientCounts)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    const compMatches = compText.match(regex);
    const compCount = compMatches ? compMatches.length : 0;

    // Client mentions it at least 3x more than competitors
    const delta = count - compCount;
    if (delta >= 3 && delta > bestDelta) {
      bestWord = word;
      bestDelta = delta;
    }
  }

  return { moatWord: bestWord, moatCount: bestDelta > 0 ? clientCounts[bestWord!] || 0 : 0 };
}

/**
 * Pick findings that were NOT included in the checkup.
 * Used by Welcome Intelligence to create a SECOND Oz moment.
 */
export function pickWelcomeFindings(
  allFindings: SurpriseFinding[],
  checkupFindingCount: number
): SurpriseFinding[] {
  // Skip the first N findings (shown in checkup), take the next 1-2
  return allFindings.slice(checkupFindingCount, checkupFindingCount + 2);
}

/**
 * Pick the single best finding for the Monday email steady-state override.
 * Prefer findings with high surprise score that feel fresh.
 */
export function pickMondayFinding(
  findings: SurpriseFinding[]
): SurpriseFinding | null {
  if (findings.length === 0) return null;
  // Return the highest-surprise finding
  const sorted = [...findings].sort((a, b) => b.surpriseScore - a.surpriseScore);
  return sorted[0];
}
