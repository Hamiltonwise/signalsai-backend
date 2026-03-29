/**
 * PatientPath Research Agent -- Execution Service
 *
 * On-demand function triggered when a new org is created with
 * PatientPath enabled. Gathers GBP data, reviews, competitor
 * landscape, and produces a research brief that feeds the
 * PatientPath Copy Agent.
 *
 * The irreplaceable_thing sentence is the most important output
 * of the entire PatientPath pipeline. It comes from reviews,
 * not from the doctor's credentials.
 *
 * Export: runPatientPathResearch() -- on-demand, not a cron job.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface ResearchInput {
  orgId: number;
  refreshMode?: boolean; // true for quarterly refresh, false for first-time
}

interface ReviewTheme {
  theme: string;
  frequency: number;
  exampleQuotes: string[];
}

interface CompetitorProfile {
  name: string;
  reviewCount: number;
  averageRating: number | null;
  strengthNote: string;
  weaknessNote: string;
}

interface ResearchBrief {
  practiceProfile: {
    name: string;
    specialty: string;
    city: string;
    totalReviews: number;
    averageRating: number | null;
    reviewTrend: "gaining" | "stable" | "declining";
    topThemes: ReviewTheme[];
    competitorMap: CompetitorProfile[];
  };
  copyDirection: {
    irreplaceableThing: string;
    heroHeadline: string;
    problemStatement: string;
    socialProofQuotes: string[];
    faqTopics: string[];
    toneGuidance: string;
    fearCategories: string[];
    praisePatterns: string[];
    practicePersonality: string;
  };
  confidenceLevel: "high" | "medium" | "low";
  confidenceNote: string;
}

// -- Core -------------------------------------------------------------------

/**
 * Run PatientPath Research for a single org.
 * Gathers all available data and produces a research brief.
 */
