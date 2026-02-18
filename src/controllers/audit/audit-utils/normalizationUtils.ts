import { ensureLatLng } from "./locationUtils";

export function normalizeWebsiteAnalysis(data: any): any | null {
  if (!data) return null;
  return {
    overall_score: Number(data.overall_score),
    overall_grade: data.overall_grade,
    pillars: data.pillars.map((p: any) => ({
      ...p,
      score: Number(p.score),
    })),
  };
}

export function normalizeSelfGBP(data: any): any | null {
  if (!data) return null;
  return {
    ...data,
    totalScore: data.totalScore ?? data.averageStarRating ?? 0,
  };
}

export function normalizeCompetitors(
  competitorsData: any,
  selfGbpData: any
): any[] | null {
  if (!competitorsData?.competitors) return null;

  // Extract placeId from step_self_gbp to filter out self
  const selfPlaceId = selfGbpData?.placeId || null;

  return competitorsData.competitors
    .filter((c: any) => c.placeId !== selfPlaceId)
    .map((c: any, index: number) => ({
      ...c,
      location: ensureLatLng(c.location, selfGbpData?.location, index),
      totalScore: c.totalScore ?? c.averageStarRating ?? 0,
    }));
}

export function normalizeGBPAnalysis(data: any): any | null {
  if (!data) return null;
  return {
    ...data,
    gbp_readiness_score: Number(data.gbp_readiness_score),
    pillars: data.pillars.map((p: any) => ({
      ...p,
      score: Number(p.score),
    })),
  };
}
