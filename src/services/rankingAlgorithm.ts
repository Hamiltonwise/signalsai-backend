/**
 * Practice Ranking Algorithm
 *
 * Proprietary 8-factor weighted scoring system for local dental practice rankings
 *
 * Factor Weights:
 * 1. Primary Category Match: 25%
 * 2. Total Review Count: 20%
 * 3. Overall Star Rating: 15%
 * 4. Keyword in Business Name: 10%
 * 5. Review Velocity/Recency: 10%
 * 6. NAP Consistency: 8%
 * 7. GBP Profile Activity: 7%
 * 8. Review Sentiment: 5%
 */

// Factor weights (must sum to 1.0)
const FACTOR_WEIGHTS = {
  categoryMatch: 0.25,
  reviewCount: 0.2,
  starRating: 0.15,
  keywordName: 0.1,
  reviewVelocity: 0.1,
  napConsistency: 0.08,
  gbpActivity: 0.07,
  sentiment: 0.05,
};

// Map frontend specialty values to internal keys
// Frontend sends: "orthodontist", "endodontist", etc.
// Backend uses: "orthodontics", "endodontics", etc.
const SPECIALTY_ALIASES: Record<string, string> = {
  orthodontist: "orthodontics",
  endodontist: "endodontics",
  periodontist: "periodontics",
  "oral surgeon": "oral_surgery",
  prosthodontist: "prosthodontics",
  "pediatric dentist": "pediatric",
  // Also support the internal keys directly
  orthodontics: "orthodontics",
  endodontics: "endodontics",
  periodontics: "periodontics",
  oral_surgery: "oral_surgery",
  pediatric: "pediatric",
  prosthodontics: "prosthodontics",
  general: "general",
};

/**
 * Normalize specialty input to internal key
 * Handles both frontend dropdown values and internal keys
 */
function normalizeSpecialty(specialty: string): string {
  const normalized = specialty.toLowerCase().trim();
  return SPECIALTY_ALIASES[normalized] || "general";
}

// Category matching configurations
const SPECIALTY_CATEGORIES: Record<string, string[]> = {
  orthodontics: ["Orthodontist", "Orthodontic practice", "Orthodontics"],
  endodontics: ["Endodontist", "Endodontic practice", "Root canal specialist"],
  periodontics: ["Periodontist", "Periodontal practice", "Gum specialist"],
  oral_surgery: [
    "Oral surgeon",
    "Oral and maxillofacial surgeon",
    "Oral surgery clinic",
  ],
  pediatric: ["Pediatric dentist", "Children's dentist", "Kids dentist"],
  prosthodontics: ["Prosthodontist", "Prosthodontic practice"],
  general: ["Dentist", "Dental clinic", "Dental practice", "Dental office"],
};

// Specialty keywords for name matching
const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  orthodontics: ["orthodont", "braces", "invisalign", "ortho", "smile"],
  endodontics: ["endodont", "root canal", "endo"],
  periodontics: ["periodont", "gum", "perio"],
  oral_surgery: ["oral surgery", "oral surgeon", "maxillofacial"],
  pediatric: ["pediatric", "kids", "children", "pedo"],
  prosthodontics: ["prosthodont", "dentures", "implants", "crowns"],
};

// Benchmarks for normalization (industry averages)
const BENCHMARKS = {
  reviewCount: {
    min: 0,
    avg: 150,
    excellent: 400,
    max: 800, // Cap for normalization
  },
  reviewVelocity: {
    min: 0,
    avg: 8,
    excellent: 20,
    max: 40, // reviews per month
  },
  gbpPosts: {
    min: 0,
    avg: 4,
    excellent: 12,
    max: 24, // posts per 90 days
  },
};

export interface PracticeData {
  name: string;
  primaryCategory: string;
  secondaryCategories?: string[];
  totalReviews: number;
  averageRating: number;
  reviewsLast30d: number;
  reviewsLast90d?: number;
  postsLast90d: number;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
  hoursComplete?: boolean;
  descriptionLength?: number;
  photosCount?: number;
  qAndACount?: number;
  attributesCount?: number;
  sentimentScore?: number; // 0-1, percentage of positive reviews
}