export async function runPatientPathResearch(
  input: ResearchInput,
): Promise<ResearchBrief | null> {
  const { orgId, refreshMode = false } = input;

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) {
    console.error(`[PatientPathResearch] Org ${orgId} not found`);
    return null;
  }

  console.log(
    `[PatientPathResearch] ${refreshMode ? "Refreshing" : "Building"} research for ${org.name} (org ${orgId})`,
  );

  // Step 1: Gather data
  const reviews = await gatherReviews(orgId);
  const rankingData = await gatherRankingData(orgId);
  const referralSources = await gatherReferralSources(orgId);

  // Step 2: Analyze reviews for patterns
  const reviewAnalysis = analyzeReviews(reviews);

  // Step 3: Build competitor profiles
  const competitorProfiles = buildCompetitorProfiles(rankingData);

  // Step 4: Determine review trend
  const reviewTrend = determineReviewTrend(rankingData);

  // Step 5: Generate the irreplaceable thing and copy direction
  let copyDirection: ResearchBrief["copyDirection"];
  let confidenceLevel: "high" | "medium" | "low";
  let confidenceNote: string;

  if (process.env.ANTHROPIC_API_KEY && reviews.length >= 5) {
    try {
      const claudeResult = await synthesizeWithClaude(
        org,
        reviews,
        reviewAnalysis,
        competitorProfiles,
        referralSources,
      );
      copyDirection = claudeResult.copyDirection;
      confidenceLevel = claudeResult.confidenceLevel;
      confidenceNote = claudeResult.confidenceNote;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[PatientPathResearch] Claude synthesis failed, using template:`,
        message,
      );
      const template = generateTemplateCopyDirection(
        org,
        reviewAnalysis,
        reviews.length,
      );
      copyDirection = template.copyDirection;
      confidenceLevel = template.confidenceLevel;
      confidenceNote = template.confidenceNote;
    }
  } else {
    const template = generateTemplateCopyDirection(
      org,
      reviewAnalysis,
      reviews.length,
    );
    copyDirection = template.copyDirection;
    confidenceLevel = template.confidenceLevel;
    confidenceNote = template.confidenceNote;
  }

  const brief: ResearchBrief = {
    practiceProfile: {
      name: org.name || "Unknown Practice",
      specialty: org.specialty || rankingData[0]?.specialty || "Specialist",
      city: org.city || rankingData[0]?.search_city || "",
      totalReviews: reviews.length,
      averageRating: calculateAverageRating(reviews),
      reviewTrend,
      topThemes: reviewAnalysis.themes.slice(0, 3),
      competitorMap: competitorProfiles,
    },
    copyDirection,
    confidenceLevel,
    confidenceNote,
  };

  // Write completion event
  await writeResearchEvent(orgId, brief);

  console.log(
    `[PatientPathResearch] Research complete for ${org.name}. Confidence: ${confidenceLevel}`,
  );

  return brief;
}

// -- Data Gathering ---------------------------------------------------------

async function gatherReviews(orgId: number): Promise<any[]> {
  // Try practice_reviews table first, then fall back to GBP data in rankings
  const hasReviewsTable = await db.schema
    .hasTable("practice_reviews")
    .catch(() => false);

  if (hasReviewsTable) {
    const reviews = await db("practice_reviews")
      .where({ organization_id: orgId })
      .orderBy("review_date", "desc")
      .limit(100);

    if (reviews.length > 0) return reviews;
  }

  // Fall back to extracting reviews from ranking raw_data
  const rankings = await db("practice_rankings")
    .where({ organization_id: orgId, status: "completed" })
    .orderBy("created_at", "desc")
    .limit(1);

  if (rankings.length > 0) {
    try {
      const rawData =
        typeof rankings[0].raw_data === "string"
          ? JSON.parse(rankings[0].raw_data)
          : rankings[0].raw_data;

      const clientGbp = rawData?.client_gbp;
      if (clientGbp?.reviews && Array.isArray(clientGbp.reviews)) {
        return clientGbp.reviews;
      }
    } catch {
      // skip
    }
  }

  return [];
}

async function gatherRankingData(orgId: number): Promise<any[]> {
  return db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .limit(8);
}

async function gatherReferralSources(orgId: number): Promise<any[]> {
  const hasTable = await db.schema
    .hasTable("referral_sources")
    .catch(() => false);

  if (!hasTable) return [];

  return db("referral_sources")
    .where({ organization_id: orgId })
    .orderBy("referral_count", "desc")
    .limit(10);
}

// -- Review Analysis --------------------------------------------------------

interface ReviewAnalysis {
  themes: ReviewTheme[];
  fearPatterns: string[];
  praisePatterns: string[];
  uniquePraise: string[];
  transformationMoments: string[];
}

function analyzeReviews(reviews: any[]): ReviewAnalysis {
  const wordCounts: Record<string, number> = {};
  const quotes: Record<string, string[]> = {};
  const fearPatterns: string[] = [];
  const praisePatterns: string[] = [];
  const transformationMoments: string[] = [];

  // Common praise keywords to track
  const praiseKeywords = [
    "gentle",
    "painless",
    "explained",
    "patient",
    "friendly",
    "professional",
    "knowledgeable",
    "caring",
    "comfortable",
    "thorough",
    "skilled",
    "compassionate",
    "amazing",
    "excellent",
    "wonderful",
    "recommend",
    "best",
    "trust",
    "confident",
    "relieved",
  ];

  // Fear-related keywords
  const fearKeywords = [
    "scared",
    "afraid",
    "nervous",
    "anxious",
    "terrified",
    "worried",
    "dreaded",
    "feared",
    "hesitant",
    "reluctant",
  ];

  for (const review of reviews) {
    const text = String(
      review.text || review.review_text || review.comment || "",
    ).toLowerCase();

    if (!text) continue;

    // Track praise keywords
    for (const keyword of praiseKeywords) {
      if (text.includes(keyword)) {
        wordCounts[keyword] = (wordCounts[keyword] || 0) + 1;
        if (!quotes[keyword]) quotes[keyword] = [];
        const snippet = extractSnippet(text, keyword);
        if (snippet && quotes[keyword].length < 3) {
          quotes[keyword].push(snippet);
        }
      }
    }

    // Track fear patterns
    for (const keyword of fearKeywords) {
      if (text.includes(keyword)) {
        const snippet = extractSnippet(text, keyword);
        if (snippet && fearPatterns.length < 5) {
          fearPatterns.push(snippet);
        }
      }
    }

    // Track transformation moments (fear -> positive outcome)
    if (
      fearKeywords.some((f) => text.includes(f)) &&
      praiseKeywords.some((p) => text.includes(p))
    ) {
      const originalText = String(
        review.text || review.review_text || review.comment || "",
      );
      if (transformationMoments.length < 3) {
        transformationMoments.push(
          originalText.length > 200
            ? originalText.substring(0, 200) + "..."
            : originalText,
        );
      }
    }
  }

  // Build themes sorted by frequency
  const themes: ReviewTheme[] = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme, frequency]) => ({
      theme,
      frequency,
      exampleQuotes: quotes[theme] || [],
    }));

  // Extract top praise patterns
  for (const theme of themes.slice(0, 5)) {
    if (theme.exampleQuotes.length > 0) {
      praisePatterns.push(theme.exampleQuotes[0]);
    }
  }

  // Unique praise: themes that appear only once (distinctive)
  const uniquePraise = Object.entries(wordCounts)
    .filter(([, count]) => count === 1)
    .map(([keyword]) => quotes[keyword]?.[0] || keyword)
    .slice(0, 3);

  return {
    themes,
    fearPatterns,
    praisePatterns,
    uniquePraise,
    transformationMoments,
  };
}

function extractSnippet(text: string, keyword: string): string {
  const idx = text.indexOf(keyword);
  if (idx === -1) return "";

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + keyword.length + 60);
  let snippet = text.substring(start, end).trim();

  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

// -- Competitor Profiles ----------------------------------------------------

function buildCompetitorProfiles(snapshots: any[]): CompetitorProfile[] {
  if (snapshots.length === 0) return [];

  const latest = snapshots[0];
  const profiles: CompetitorProfile[] = [];

  if (latest.competitor_name) {
    profiles.push({
      name: latest.competitor_name,
      reviewCount: latest.competitor_review_count || 0,
      averageRating: null,
      strengthNote: `Top competitor with ${latest.competitor_review_count || 0} reviews`,
      weaknessNote: "Unknown",
    });
  }

  return profiles;
}

// -- Review Trend -----------------------------------------------------------

function determineReviewTrend(
  snapshots: any[],
): "gaining" | "stable" | "declining" {
  if (snapshots.length < 2) return "stable";

  const current = snapshots[0]?.client_review_count || 0;
  const previous = snapshots[snapshots.length - 1]?.client_review_count || 0;
  const delta = current - previous;

  if (delta > 2) return "gaining";
  if (delta < -1) return "declining";
  return "stable";
}

// -- Average Rating ---------------------------------------------------------

function calculateAverageRating(reviews: any[]): number | null {
  const ratings = reviews
    .map(
      (r) =>
        Number(r.rating || r.starRating || r.review_rating || 0),
    )
    .filter((r) => r > 0);

  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
}

// -- Claude Synthesis -------------------------------------------------------

interface ClaudeResult {
  copyDirection: ResearchBrief["copyDirection"];
  confidenceLevel: "high" | "medium" | "low";
  confidenceNote: string;
}

async function synthesizeWithClaude(
  org: any,
  reviews: any[],
  analysis: ReviewAnalysis,
  competitors: CompetitorProfile[],
  referralSources: any[],
): Promise<ClaudeResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  // Prepare review excerpts (top 20 most useful)
  const reviewTexts = reviews
    .filter(
      (r) =>
        (r.text || r.review_text || r.comment || "").length > 20,
    )
    .slice(0, 20)
    .map(
      (r, i) =>
        `Review ${i + 1} (${r.rating || r.starRating || "?"}★): ${String(r.text || r.review_text || r.comment || "").substring(0, 300)}`,
    )
    .join("\n\n");

  const prompt = `You are the PatientPath Research Agent for Alloro. Your job is to find the irreplaceable_thing about this practice by reading their reviews.

Practice: ${org.name}
Specialty: ${org.specialty || "Specialist"}
City: ${org.city || "Unknown"}

REVIEW THEMES (auto-detected):
${analysis.themes.map((t) => `- "${t.theme}" (mentioned ${t.frequency}x): ${t.exampleQuotes[0] || ""}`).join("\n")}

FEAR PATTERNS FROM REVIEWS:
${analysis.fearPatterns.join("\n") || "No fear patterns detected"}

TRANSFORMATION MOMENTS (fear -> positive):
${analysis.transformationMoments.join("\n---\n") || "No transformation moments detected"}

RAW REVIEWS:
${reviewTexts || "No review text available"}

COMPETITORS:
${competitors.map((c) => `- ${c.name}: ${c.reviewCount} reviews`).join("\n") || "No competitor data"}

REFERRAL SOURCES:
${referralSources.map((r: any) => `- ${r.provider_name || r.source_name}: ${r.referral_count} referrals`).join("\n") || "No referral data"}

Your task: produce a JSON object with these fields:

copyDirection:
- irreplaceableThing: ONE sentence describing what makes this practice different from every competitor. The sentence MUST come from review language. It describes the transformation the patient experiences, not the doctor's credentials. It must pass this test: remove the practice name, and the sentence should still identify them. "Board-certified specialist with 15 years experience" fails. "The practice where anxious patients say 'I didn't feel a thing'" passes.
- heroHeadline: 5-8 words drawn from patient language for the website hero section
- problemStatement: 1-2 sentences using EXACT emotional language from reviews to describe what patients feared before their visit
- socialProofQuotes: array of 3 highest-impact review excerpts (direct quotes)
- faqTopics: array of 5 topics drawn from review themes and patient concerns
- toneGuidance: one word (warm/clinical/authoritative/approachable) based on review language
- fearCategories: top 3 fears patients express in reviews
- praisePatterns: 3-5 direct review quotes showing recurring praise
- practicePersonality: one word that captures the practice's identity from reviews

Also include:
- confidenceLevel: "high" if 10+ reviews with clear patterns, "medium" if 5-9, "low" if < 5
- confidenceNote: explain your confidence assessment

Rules:
- No em-dashes. Use commas, periods, or semicolons.
- The hero is the PATIENT, not the doctor.
- Use exact words from reviews where possible.
- If reviews don't reveal a clear irreplaceable_thing, say so honestly.

Return ONLY the JSON object, no markdown fences.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const parsed = JSON.parse(text);

  return {
    copyDirection: {
      irreplaceableThing: String(
        parsed.copyDirection?.irreplaceableThing || "",
      ),
      heroHeadline: String(parsed.copyDirection?.heroHeadline || ""),
      problemStatement: String(parsed.copyDirection?.problemStatement || ""),
      socialProofQuotes: Array.isArray(
        parsed.copyDirection?.socialProofQuotes,
      )
        ? parsed.copyDirection.socialProofQuotes.map(String)
        : [],
      faqTopics: Array.isArray(parsed.copyDirection?.faqTopics)
        ? parsed.copyDirection.faqTopics.map(String)
        : [],
      toneGuidance: String(parsed.copyDirection?.toneGuidance || "warm"),
      fearCategories: Array.isArray(parsed.copyDirection?.fearCategories)
        ? parsed.copyDirection.fearCategories.map(String)
        : [],
      praisePatterns: Array.isArray(parsed.copyDirection?.praisePatterns)
        ? parsed.copyDirection.praisePatterns.map(String)
        : [],
      practicePersonality: String(
        parsed.copyDirection?.practicePersonality || "caring",
      ),
    },
    confidenceLevel: parsed.confidenceLevel || "medium",
    confidenceNote: String(parsed.confidenceNote || ""),
  };
}

// -- Template Fallback ------------------------------------------------------

function generateTemplateCopyDirection(
  org: any,
  analysis: ReviewAnalysis,
  reviewCount: number,
): ClaudeResult {
  const topTheme = analysis.themes[0]?.theme || "quality care";
  const topQuote = analysis.themes[0]?.exampleQuotes[0] || "";
  const fearQuote = analysis.fearPatterns[0] || "";
  const specialty = org.specialty || "specialist";

  let confidenceLevel: "high" | "medium" | "low" = "low";
  let confidenceNote = "";

  if (reviewCount >= 10 && analysis.themes.length >= 3) {
    confidenceLevel = "high";
    confidenceNote = `${reviewCount} reviews with ${analysis.themes.length} distinct praise patterns provide strong signal.`;
  } else if (reviewCount >= 5) {
    confidenceLevel = "medium";
    confidenceNote = `${reviewCount} reviews provide moderate signal. More reviews would strengthen the research brief.`;
  } else {
    confidenceLevel = "low";
    confidenceNote = `Insufficient review data (${reviewCount} reviews). Recommend gathering 10+ reviews before building PatientPath site.`;
  }

  return {
    copyDirection: {
      irreplaceableThing:
        reviewCount >= 5 && topQuote
          ? `The ${specialty} practice where patients consistently describe the experience as "${topTheme}."`
          : `Insufficient review data to identify a unique differentiator. Recommend: gather 10+ reviews before building PatientPath site.`,
      heroHeadline:
        topTheme
          ? `${topTheme.charAt(0).toUpperCase() + topTheme.slice(1)} care, every visit`
          : `${specialty} care built around you`,
      problemStatement:
        fearQuote || `Patients searching for a ${specialty} are often uncertain about what to expect.`,
      socialProofQuotes: analysis.praisePatterns.slice(0, 3),
      faqTopics: [
        `What to expect at your first ${specialty} visit`,
        `How to know if you need a ${specialty}`,
        `Insurance and payment options`,
        `Emergency ${specialty} care`,
        `Recovery and aftercare`,
      ],
      toneGuidance: "warm",
      fearCategories: analysis.fearPatterns.length > 0
        ? analysis.fearPatterns.slice(0, 3)
        : ["pain", "cost", "unknown outcome"],
      praisePatterns: analysis.praisePatterns.slice(0, 5),
      practicePersonality: "caring",
    },
    confidenceLevel,
    confidenceNote,
  };
}

// -- Event Writer -----------------------------------------------------------

async function writeResearchEvent(
  orgId: number,
  brief: ResearchBrief,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "patientpath.research_completed",
      org_id: orgId,
      properties: JSON.stringify({
        practice_name: brief.practiceProfile.name,
        specialty: brief.practiceProfile.specialty,
        total_reviews: brief.practiceProfile.totalReviews,
        review_trend: brief.practiceProfile.reviewTrend,
        irreplaceable_thing: brief.copyDirection.irreplaceableThing,
        confidence_level: brief.confidenceLevel,
        confidence_note: brief.confidenceNote,
        competitor_count: brief.practiceProfile.competitorMap.length,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[PatientPathResearch] Failed to write event for org ${orgId}:`,
      message,
    );
  }
}
