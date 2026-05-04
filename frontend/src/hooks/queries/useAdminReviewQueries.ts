import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteReview,
  fetchReviews,
  fetchReviewStats,
  getReviewJobStatus,
  toggleReviewHidden,
  triggerApifyReviewFetch,
  triggerReviewSync,
} from "../../api/reviewBlocks";
import type { ReviewItem, ReviewStats } from "../../api/reviewBlocks";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";

export type ReviewListParams = {
  search?: string;
  stars?: number;
  showHidden?: boolean;
};

export function useAdminReviewStats(projectId: string) {
  const queryKey = QUERY_KEYS.adminWebsiteReviewStats(projectId);

  return useQuery<ReviewStats>({
    queryKey,
    queryFn: async () => {
      const response = await fetchReviewStats(projectId);
      return response.data;
    },
    initialData: () => queryClient.getQueryData<ReviewStats>(queryKey),
    initialDataUpdatedAt: () => queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

export function useAdminReviews(projectId: string, params: ReviewListParams) {
  const queryKey = QUERY_KEYS.adminWebsiteReviews(projectId, params);

  return useQuery<ReviewItem[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetchReviews(projectId, params);
      return response.data;
    },
    initialData: () => queryClient.getQueryData<ReviewItem[]>(queryKey),
    initialDataUpdatedAt: () => queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

export function useAdminReviewJob(projectId: string, jobId?: string, enabled = false) {
  return useQuery({
    queryKey: QUERY_KEYS.adminWebsiteReviewJob(projectId, jobId || ""),
    queryFn: async () => {
      if (!jobId) throw new Error("Missing review job id");
      const response = await getReviewJobStatus(projectId, jobId);
      return response.data;
    },
    enabled: enabled && !!jobId,
    refetchInterval: enabled ? 3000 : false,
  });
}

export function useReviewActions(projectId: string) {
  const qc = useQueryClient();
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.adminWebsiteReviewStatsAll(projectId) });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.adminWebsiteReviewsAll(projectId) });
  }, [projectId, qc]);

  return {
    sync: useMutation({ mutationFn: () => triggerReviewSync(projectId) }),
    fetchMaps: useMutation({ mutationFn: (placeIds: string[]) => triggerApifyReviewFetch(projectId, placeIds) }),
    toggleHidden: useMutation({
      mutationFn: ({ reviewId, hidden }: { reviewId: string; hidden: boolean }) =>
        toggleReviewHidden(projectId, reviewId, hidden),
      onSuccess: invalidate,
    }),
    deleteReview: useMutation({
      mutationFn: (reviewId: string) => deleteReview(projectId, reviewId),
      onSuccess: invalidate,
    }),
    invalidate,
  };
}