export interface FactorScore {
  score: number;
  max: number;
  details: string;
}

export interface RankingFactors {
  categoryMatch: FactorScore;
  reviewCount: FactorScore;
  starRating: FactorScore;
  keywordName: FactorScore;
  reviewVelocity: FactorScore;
  napConsistency: FactorScore;
  gbpActivity: FactorScore;
  sentiment: FactorScore;
}

export interface RankingResult {
  totalScore: number;
  factors: RankingFactors;
  breakdown: {
    factor: string;
    weight: number;
    rawScore: number;
    weightedScore: number;
  }[];
}

/**
 * Calculate the primary category match score
 * Perfect match = full points, related category = partial, no match = 0
 */
function calculateCategoryMatchScore(
  primaryCategory: string,
  specialty: string
): FactorScore {
  const maxScore = FACTOR_WEIGHTS.categoryMatch * 100;
  const normalizedSpecialty = normalizeSpecialty(specialty);
  const targetCategories =
    SPECIALTY_CATEGORIES[normalizedSpecialty] || SPECIALTY_CATEGORIES.general;

  const normalizedCategory = primaryCategory.toLowerCase();

  // Perfect match
  if (
    targetCategories.some((cat) =>
      normalizedCategory.includes(cat.toLowerCase())
    )
  ) {
    return {
      score: maxScore,
      max: maxScore,
      details: `Primary category "${primaryCategory}" matches specialty "${specialty}"`,
    };
  }

  // Check if it's a general dental category (partial credit)
  const generalCategories = SPECIALTY_CATEGORIES.general;
  if (
    generalCategories.some((cat) =>
      normalizedCategory.includes(cat.toLowerCase())
    )
  ) {
    return {
      score: maxScore * 0.6,
      max: maxScore,
      details: `Primary category "${primaryCategory}" is general dental, not specialty-specific`,
    };
  }

  return {
    score: 0,
    max: maxScore,
    details: `Primary category "${primaryCategory}" does not match specialty "${specialty}"`,
  };
}

/**
 * Calculate review count score using logarithmic scaling
 * More reviews = better, but with diminishing returns
 */
function calculateReviewCountScore(
  totalReviews: number,
  benchmarkMax: number = BENCHMARKS.reviewCount.max
): FactorScore {
  const maxScore = FACTOR_WEIGHTS.reviewCount * 100;

  // Logarithmic scaling: more reviews = better but diminishing returns
  // Score = (log(reviews + 1) / log(max + 1)) * maxScore
  const normalizedScore =
    Math.log(totalReviews + 1) / Math.log(benchmarkMax + 1);
  const score = Math.min(normalizedScore * maxScore, maxScore);

  let details: string;
  if (totalReviews >= BENCHMARKS.reviewCount.excellent) {
    details = `Excellent review count: ${totalReviews} reviews`;
  } else if (totalReviews >= BENCHMARKS.reviewCount.avg) {
    details = `Above average review count: ${totalReviews} reviews`;
  } else {
    details = `Below average review count: ${totalReviews} reviews (market avg: ${BENCHMARKS.reviewCount.avg})`;
  }

  return {
    score: Math.round(score * 100) / 100,
    max: maxScore,
    details,
  };
}

/**
 * Calculate star rating score
 * Linear scaling from 1-5 stars, with bonus for 4.5+
 */
