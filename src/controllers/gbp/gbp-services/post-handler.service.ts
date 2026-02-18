import axios from "axios";
import { buildAuthHeaders } from "./gbp-api.service";

/**
 * List local posts in date range with early exit optimization.
 * Exported for use in practice ranking.
 */
export async function listLocalPostsInRange(
  auth: any,
  accountId: string,
  locationId: string,
  startDate: string,
  endDate: string,
  maxPosts: number = 50,
) {
  const parent = `accounts/${accountId}/locations/${locationId}`;
  const headers = await buildAuthHeaders(auth);
  const posts: any[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await axios.get(
      `https://mybusiness.googleapis.com/v4/${parent}/localPosts`,
      {
        params: { pageSize: 100, pageToken },
        headers,
      },
    );

    let shouldContinue = false;

    for (const post of data.localPosts || []) {
      const created = post.createTime;

      // If post is older than our range, stop fetching
      if (created < `${startDate}T00:00:00Z`) {
        shouldContinue = false;
        break;
      }

      // If post is within our range, collect it
      if (
        created >= `${startDate}T00:00:00Z` &&
        created <= `${endDate}T23:59:59Z`
      ) {
        posts.push({
          postId: post.name?.split("/").pop() || "",
          topicType: post.topicType || "STANDARD",
          summary: post.summary || "",
          callToAction: post.callToAction
            ? {
                actionType: post.callToAction.actionType || null,
                url: post.callToAction.url || null,
              }
            : null,
          createTime: post.createTime,
          updateTime: post.updateTime,
          state: post.state || "UNKNOWN",
        });
        shouldContinue = true;

        // Enforce max posts limit for LLM
        if (posts.length >= maxPosts) {
          shouldContinue = false;
          break;
        }
      }
    }

    // Exit early if we've passed our date range or hit max
    if (!shouldContinue) break;

    pageToken = data.nextPageToken;
  } while (pageToken);

  return posts;
}
