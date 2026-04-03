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
  /**
   * Confidence level based on data verifiability:
   * - high: finding is derived from data we can verify (exact ratings, counts, review text)
   * - medium: finding uses data that may be incomplete (5-review sample, hours data)
   * - low: finding relies on data we cannot verify (profile fields the API may not return)
   *
   * Only HIGH confidence findings appear in checkup results.
   * MEDIUM findings can appear in Monday email after trust is established.
   * LOW findings are suppressed entirely.
   */
  confidence: "high" | "medium" | "low";
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
  // REMOVED: Google Places API v1 does NOT return ownerResponse data.
  // We cannot verify whether reviews have been answered, so showing
  // "X reviews waiting for your response" is a false positive for
  // every business. A burned owner will forgive a missing insight
  // but will NOT forgive a wrong one.
  //
  // Replaced with: Negative sentiment detection from actual review text,
  // which IS verifiable because we are reading the words customers wrote.
  const negativeReviews = clientReviews.filter((r) => {
    const text = (r.text?.text || r.originalText?.text || "").toLowerCase();
    const rating = r.rating || 5;
    // A review is concerning if it has a low rating OR contains negative signal words
    if (rating <= 3) return true;
    const negativeSignals = ["disappointed", "rude", "wait", "waited", "overcharged", "unprofessional", "never again", "worst", "terrible", "horrible", "avoid"];
    return negativeSignals.some((w) => text.includes(w));
  });

  if (negativeReviews.length >= 2 && clientReviews.length > 0) {
    // Extract the common complaint theme from negative reviews
    const negativeText = negativeReviews
      .map((r) => (r.text?.text || r.originalText?.text || "").toLowerCase())
      .join(" ");
    const complaintWords = ["wait", "rude", "price", "cost", "expensive", "staff", "communication", "billing", "insurance", "pain", "uncomfortable"];
    const complaintCounts = complaintWords
      .map((w) => ({ word: w, count: (negativeText.match(new RegExp(`\\b${w}`, "gi")) || []).length }))
      .filter((c) => c.count >= 2)
      .sort((a, b) => b.count - a.count);

    const topComplaint = complaintCounts[0];
    const detail = topComplaint
      ? `${negativeReviews.length} of your recent reviews mention concerns${topComplaint ? ` around "${topComplaint.word}"` : ""}. People read negative reviews closely. Addressing this pattern publicly (in your responses) shows you listen and improve.`
      : `${negativeReviews.length} of your recent reviews contain negative signals. People weigh negative reviews heavily. Responding thoughtfully to concerns shows future customers you care.`;

    findings.push({
      type: "hidden_money",
      headline: `${negativeReviews.length} reviews with concerns people will notice`,
      detail,
      surpriseScore: 75,
      actionability: 90,
      source: "negative_sentiment_pattern",
      confidence: "high", // We are reading actual review text
    });
  }

  // ── 2. Review Recency Gap ──────────────────────────────────────
  // TRUST FIX: Google Places v1 returns only 5 reviews. The actual most recent
  // review could be from yesterday. We only flag recency if ALL reviews in our
  // sample are older than 30 days, which is a much stronger signal.
  //
  // We also check relativePublishTimeDescription for recent activity indicators.
  // If ANY review says "a week ago" or similar, recency is fine.
  const hasRecentByDescription = clientReviews.some((r) => {
    const desc = (r.relativePublishTimeDescription || "").toLowerCase();
    return desc.includes("a week ago") || desc.includes("days ago")
      || desc.includes("yesterday") || desc.includes("an hour ago")
      || desc.includes("2 weeks ago") || desc.includes("3 weeks ago");
  });

  if (!hasRecentByDescription) {
    const clientReviewDates = clientReviews
      .map((r) => r.publishTime ? new Date(r.publishTime).getTime() : 0)
      .filter((t) => t > 0)
      .sort((a, b) => b - a);

    // Only flag if we have dates AND every single review is older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const allReviewsOld = clientReviewDates.length > 0
      && clientReviewDates.every((t) => t < thirtyDaysAgo);

    if (allReviewsOld) {
      const oldestRecentMs = clientReviewDates[0];
      const daysSinceLastReview = Math.floor(
        (Date.now() - oldestRecentMs) / (1000 * 60 * 60 * 24)
      );

      findings.push({
        type: "competitive_gap",
        headline: "Review activity has slowed across your recent Google reviews",
        detail: `Based on your most recent Google reviews, activity has slowed. All ${clientReviewDates.length} reviews in your sample are over 30 days old. Fresh reviews signal to prospects that your business is active. Google also favors businesses with recent review activity in local rankings.`,
        surpriseScore: 70,
        actionability: 80,
        source: "review_recency_gap",
        confidence: "medium", // Based on a 5-review sample, not the full picture
      });
    }
  }

  // ── 3. Photo Count Gap ─────────────────────────────────────────
  const topPhotoComp = [...competitors].sort(
    (a, b) => b.photosCount - a.photosCount
  )[0];

  if (topPhotoComp && topPhotoComp.photosCount > clientPhotoCount && topPhotoComp.photosCount > 10) {
    const photoGap = topPhotoComp.photosCount - clientPhotoCount;
    const detail = `${topPhotoComp.name} has ${topPhotoComp.photosCount} photos on Google. You have ${clientPhotoCount || "none"}. Photos are free visibility. Each one shows people what your business looks like before they visit.`;

    findings.push({
      type: "hidden_money",
      headline: `${topPhotoComp.name} has ${photoGap} more photos than you`,
      detail,
      surpriseScore: 60,
      actionability: 85, // Easy to add photos
      source: "photo_count_gap",
      confidence: "high", // Photo counts are exact from the API
    });
  }

  // ── 4. Hours Gap ───────────────────────────────────────────────
  // TRUST FIX: Google Places hours data can be stale or incomplete.
  // Only show Saturday findings when we have STRONG evidence: the business's
  // weekdayDescriptions explicitly lists Saturday as "Closed" (not just missing data).
  // If hours data is missing entirely, we don't know enough to comment.
  const clientHours = place.regularOpeningHours;
  const clientHasHours = !!clientHours && (clientHours.periods?.length || 0) > 0;
  const clientHourDescriptions = (clientHours?.weekdayDescriptions || [])
    .map((d) => d.toLowerCase());

  // Strong evidence: Saturday is explicitly listed as "Closed" in weekdayDescriptions
  const saturdayExplicitlyClosed = clientHourDescriptions.some(
    (d) => d.includes("saturday") && d.includes("closed")
  );
  // Weak evidence: Saturday not mentioned at all (could be data gap)
  const saturdayMentioned = clientHourDescriptions.some(
    (d) => d.includes("saturday")
  );

  if (saturdayExplicitlyClosed) {
    // We have strong evidence: they explicitly show Saturday as Closed
    const saturdayComps = competitors.filter((c) => c.hasHours && c.hoursComplete);
    if (saturdayComps.length >= 2) {
      const satCount = saturdayComps.length;
      findings.push({
        type: "competitive_gap",
        headline: `Your Google profile lists Saturday as closed. ${satCount} competitors show Saturday hours.`,
        detail: `${satCount} competitor${satCount !== 1 ? "s" : ""} in ${market.city} show Saturday hours on Google. If you have added Saturday availability, make sure your Google Business Profile reflects it. Weekend access is a common deciding factor for prospects.`,
        surpriseScore: 65,
        actionability: 70,
        source: "hours_gap_saturday",
        confidence: "medium", // Hours data can be stale, but explicit "Closed" is a decent signal
      });
    }
  } else if (!clientHasHours) {
    // No hours data at all. This IS something the business controls.
    const compsWithHours = competitors.filter((c) => c.hasHours).length;
    if (compsWithHours > 0) {
      findings.push({
        type: "safety",
        headline: `Your Google profile is missing business hours`,
        detail: `${compsWithHours} of ${competitors.length} competitors have hours listed. Google prioritizes profiles with complete information. This takes 2 minutes to fix and signals to both Google and customers that you're a real, active business.`,
        surpriseScore: 55,
        actionability: 95,
        source: "hours_missing",
        confidence: "high", // Missing hours is verifiable: the API returns no hours data at all
      });
    }
  }
  // If Saturday is simply not mentioned in the data, we say nothing.
  // The business may be open Saturday but the data is incomplete.

  // ── 5. Editorial Summary ───────────────────────────────────────
  // TRUST FIX: editorialSummary is Google-generated, NOT business-controlled.
  // We cannot verify whether a business has added their own description.
  // The API field we check is Google's AI summary, not the owner's profile text.
  //
  // If they HAVE an editorial summary, that's a verifiable surprise asset.
  // If they DON'T, we say nothing. The owner may have a full description
  // that Google simply hasn't summarized. Showing "missing description"
  // when they can see their description IS there destroys trust instantly.
  const editorialText = place.editorialSummary?.text;
  if (editorialText) {
    findings.push({
      type: "surprise_asset",
      headline: `This is what Google tells people about you`,
      detail: `Google's AI describes your business as: "${editorialText}" This summary appears when people search for businesses like yours. If it doesn't match how you want to be known, your Google Business Profile description needs updating.`,
      surpriseScore: 90, // Almost nobody knows Google writes these
      actionability: 60, // Can influence it through GBP description, but indirect
      source: "editorial_summary_client",
      confidence: "high", // We have the exact text Google shows
    });
  }
  // REMOVED: "Google wrote a summary for [competitor] but not for you"
  // We cannot verify the business doesn't have a description. The API
  // simply may not return it as editorialSummary. Showing this finding
  // would cause the owner to check their profile, see their description
  // IS there, and lose trust in everything else we show them.

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
      confidence: "high", // We are reading actual review text, fully verifiable
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
 * Includes HIGH and MEDIUM confidence findings (trust is building by this point).
 */
export function pickWelcomeFindings(
  allFindings: SurpriseFinding[],
  checkupFindingCount: number
): SurpriseFinding[] {
  // Filter out LOW confidence (unverifiable) findings entirely
  const usable = allFindings.filter((f) => f.confidence !== "low");
  // Skip the first N findings (shown in checkup), take the next 1-2
  return usable.slice(checkupFindingCount, checkupFindingCount + 2);
}

/**
 * Pick the single best finding for the Monday email steady-state override.
 * Prefer findings with high surprise score that feel fresh.
 * Monday email can include MEDIUM confidence findings (trust is established).
 */
export function pickMondayFinding(
  findings: SurpriseFinding[]
): SurpriseFinding | null {
  // Filter out LOW confidence findings entirely
  const usable = findings.filter((f) => f.confidence !== "low");
  if (usable.length === 0) return null;
  // Return the highest-surprise finding
  const sorted = [...usable].sort((a, b) => b.surpriseScore - a.surpriseScore);
  return sorted[0];
}
