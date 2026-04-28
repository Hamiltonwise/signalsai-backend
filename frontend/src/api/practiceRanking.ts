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
  source: LocationCompetitorSource;
  addedAt: string;
  addedByUserId: number | null;
}

export interface GetLocationCompetitorsResponse {
  success: true;
  onboarding: {
    status: LocationCompetitorOnboardingStatus;
    finalizedAt: string | null;
  };
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
