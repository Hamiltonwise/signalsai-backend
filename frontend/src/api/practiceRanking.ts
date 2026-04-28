import { apiGet, apiPost, apiDelete } from "./index";

/**
 * Practice Ranking v2 — Curated Competitor Lists frontend API
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

export type LocationCompetitorOnboardingStatus =
  | "pending"
  | "curating"
  | "finalized";
export type LocationCompetitorSource = "initial_scrape" | "user_added";

export interface CuratedCompetitor {
  id: number;
  placeId: string;
  name: string;
  address: string | null;
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  photoName: string | null;
  source: LocationCompetitorSource;
  addedAt: string;
  addedByUserId: number | null;
}

export interface PracticeLocationRef {
  placeId: string;
  lat: number;
  lng: number;
}

export type SelfFilterStatus = "resolved" | "unresolved";

export interface GetLocationCompetitorsResponse {
  success: true;
  onboarding: {
    status: LocationCompetitorOnboardingStatus;
    finalizedAt: string | null;
  };
  practiceLocation: PracticeLocationRef | null;
  selfFilterStatus: SelfFilterStatus;
  competitors: CuratedCompetitor[];
  count: number;
  cap: number;
}

export interface RunDiscoveryResponse {
  success: true;
  status: "fresh" | "stale_skipped" | "completed";
  competitorCount: number;
  specialty: string | null;
  marketLocation: string | null;
}

export interface AddCompetitorResponse {
  success: true;
  added: CuratedCompetitor;
  activeCount: number;
  cap: number;
}

export interface RemoveCompetitorResponse {
  success: true;
  removed: number;
  activeCount: number;
  cap: number;
}

export interface FinalizeAndRunResponse {
  success: true;
  batchId: string;
  rankingId: number;
  reused: boolean;
}

export type BatchStatus = "processing" | "completed" | "failed";

export interface RankingStatusDetail {
  currentStep?: string;
  message?: string;
  progress?: number;
  stepsCompleted?: string[];
  timestamps?: Record<string, string>;
}

export interface BatchRankingItem {
  id: number;
  gbpLocationId: string;
  gbpLocationName: string | null;
  status: string;
  statusDetail: RankingStatusDetail | null;
  rankScore: number | null;
  rankPosition: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetBatchStatusResponse {
  success: true;
  batchId: string;
  status: BatchStatus;
  totalLocations: number;
  completedLocations: number;
  failedLocations: number;
  pendingLocations?: number;
  rankings: BatchRankingItem[];
  progress: number;
}

const BASE = "/practice-ranking/locations";

export async function getLocationCompetitors(
  locationId: number
): Promise<GetLocationCompetitorsResponse> {
  return apiGet({ path: `${BASE}/${locationId}/competitors` });
}

export async function runCompetitorDiscovery(
  locationId: number
): Promise<RunDiscoveryResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors/discover`,
    passedData: {},
  });
}

export async function addLocationCompetitor(
  locationId: number,
  placeId: string
): Promise<AddCompetitorResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors`,
    passedData: { placeId },
  });
}

export async function removeLocationCompetitor(
  locationId: number,
  placeId: string
): Promise<RemoveCompetitorResponse> {
  return apiDelete({
    path: `${BASE}/${locationId}/competitors/${encodeURIComponent(placeId)}`,
  });
}

export async function finalizeAndRun(
  locationId: number
): Promise<FinalizeAndRunResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors/finalize-and-run`,
    passedData: {},
  });
}

export async function getBatchStatus(
  batchId: string
): Promise<GetBatchStatusResponse> {
  return apiGet({
    path: `/practice-ranking/batch/${encodeURIComponent(batchId)}/status`,
  });
}

export interface InFlightRanking {
  rankingId: number;
  batchId: string;
  status: string;
  statusDetail: RankingStatusDetail | null;
  gbpLocationName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetInFlightRankingResponse {
  success: true;
  ranking: InFlightRanking | null;
}

export async function getInFlightRanking(
  googleAccountId: number,
  locationId?: number | null
): Promise<GetInFlightRankingResponse> {
  const qs = new URLSearchParams({
    googleAccountId: String(googleAccountId),
  });
  if (locationId) qs.set("locationId", String(locationId));
  return apiGet({ path: `/practice-ranking/in-flight?${qs.toString()}` });
}
