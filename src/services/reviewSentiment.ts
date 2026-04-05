/**
 * Review Sentiment Comparison Service
 *
 * Compares review themes between a business and its top competitor.
 * Surfaces the gaps: what the competitor is known for that you are not.
 *
 * This is the first piece of intelligence a business owner
 * cannot find by Googling for 60 seconds.
 *
 * Example output:
 * "Patients describe Peluso as 'gentle with anxious kids' in 14 reviews.
 *  Nobody says that about you. That's the sentence Google's AI reads
 *  when a parent asks for an orthodontist."
 */

import Anthropic from "@anthropic-ai/sdk";
import { getPlaceDetails } from "../controllers/places/feature-services/GooglePlacesApiService";

// ─── Singleton ───────────────────────────────────────────────────────

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// ─── Interfaces ──────────────────────────────────────────────────────

interface ReviewData {
  text: string;
  rating: number;
  authorName: string;
  relativePublishTimeDescription: string;
}

interface SentimentInsight {
  type: "sentiment_insight";
  title: string;
  detail: string;
  yourTheme: string;
  competitorTheme: string;
  actionable: string;
}

export interface ThemeCitation {
  theme: string;
  count: number;
  exampleQuote: string;
}

export interface SentimentComparison {
  competitorName: string;
  competitorThemes: ThemeCitation[];
  yourThemes: ThemeCitation[];
  gaps: { theme: string; competitorCount: number; exampleQuote: string }[];
  insight: string;
}

// ─── Review Fetcher ──────────────────────────────────────────────────

/**
 * Fetch reviews for a place from Google Places API.
 * Returns up to 5 most relevant reviews.
 */
async function fetchReviews(placeId: string): Promise<ReviewData[]> {
  try {
    const details = await getPlaceDetails(placeId);
    if (!details?.reviews || !Array.isArray(details.reviews)) return [];
    return details.reviews.slice(0, 5).map((r: any) => ({
      text: r.text?.text || r.originalText?.text || "",
      rating: r.rating || 0,
      authorName: r.authorAttribution?.displayName || "Anonymous",
      relativePublishTimeDescription: r.relativePublishTimeDescription || "",
    }));
  } catch {
    return [];
  }
}

// ─── Theme Extraction (shared by both functions) ─────────────────────

const LLM_MODEL = process.env.LLM_MODEL || "claude-sonnet-4-6";

interface ExtractedThemes {
  themes: { theme: string; count: number; exampleQuote: string }[];
}

/**
 * Use Claude to extract the top 3-5 recurring themes from a set of reviews.
 * Every theme must cite an actual quote from the reviews.
 * Returns an empty array if reviews are insufficient.
 */
