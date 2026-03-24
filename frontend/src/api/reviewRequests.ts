/**
 * Review Requests API — post-appointment review generation
 */

import { apiGet, apiPost } from "./index";

export interface ReviewRequest {
  id: string;
  organization_id: number;
  location_id: number | null;
  place_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  google_review_url: string;
  status: "sent" | "clicked" | "converted";
  sent_at: string;
  clicked_at: string | null;
  converted_at: string | null;
  created_at: string;
}

export interface ReviewRequestStats {
  total: number;
  clicked: number;
  converted: number;
}

export async function sendReviewRequest(params: {
  recipientEmail: string;
  recipientName?: string;
  placeId: string;
  locationId?: number;
  practiceName: string;
}): Promise<{ success: boolean; requestId?: string; error?: string }> {
  return apiPost({
    path: "/api/review-requests/send",
    passedData: params,
  });
}

export async function listReviewRequests(params?: {
  limit?: number;
  offset?: number;
}): Promise<{
  success: boolean;
  requests: ReviewRequest[];
  total: number;
  stats: ReviewRequestStats;
}> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiGet({ path: `/api/review-requests${qs ? `?${qs}` : ""}` });
}
