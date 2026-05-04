/**
 * GBP Review Reply Service
 *
 * Posts approved review responses back to Google Business Profile.
 * This is the first DFY (Done For You) action in Alloro.
 *
 * The customer approves a draft, we post it to Google.
 * They open their GBP and see a response they didn't write.
 * "How did they do that?"
 */

import axios from "axios";
import { getValidOAuth2ClientByOrg } from "../auth/oauth2Helper";
import { buildAuthHeaders } from "../controllers/gbp/gbp-services/gbp-api.service";
import { db } from "../database/connection";
import { getLocationScope } from "./locationScope/locationScope";

/**
 * Post a review reply to Google Business Profile.
 *
 * @param orgId - Organization ID (to look up OAuth credentials)
 * @param reviewResourceName - Full Google review path (e.g., "accounts/123/locations/456/reviews/789")
 * @param replyText - The response text to post
 * @returns true if posted successfully, false otherwise
 */
export async function replyToGoogleReview(
  orgId: number,
  reviewResourceName: string,
  replyText: string,
): Promise<{ success: boolean; error?: string }> {
  if (!reviewResourceName || !replyText) {
    return { success: false, error: "Missing review name or reply text" };
  }

  try {
    // Get authenticated OAuth2 client for this org
    const auth = await getValidOAuth2ClientByOrg(orgId);
    const headers = await buildAuthHeaders(auth);

    // GBP API: PUT reply on the review
    // https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply
    const url = `https://mybusiness.googleapis.com/v4/${reviewResourceName}/reply`;

    await axios.put(
      url,
      { comment: replyText },
      { headers, timeout: 15000 },
    );

    console.log(`[GBPReply] Posted reply to ${reviewResourceName} for org ${orgId}`);
    return { success: true };
  } catch (err: any) {
    const status = err?.response?.status;
    const message = err?.response?.data?.error?.message || err.message;

    // Common failure cases
    if (status === 404) {
      console.error(`[GBPReply] Review not found: ${reviewResourceName}`);
      return { success: false, error: "Review not found on Google. It may have been deleted." };
    }
    if (status === 403) {
      console.error(`[GBPReply] Permission denied for org ${orgId}: ${message}`);
      return { success: false, error: "Permission denied. The business may need to reconnect Google." };
    }
    if (status === 401) {
      console.error(`[GBPReply] Auth expired for org ${orgId}: ${message}`);
      return { success: false, error: "Google connection expired. Please reconnect." };
    }

    console.error(`[GBPReply] Failed for org ${orgId}:`, message);
    return { success: false, error: `Failed to post reply: ${message}` };
  }
}

/**
 * Approve a review draft and post it to GBP in one step.
 * Updates the database record and posts to Google.
 */
export async function approveAndPostReview(
  orgId: number,
  notificationId: number,
  replyText: string,
  locationScope?: number[],
): Promise<{ success: boolean; posted: boolean; error?: string }> {
  // Get the review notification
  const review = await db("review_notifications")
    .where({ id: notificationId, organization_id: orgId })
    .first();

  if (!review) {
    return { success: false, posted: false, error: "Review not found" };
  }

  // Card G-foundation: validate the scope and the review's location.
  // review_notifications has location_id; an out-of-scope review is
  // refused before we touch GBP.
  if (locationScope !== undefined) {
    await getLocationScope(orgId, locationScope);
    if (
      review.location_id !== null &&
      review.location_id !== undefined &&
      !locationScope.includes(review.location_id)
    ) {
      return {
        success: false,
        posted: false,
        error: "Review is outside the requested location scope.",
      };
    }
  }

  const reviewName = review.review_google_id;

  // Update the DB with approved response
  await db("review_notifications").where({ id: notificationId }).update({
    status: "responded",
    ai_response: replyText,
    updated_at: new Date(),
  });

  // Check if org has GBP connected
  const connection = await db("google_connections")
    .where({ organization_id: orgId })
    .first();

  if (!connection || !reviewName) {
    // Approved but can't post (no GBP connection or no review ID)
    console.log(`[GBPReply] Review ${notificationId} approved but no GBP connection for org ${orgId}`);
    return { success: true, posted: false, error: "Response saved. Connect Google to auto-post." };
  }

  // Post to Google
  const result = await replyToGoogleReview(orgId, reviewName, replyText);

  if (result.success) {
    // Record the DFY action
    await db("behavioral_events").insert({
      event_type: "dfy.review_reply_posted",
      org_id: orgId,
      properties: JSON.stringify({
        review_notification_id: notificationId,
        review_google_id: reviewName,
        star_rating: review.star_rating,
        reviewer_name: review.reviewer_name,
      }),
    }).catch(() => {});

    return { success: true, posted: true };
  }

  // Approved in DB but failed to post to Google
  return { success: true, posted: false, error: result.error };
}