async function extractThemes(
  reviews: ReviewData[],
  businessName: string,
): Promise<ExtractedThemes> {
  if (reviews.length < 2) {
    return { themes: [] };
  }

  const reviewBlock = reviews
    .map((r, i) => `Review ${i + 1} [${r.rating} stars, ${r.authorName}]: "${r.text}"`)
    .join("\n\n");

  const response = await getAnthropic().messages.create({
    model: LLM_MODEL,
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `You are analyzing Google reviews for "${businessName}".

REVIEWS:
${reviewBlock}

Extract the top 3-5 recurring THEMES from these reviews. A theme is a specific quality or experience customers describe (e.g., "gentle with anxious kids", "explains procedures clearly", "modern office feel", "short wait times").

Rules:
- Each theme must appear in at least 1 review. Count how many reviews mention it.
- The exampleQuote must be a REAL phrase copied from a review above. Not paraphrased.
- If there are fewer than 5 reviews, extract only themes you can genuinely identify. Do not invent themes.
- Do not use em-dashes in any output.
- Return valid JSON only, no markdown fencing.

JSON format:
{
  "themes": [
    { "theme": "short label, 3-7 words", "count": 2, "exampleQuote": "exact phrase from a review" }
  ]
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    const themes = Array.isArray(parsed.themes) ? parsed.themes : [];
    return {
      themes: themes.map((t: any) => ({
        theme: String(t.theme || ""),
        count: Number(t.count) || 1,
        exampleQuote: String(t.exampleQuote || ""),
      })),
    };
  } catch {
    console.error("[ReviewSentiment] Failed to parse theme extraction JSON");
    return { themes: [] };
  }
}

// ─── Gap Comparison ──────────────────────────────────────────────────

/**
 * Given two sets of themes, use Claude to identify which competitor themes
 * are NOT present in the org's themes, and produce the insight sentence.
 */
async function compareThemes(
  yourThemes: ThemeCitation[],
  competitorThemes: ThemeCitation[],
  competitorName: string,
  businessName: string,
): Promise<{ gaps: SentimentComparison["gaps"]; insight: string }> {
  // If either side is empty, we cannot compare
  if (competitorThemes.length === 0) {
    return {
      gaps: [],
      insight: `Not enough competitor reviews to identify themes for ${competitorName}.`,
    };
  }
  if (yourThemes.length === 0) {
    return {
      gaps: competitorThemes.map((t) => ({
        theme: t.theme,
        competitorCount: t.count,
        exampleQuote: t.exampleQuote,
      })),
      insight: `Not enough of your reviews to compare themes. ${competitorName} is known for "${competitorThemes[0].theme}."`,
    };
  }

  const response = await getAnthropic().messages.create({
    model: LLM_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `You are comparing review themes between two businesses.

"${businessName}" themes:
${yourThemes.map((t) => `- "${t.theme}" (${t.count} reviews, e.g. "${t.exampleQuote}")`).join("\n")}

"${competitorName}" themes:
${competitorThemes.map((t) => `- "${t.theme}" (${t.count} reviews, e.g. "${t.exampleQuote}")`).join("\n")}

1. Identify which competitor themes do NOT appear in ${businessName}'s themes. A theme is a "gap" if ${businessName}'s reviews never mention that quality. Two themes match if they describe the same quality even with different wording.

2. Write ONE plain-English insight sentence about the most important gap. This sentence should make the business owner stop scrolling. Be specific. Reference the competitor name and the exact theme language. No em-dashes.

Return valid JSON only, no markdown fencing:
{
  "gaps": [
    { "theme": "the competitor theme label", "competitorCount": 3, "exampleQuote": "exact quote from competitor reviews" }
  ],
  "insight": "one sentence"
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      gaps: Array.isArray(parsed.gaps)
        ? parsed.gaps.map((g: any) => ({
            theme: String(g.theme || ""),
            competitorCount: Number(g.competitorCount) || 1,
            exampleQuote: String(g.exampleQuote || ""),
          }))
        : [],
      insight: String(parsed.insight || ""),
    };
  } catch {
    console.error("[ReviewSentiment] Failed to parse comparison JSON");
    return { gaps: [], insight: "" };
  }
}

// ─── Main Export: Full Theme Comparison ──────────────────────────────

/**
 * Compare review sentiment themes between a business and its competitor.
 *
 * Callable from the one-action card engine and the Monday email.
 *
 * Accepts either place IDs (will fetch reviews from Google) or
 * pre-fetched review arrays (for when reviews are already in checkup_data).
 */
export async function compareReviewSentiment(opts: {
  clientPlaceId?: string;
  clientName: string;
  clientReviews?: { text: string; rating: number; authorName: string }[];
  competitorPlaceId?: string;
  competitorName: string;
  competitorReviews?: { text: string; rating: number; authorName: string }[];
}): Promise<SentimentComparison> {
  const {
    clientPlaceId,
    clientName,
    clientReviews: providedClientReviews,
    competitorPlaceId,
    competitorName,
    competitorReviews: providedCompetitorReviews,
  } = opts;

  // Resolve reviews: use provided reviews or fetch from Google
  const [clientReviews, competitorReviews] = await Promise.all([
    providedClientReviews && providedClientReviews.length > 0
      ? Promise.resolve(
          providedClientReviews.map((r) => ({
            ...r,
            relativePublishTimeDescription: "",
          })),
        )
      : clientPlaceId
        ? fetchReviews(clientPlaceId)
        : Promise.resolve([] as ReviewData[]),
    providedCompetitorReviews && providedCompetitorReviews.length > 0
      ? Promise.resolve(
          providedCompetitorReviews.map((r) => ({
            ...r,
            relativePublishTimeDescription: "",
          })),
        )
      : competitorPlaceId
        ? fetchReviews(competitorPlaceId)
        : Promise.resolve([] as ReviewData[]),
  ]);

  // Minimum review threshold: at least 2 on each side for meaningful themes
  const emptyResult: SentimentComparison = {
    competitorName,
    competitorThemes: [],
    yourThemes: [],
    gaps: [],
    insight: "",
  };

  if (clientReviews.length < 2 && competitorReviews.length < 2) {
    emptyResult.insight =
      "Not enough reviews on either side to identify meaningful themes. " +
      "This comparison becomes powerful once there are at least 5 reviews each.";
    return emptyResult;
  }

  // Extract themes in parallel
  const [yourExtracted, competitorExtracted] = await Promise.all([
    extractThemes(clientReviews, clientName),
    extractThemes(competitorReviews, competitorName),
  ]);

  // Compare and find gaps
  const { gaps, insight } = await compareThemes(
    yourExtracted.themes,
    competitorExtracted.themes,
    competitorName,
    clientName,
  );

  return {
    competitorName,
    competitorThemes: competitorExtracted.themes,
    yourThemes: yourExtracted.themes,
    gaps,
    insight,
  };
}

// ─── Legacy Export: Single Insight (backward compatible) ─────────────

/**
 * Analyze reviews for one "how did they know that" insight.
 *
 * Rules:
 * - One finding only. Specific, not generic.
 * - Must reference something from the actual review text.
 * - Must be something the practice owner likely doesn't know.
 * - No em-dashes. Ever.
 */
export async function analyzeReviewSentiment(
  clientPlaceId: string,
  clientName: string,
  competitorPlaceId: string | null,
  competitorName: string | null,
  specialty: string,
): Promise<SentimentInsight | null> {
  // Fetch reviews in parallel
  const [clientReviews, competitorReviews] = await Promise.all([
    fetchReviews(clientPlaceId),
    competitorPlaceId ? fetchReviews(competitorPlaceId) : Promise.resolve([]),
  ]);

  // Need at least 2 client reviews to generate meaningful insight
  if (clientReviews.length < 2) return null;

  const clientReviewText = clientReviews
    .map((r) => `[${r.rating}★] "${r.text}"`)
    .join("\n");

  const competitorReviewText =
    competitorReviews.length > 0
      ? competitorReviews.map((r) => `[${r.rating}★] "${r.text}"`).join("\n")
      : "No competitor reviews available.";

  try {
    const response = await getAnthropic().messages.create({
      model: LLM_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are analyzing Google reviews for a ${specialty} business called "${clientName}".

YOUR REVIEWS:
${clientReviewText}

${competitorName ? `TOP COMPETITOR (${competitorName}) REVIEWS:\n${competitorReviewText}` : ""}

Extract ONE specific insight the business owner probably doesn't know. Look for:
- A recurring theme customers mention (positive or negative) that the owner may not realize is visible
- A specific strength customers praise that the competitor's customers don't mention (or vice versa)
- A pattern in negative feedback that reveals an operational blind spot

Respond in exactly this JSON format, nothing else:
{
  "title": "short title, 5-8 words",
  "detail": "one sentence, specific, references actual review language, no em-dashes",
  "yourTheme": "the recurring theme in your reviews, 3-5 words",
  "competitorTheme": "what competitor reviews highlight that yours don't, 3-5 words, or 'N/A'",
  "actionable": "one specific action the owner can take this week"
}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);

    return {
      type: "sentiment_insight",
      title: parsed.title,
      detail: parsed.detail,
      yourTheme: parsed.yourTheme,
      competitorTheme: parsed.competitorTheme,
      actionable: parsed.actionable,
    };
  } catch (err) {
    console.error(
      "[ReviewSentiment] Claude analysis failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