function calculateStarRatingScore(
  averageRating: number,
  marketAverage: number = 4.5
): FactorScore {
  const maxScore = FACTOR_WEIGHTS.starRating * 100;

  // Normalize rating (1-5 scale) to 0-1
  // But weight higher ratings more: below 4.0 gets penalties
  let normalizedScore: number;

  if (averageRating >= 4.8) {
    normalizedScore = 1.0; // Perfect
  } else if (averageRating >= 4.5) {
    normalizedScore = 0.85 + ((averageRating - 4.5) / 0.3) * 0.15;
  } else if (averageRating >= 4.0) {
    normalizedScore = 0.6 + ((averageRating - 4.0) / 0.5) * 0.25;
  } else if (averageRating >= 3.5) {
    normalizedScore = 0.3 + ((averageRating - 3.5) / 0.5) * 0.3;
  } else {
    normalizedScore = (averageRating / 3.5) * 0.3;
  }

  const score = normalizedScore * maxScore;

  const comparison = averageRating >= marketAverage ? "above" : "below";
  const details = `${averageRating.toFixed(
    1
  )} star rating (${comparison} market avg of ${marketAverage})`;

  return {
    score: Math.round(score * 100) / 100,
    max: maxScore,
    details,
  };
}

/**
 * Calculate keyword in business name score
 * Binary: either has keyword or doesn't
 */
function calculateKeywordNameScore(
  businessName: string,
  specialty: string
): FactorScore {
  const maxScore = FACTOR_WEIGHTS.keywordName * 100;
  const normalizedSpecialty = normalizeSpecialty(specialty);
  const keywords = SPECIALTY_KEYWORDS[normalizedSpecialty] || [];

  const normalizedName = businessName.toLowerCase();
  const hasKeyword = keywords.some((keyword) =>
    normalizedName.includes(keyword.toLowerCase())
  );

  if (hasKeyword) {
    return {
      score: maxScore,
      max: maxScore,
      details: `Business name "${businessName}" contains specialty keyword`,
    };
  }

  return {
    score: 0,
    max: maxScore,
    details: `Business name "${businessName}" does not contain specialty keyword`,
  };
}

/**
 * Calculate review velocity/recency score
 * Based on reviews in last 30 days
 */
function calculateReviewVelocityScore(
  reviewsLast30d: number,
  benchmarkAvg: number = BENCHMARKS.reviewVelocity.avg
): FactorScore {
  const maxScore = FACTOR_WEIGHTS.reviewVelocity * 100;

  // Linear scaling with cap at excellent level
  const normalizedScore = Math.min(
    reviewsLast30d / BENCHMARKS.reviewVelocity.excellent,
    1.0
  );
  const score = normalizedScore * maxScore;

  let details: string;
  if (reviewsLast30d >= BENCHMARKS.reviewVelocity.excellent) {
    details = `Excellent review velocity: ${reviewsLast30d} new reviews in last 30 days`;
  } else if (reviewsLast30d >= benchmarkAvg) {
    details = `Good review velocity: ${reviewsLast30d} new reviews in last 30 days`;
  } else {
    details = `Low review velocity: ${reviewsLast30d} new reviews in last 30 days (avg: ${benchmarkAvg})`;
  }

  return {
    score: Math.round(score * 100) / 100,
    max: maxScore,
    details,
  };
}

/**
 * Calculate NAP consistency score
 * Based on profile completeness (website, phone, hours)
 */
function calculateNapConsistencyScore(
  hasWebsite: boolean,
  hasPhone: boolean,
  hasHours: boolean,
  hoursComplete: boolean = true
): FactorScore {
  const maxScore = FACTOR_WEIGHTS.napConsistency * 100;

  let completeness = 0;
  const missing: string[] = [];

  if (hasWebsite) completeness += 0.3;
  else missing.push("website");

  if (hasPhone) completeness += 0.3;
  else missing.push("phone");

  if (hasHours) {
    completeness += hoursComplete ? 0.4 : 0.3;
    if (!hoursComplete) missing.push("complete hours");
  } else {
    missing.push("hours");
  }

  const score = completeness * maxScore;

  let details: string;
  if (missing.length === 0) {
    details = "NAP information is complete and consistent";
  } else {
    details = `Missing NAP elements: ${missing.join(", ")}`;
  }

  return {
    score: Math.round(score * 100) / 100,
    max: maxScore,
    details,
  };
}

