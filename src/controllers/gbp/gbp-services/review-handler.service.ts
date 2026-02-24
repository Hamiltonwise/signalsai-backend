import axios from "axios";
import { buildAuthHeaders } from "./gbp-api.service";

/** Reviews v4 via REST (paginate & compute window stats) */
export async function listAllReviewsInRangeREST(
  auth: any,
  accountId: string,
  locationId: string,
  startDate: string,
  endDate: string,
) {
  const parentPath = `accounts/${accountId}/locations/${locationId}`;
  const headers = await buildAuthHeaders(auth);

  const STAR_TO_NUM: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  };

  const reviews: any[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await axios.get(
      `https://mybusiness.googleapis.com/v4/${parentPath}/reviews`,
      {
        params: { pageSize: 50, pageToken, orderBy: "updateTime desc" },
        headers,
      },
    );

    for (const r of data.reviews || []) {
      const created: string | undefined = r.createTime; // count NEW by createTime
      if (
        created &&
        created >= `${startDate}T00:00:00Z` &&
        created <= `${endDate}T23:59:59Z`
      ) {
        reviews.push(r);
      }
    }
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  // enum -> number
  const stars = reviews
    .map((r) => {
      const s = r.starRating;
      if (typeof s === "number") return s;
      if (typeof s === "string") return STAR_TO_NUM[s];
      return undefined;
    })
    .filter((n: number | undefined): n is number =>
      Number.isFinite(n as number),
    );

  const avgRatingWindow = stars.length
    ? Number((stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(2))
    : null;

  // Build structured review details for agent consumption
  const reviewDetails = reviews.map((r: any) => {
    const numericRating = typeof r.starRating === "number"
      ? r.starRating
      : (STAR_TO_NUM[r.starRating] ?? null);

    return {
      stars: numericRating,
      text: r.comment || null,
      reviewerName: r.reviewer?.displayName || null,
      isAnonymous: r.reviewer?.isAnonymous || false,
      createdAt: r.createTime || null,
      hasReply: !!(r.reviewReply?.comment),
      replyText: r.reviewReply?.comment || null,
      replyDate: r.reviewReply?.updateTime || null,
    };
  });

  return { newReviewsCount: reviews.length, avgRatingWindow, reviewDetails };
}
