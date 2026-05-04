import type { ActiveReviewJob } from "./types";

const STORAGE_KEY_PREFIX = "alloro:review-job:";
const JOB_TTL_MS = 10 * 60 * 1000;

export function getStoredReviewJob(projectId: string): ActiveReviewJob | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`);
    if (!raw) return null;

    const job = JSON.parse(raw) as ActiveReviewJob;
    if (Date.now() - job.startedAt > JOB_TTL_MS) {
      clearStoredReviewJob(projectId);
      return null;
    }

    return job;
  } catch {
    return null;
  }
}

export function storeReviewJob(projectId: string, job: ActiveReviewJob): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, JSON.stringify(job));
}

export function clearStoredReviewJob(projectId: string): void {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${projectId}`);
}