/**
 * Calculate GBP profile activity score
 * Based on posts in last 90 days and profile completeness
 */
function calculateGbpActivityScore(
  postsLast90d: number,
  photosCount: number = 0,
  descriptionLength: number = 0
): FactorScore {
  const maxScore = FACTOR_WEIGHTS.gbpActivity * 100;

  // Posts are the main factor (60% of this score)
  const postScore =
    Math.min(postsLast90d / BENCHMARKS.gbpPosts.excellent, 1.0) * 0.6;

  // Photos (25% of this score)
  const photoScore = Math.min(photosCount / 50, 1.0) * 0.25;

  // Description (15% of this score)
  const descScore = Math.min(descriptionLength / 750, 1.0) * 0.15;

  const totalNormalized = postScore + photoScore + descScore;
  const score = totalNormalized * maxScore;

  let details: string;
  if (postsLast90d >= BENCHMARKS.gbpPosts.excellent) {
    details = `Excellent GBP activity: ${postsLast90d} posts in last 90 days`;
  } else if (postsLast90d >= BENCHMARKS.gbpPosts.avg) {
    details = `Good GBP activity: ${postsLast90d} posts in last 90 days`;
  } else {
    details = `Low GBP activity: ${postsLast90d} posts in last 90 days (recommended: ${BENCHMARKS.gbpPosts.excellent})`;
  }

  return {
    score: Math.round(score * 100) / 100,
    max: maxScore,
    details,
  };
}

/**
 * Calculate review sentiment score
 * Based on ratio of positive reviews (4-5 stars)
 */
function calculateSentimentScore(
  sentimentScore?: number,
  averageRating?: number
): FactorScore {
  const maxScore = FACTOR_WEIGHTS.sentiment * 100;

  // If we have explicit sentiment score, use it
  // Otherwise, estimate from average rating
  let sentiment: number;
  if (sentimentScore !== undefined) {
    sentiment = sentimentScore;
  } else if (averageRating !== undefined) {
    // Estimate: rating of 4.5+ suggests ~90% positive
    sentiment = Math.min((averageRating - 3) / 2, 1.0);
    sentiment = Math.max(sentiment, 0);
  } else {
    sentiment = 0.8; // Default assumption
  }

  const score = sentiment * maxScore;
  const percentage = Math.round(sentiment * 100);

  let details: string;
  if (percentage >= 90) {
    details = `Excellent sentiment: ${percentage}% positive reviews`;
  } else if (percentage >= 75) {
    details = `Good sentiment: ${percentage}% positive reviews`;
  } else {
    details = `Mixed sentiment: ${percentage}% positive reviews`;
  }

  return {
    score: Math.round(score * 100) / 100,
    max: maxScore,
    details,
  };
}

/**
 * Calculate complete ranking score for a practice
 */
