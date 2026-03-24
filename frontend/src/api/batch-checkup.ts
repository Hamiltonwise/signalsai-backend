/**
 * Batch Checkup API Client — WO18
 */

import { apiGet, apiPost } from "./index";

export interface BatchPractice {
  name: string;
  city: string;
  state: string;
}

export interface BatchResult {
  id: string;
  practiceName: string;
  city: string;
  state: string;
  score: number | null;
  topCompetitorName: string | null;
  topCompetitorReviews: number | null;
  practiceReviews: number | null;
  primaryGap: string | null;
  placeId: string | null;
  emailParagraph: string | null;
  status: string;
}

export interface BatchStatus {
  success: boolean;
  batchId: string;
  status: "processing" | "completed";
  total: number;
  completed: number;
  failed: number;
  results: BatchResult[];
}

export async function submitBatch(
  practices: BatchPractice[],
): Promise<{ success: boolean; batchId: string; status: string; total: number }> {
  return apiPost({
    path: "/admin/batch-checkup",
    passedData: { practices },
  });
}

export async function pollBatch(batchId: string): Promise<BatchStatus> {
  return apiGet({ path: `/admin/batch-checkup/${batchId}` });
}
