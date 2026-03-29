/**
 * Review Monitor Service
 *
 * Polls Google Places API for new reviews on connected practices.
 * For each new review:
 *   1. Stores in review_notifications
 *   2. Generates AI response via Claude
 *   3. Sends Slack notification to org owner
 *
 * Called by: POST /api/admin/reviews/poll (manual) or scheduled agent.
 */

import axios from "axios";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../database/connection";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API;
const PLACES_API_BASE = "https://places.googleapis.com/v1";
const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
const SLACK_WEBHOOK = process.env.REVIEW_SLACK_WEBHOOK || "";

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// ─── Fetch reviews from Google Places API ───────────────────────────

interface GoogleReview {
  name: string; // review resource name (used as dedup ID)
  relativePublishTimeDescription: string;
  rating: number;
  text?: { text: string; languageCode: string };
  authorAttribution?: { displayName: string };
  publishTime?: string;
}

const REVIEW_FIELD_MASK = [
  "reviews.name",
  "reviews.rating",
  "reviews.text",
  "reviews.authorAttribution",
  "reviews.publishTime",
  "reviews.relativePublishTimeDescription",
].join(",");

async function fetchPlaceReviews(placeId: string): Promise<GoogleReview[]> {
  if (!GOOGLE_PLACES_API_KEY) return [];

  try {
    const response = await axios.get(
      `${PLACES_API_BASE}/places/${placeId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask": REVIEW_FIELD_MASK,
        },
      },
    );
    return response.data?.reviews || [];
  } catch (err: any) {
    console.error(`[ReviewMonitor] Failed to fetch reviews for ${placeId}:`, err.message);
    return [];
  }
}

// ─── Generate AI response ───────────────────────────────────────────

async function generateResponse(
  practiceName: string,
  specialty: string,
  reviewerName: string,
  starRating: number,
  reviewText: string,
): Promise<string> {
  try {
    const client = getAnthropic();

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 300,
      system: `You write professional, warm reply responses to Google reviews on behalf of dental and medical practices. Rules:
- Thank the reviewer by first name
- If positive (4-5 stars): express gratitude, mention something specific from their review, invite them to share with friends
- If negative (1-2 stars): empathize, apologize for the experience, invite them to contact the office directly to resolve
- If neutral (3 stars): thank them, acknowledge feedback, express commitment to improvement
- Keep under 80 words
- Sound human, not corporate. No emojis. No exclamation marks on negative reviews.
- Sign off with the practice name, not a person's name`,
      messages: [
        {
          role: "user",
          content: `Practice: ${practiceName} (${specialty})
Reviewer: ${reviewerName}
Rating: ${starRating}/5 stars
Review: "${reviewText}"

Write a reply.`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return text.trim();
  } catch (err: any) {
    console.error("[ReviewMonitor] Claude response generation failed:", err.message);
    return "";
  }
}

// ─── Slack notification ─────────────────────────────────────────────

async function sendSlackNotification(
  practiceName: string,
  reviewerName: string,
  starRating: number,
  reviewText: string,
  aiResponse: string,
): Promise<void> {
  if (!SLACK_WEBHOOK) return;

  const stars = "★".repeat(starRating) + "☆".repeat(5 - starRating);
  const color = starRating >= 4 ? "#10b981" : starRating >= 3 ? "#f59e0b" : "#ef4444";

  try {
    await axios.post(SLACK_WEBHOOK, {
      attachments: [
        {
          color,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `New Review: ${practiceName}`,
              },
            },
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: `*Rating:* ${stars} (${starRating}/5)` },
                { type: "mrkdwn", text: `*Reviewer:* ${reviewerName}` },
              ],
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `> ${reviewText.slice(0, 500)}`,
              },
            },
            ...(aiResponse
              ? [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `*Suggested Response:*\n${aiResponse}`,
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    });
  } catch (err: any) {
    console.error("[ReviewMonitor] Slack notification failed:", err.message);
  }
}

// ─── Poll reviews for a single practice ─────────────────────────────

export interface PollResult {
  orgId: number;
  practiceName: string;
  newReviews: number;
  totalReviews: number;
}

export async function pollPracticeReviews(
  orgId: number,
  locationId: number | null,
  placeId: string,
  practiceName: string,
  specialty: string,
): Promise<PollResult> {
  const reviews = await fetchPlaceReviews(placeId);

  let newCount = 0;

  for (const review of reviews) {
    const googleId = review.name; // unique review resource name
    if (!googleId) continue;

    // Check if we already have this review
    const existing = await db("review_notifications")
      .where({ review_google_id: googleId })
      .first();

    if (existing) continue;

    const reviewerName = review.authorAttribution?.displayName || "Anonymous";
    const starRating = review.rating || 0;
    const reviewText = review.text?.text || "";
    const publishedAt = review.publishTime || null;

    // Generate AI response
    const aiResponse = reviewText
      ? await generateResponse(practiceName, specialty, reviewerName, starRating, reviewText)
      : "";

    // Store
    await db("review_notifications").insert({
      organization_id: orgId,
      location_id: locationId,
      place_id: placeId,
      reviewer_name: reviewerName,
      star_rating: starRating,
      review_text: reviewText,
      ai_response: aiResponse,
      status: "new",
      review_google_id: googleId,
      review_published_at: publishedAt,
      slack_notified: false,
    });

    // Write to notifications table (feeds the bell popover)
    const stars = "\u2605".repeat(starRating) + "\u2606".repeat(5 - starRating);
    await db("notifications").insert({
      organization_id: orgId,
      location_id: locationId,
      title: `New ${starRating}-star review from ${reviewerName}`,
      message: reviewText
        ? `${stars}  ${reviewText.slice(0, 200)}${reviewText.length > 200 ? "..." : ""}`
        : `${stars}  ${reviewerName} left a ${starRating}-star review.`,
      type: "pms",
      read: false,
      metadata: JSON.stringify({
        source: "review_monitor",
        reviewer_name: reviewerName,
        star_rating: starRating,
        review_google_id: googleId,
      }),
      created_at: new Date(),
      updated_at: new Date(),
    }).catch(() => {});

    // Send Slack notification
    await sendSlackNotification(practiceName, reviewerName, starRating, reviewText, aiResponse);

    // Mark as notified
    await db("review_notifications")
      .where({ review_google_id: googleId })
      .update({ slack_notified: true });

    newCount++;

    // Small delay between API calls
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(
    `[ReviewMonitor] ${practiceName}: ${newCount} new review(s) of ${reviews.length} total`,
  );

  return {
    orgId,
    practiceName,
    newReviews: newCount,
    totalReviews: reviews.length,
  };
}

// ─── Poll all connected practices ───────────────────────────────────

export async function pollAllPractices(): Promise<PollResult[]> {
  // Find all orgs with review_requests that have place_ids (known connected practices)
  // Also check locations with business_data containing place_id
  const practicesWithPlaceIds = await db("review_requests")
    .select("organization_id", "place_id")
    .whereNotNull("place_id")
    .groupBy("organization_id", "place_id");

  // Also get from batch_checkup_results for any analyzed practices
  const batchResults = await db("batch_checkup_results")
    .select("practice_name", "city", "state", "place_id")
    .whereNotNull("place_id")
    .where("status", "completed")
    .groupBy("practice_name", "city", "state", "place_id");

  // Combine and deduplicate by place_id
  const placeMap = new Map<string, { orgId: number; locationId: number | null; name: string; specialty: string }>();

  for (const row of practicesWithPlaceIds) {
    if (!placeMap.has(row.place_id)) {
      const org = await db("organizations").where({ id: row.organization_id }).first();
      placeMap.set(row.place_id, {
        orgId: row.organization_id,
        locationId: null,
        name: org?.name || `Org #${row.organization_id}`,
        specialty: "practice",
      });
    }
  }

  const results: PollResult[] = [];

  for (const [placeId, info] of placeMap) {
    try {
      const result = await pollPracticeReviews(
        info.orgId,
        info.locationId,
        placeId,
        info.name,
        info.specialty,
      );
      results.push(result);
    } catch (err: any) {
      console.error(`[ReviewMonitor] Error polling ${info.name}:`, err.message);
    }

    // Rate limit: 1 second between practices
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
