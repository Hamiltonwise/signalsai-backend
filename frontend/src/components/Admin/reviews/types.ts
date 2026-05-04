export type ReviewLocation = {
  name: string;
  place_id: string;
  is_primary?: boolean;
  review_count?: number | null;
};

export type JobType = "sync" | "fetch";
export type JobState = "waiting" | "active" | "completed" | "failed" | "unknown";

export type ActiveReviewJob = {
  jobId: string;
  type: JobType;
  state: JobState;
  startedAt: number;
  placeCount?: number;
  failedReason?: string;
};