export function calculateRankingScore(
  practice: PracticeData,
  specialty: string
): RankingResult {
  // Calculate each factor
  const factors: RankingFactors = {
    categoryMatch: calculateCategoryMatchScore(
      practice.primaryCategory,
      specialty
    ),
    reviewCount: calculateReviewCountScore(practice.totalReviews),
    starRating: calculateStarRatingScore(practice.averageRating),
    keywordName: calculateKeywordNameScore(practice.name, specialty),
    reviewVelocity: calculateReviewVelocityScore(practice.reviewsLast30d),
    napConsistency: calculateNapConsistencyScore(
      practice.hasWebsite,
      practice.hasPhone,
      practice.hasHours,
      practice.hoursComplete
    ),
    gbpActivity: calculateGbpActivityScore(
      practice.postsLast90d,
      practice.photosCount,
      practice.descriptionLength
    ),
    sentiment: calculateSentimentScore(
      practice.sentimentScore,
      practice.averageRating
    ),
  };

  // Calculate total score
  const totalScore =
    factors.categoryMatch.score +
    factors.reviewCount.score +
    factors.starRating.score +
    factors.keywordName.score +
    factors.reviewVelocity.score +
    factors.napConsistency.score +
    factors.gbpActivity.score +
    factors.sentiment.score;

  // Create breakdown
  const breakdown = [
    {
      factor: "category_match",
      weight: FACTOR_WEIGHTS.categoryMatch,
      rawScore: factors.categoryMatch.score,
      weightedScore: factors.categoryMatch.score,
    },
    {
      factor: "review_count",
      weight: FACTOR_WEIGHTS.reviewCount,
      rawScore: factors.reviewCount.score,
      weightedScore: factors.reviewCount.score,
    },
    {
      factor: "star_rating",
      weight: FACTOR_WEIGHTS.starRating,
      rawScore: factors.starRating.score,
      weightedScore: factors.starRating.score,
    },
    {
      factor: "keyword_name",
      weight: FACTOR_WEIGHTS.keywordName,
      rawScore: factors.keywordName.score,
      weightedScore: factors.keywordName.score,
    },
    {
      factor: "review_velocity",
      weight: FACTOR_WEIGHTS.reviewVelocity,
      rawScore: factors.reviewVelocity.score,
      weightedScore: factors.reviewVelocity.score,
    },
    {
      factor: "nap_consistency",
      weight: FACTOR_WEIGHTS.napConsistency,
      rawScore: factors.napConsistency.score,
      weightedScore: factors.napConsistency.score,
    },
    {
      factor: "gbp_activity",
      weight: FACTOR_WEIGHTS.gbpActivity,
      rawScore: factors.gbpActivity.score,
      weightedScore: factors.gbpActivity.score,
    },
    {
      factor: "sentiment",
      weight: FACTOR_WEIGHTS.sentiment,
      rawScore: factors.sentiment.score,
      weightedScore: factors.sentiment.score,
    },
  ];

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    factors,
    breakdown,
  };
}

/**
 * Rank multiple practices and return sorted results
 */
export function rankPractices(
  practices: Array<{ id: string; data: PracticeData }>,
  specialty: string
): Array<{ id: string; rankPosition: number; rankingResult: RankingResult }> {
  // Calculate scores for all practices
  const scored = practices.map((practice) => ({
    id: practice.id,
    rankingResult: calculateRankingScore(practice.data, specialty),
  }));

  // Sort by total score (descending)
  scored.sort(
    (a, b) => b.rankingResult.totalScore - a.rankingResult.totalScore
  );

  // Assign rank positions
  return scored.map((item, index) => ({
    ...item,
    rankPosition: index + 1,
  }));
}

/**
 * Calculate market benchmarks from competitor data
 */
export function calculateBenchmarks(
  competitors: Array<{
    totalReviews: number;
    averageRating: number;
    reviewsLast30d?: number;
  }>
): {
  avgScore: number;
  medianScore: number;
  avgReviews: number;
  medianReviews: number;
  avgRating: number;
  avgReviews30d: number;
} {
  if (competitors.length === 0) {
    return {
      avgScore: 0,
      medianScore: 0,
      avgReviews: 0,
      medianReviews: 0,
      avgRating: 0,
      avgReviews30d: 0,
    };
  }

  const reviews = competitors.map((c) => c.totalReviews);
  const ratings = competitors.map((c) => c.averageRating);
  const velocity = competitors.map((c) => c.reviewsLast30d || 0);

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => sum(arr) / arr.length;
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  return {
    avgScore: 0, // Will be calculated after scoring
    medianScore: 0,
    avgReviews: Math.round(avg(reviews)),
    medianReviews: Math.round(median(reviews)),
    avgRating: Math.round(avg(ratings) * 100) / 100,
    avgReviews30d: Math.round(avg(velocity)),
  };
}

export { FACTOR_WEIGHTS, SPECIALTY_CATEGORIES, SPECIALTY_KEYWORDS };

export default {
  calculateRankingScore,
  rankPractices,
  calculateBenchmarks,
  FACTOR_WEIGHTS,
  SPECIALTY_CATEGORIES,
  SPECIALTY_KEYWORDS,
};
