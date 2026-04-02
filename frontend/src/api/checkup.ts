/**
 * Checkup API -- Free Referral Base Checkup analysis
 */

import { getSessionId } from "./tracking";

export interface CheckupScore {
  composite: number;
  reputation: number;
  visibility: number;
  competitive: number;
  // Extended sub-scores (populated when available)
  trustSignal?: number;
  firstImpression?: number;
  responsiveness?: number;
  competitiveEdge?: number;
  localVisibility?: number;
  onlinePresence?: number;
  reviewHealth?: number;
}

export interface CheckupCompetitor {
  name: string;
  rating: number;
  reviewCount: number;
  placeId: string;
  location?: { lat: number; lng: number };
}

export interface CheckupFinding {
  type: string;
  title: string;
  detail: string;
  value: number;
  impact: number;
}

export interface CheckupMarket {
  city: string;
  totalCompetitors: number;
  avgRating: number;
  avgReviews: number;
  rank: number;
}

export interface CheckupGapVelocity {
  clientWeekly: number;
  competitorWeekly: number;
  weeksToPass: number | null;
  thisWeekAsk: number;
  competitorName: string;
}

export interface CheckupGapItem {
  id: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  action: string;
  timeEstimate: string;
  competitorName: string | null;
  velocity?: CheckupGapVelocity;
}

export interface CheckupAnalysis {
  success: boolean;
  score: CheckupScore;
  topCompetitor: CheckupCompetitor | null;
  competitors: CheckupCompetitor[];
  findings: CheckupFinding[];
  totalImpact: number;
  market: CheckupMarket;
  gaps: CheckupGapItem[];
}

/**
 * Run a checkup analysis for a practice
 */
export async function analyzeCheckup(params: {
  name: string;
  city: string;
  state: string;
  category: string;
  types: string[];
  rating: number | null;
  reviewCount: number;
  placeId: string;
  location?: { latitude: number; longitude: number } | null;
  // Oz reveals: extra GBP data for deeper insights
  photosCount?: number;
  hasHours?: boolean;
  regularOpeningHours?: { weekdayDescriptions?: string[]; periods?: any[] } | null;
  websiteUri?: string | null;
  phone?: string | null;
  // Oz homework: deeper signals
  editorialSummary?: string | null;
  openingDate?: string | null;
  businessStatus?: string | null;
  reviews?: Array<{ text: string; rating: number; author: string; time?: string; when?: string }> | null;
}): Promise<CheckupAnalysis> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000); // 45s timeout

  try {
    const response = await fetch("/api/checkup/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, session_id: getSessionId() }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Checkup analysis failed: ${response.statusText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send checkup result email to prospect
 */
export async function sendCheckupEmail(params: {
  email: string;
  practiceName: string;
  city: string;
  compositeScore: number;
  topCompetitorName: string | null;
  topCompetitorReviews: number | null;
  practiceReviews: number;
  finding: string;
  rank: number;
  totalCompetitors: number;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const response = await fetch("/api/checkup/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return response.json();
}

/**
 * Trigger ClearPath website build after email capture
 */
export async function triggerBuild(params: {
  email: string;
  placeId: string;
  practiceName: string;
  specialty: string;
  city: string;
}): Promise<{ success: boolean; status?: string; estimated_minutes?: number }> {
  const response = await fetch("/api/checkup/build-trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  return response.json();
}

/**
 * Validate a referral code and get referrer info
 */
export async function validateReferralCode(
  code: string
): Promise<{ success: boolean; valid: boolean; referrerName?: string }> {
  try {
    const response = await fetch(`/api/checkup/referral/${encodeURIComponent(code)}`);
    return response.json();
  } catch {
    return { success: false, valid: false };
  }
}

/** Create a competitor invitation URL for the viral checkup loop */
export async function createCompetitorInvite(params: {
  competitorPlaceId: string;
  competitorName: string;
  senderName?: string;
}): Promise<{ success: boolean; inviteUrl?: string }> {
  try {
    const response = await fetch("/api/checkup/invite-competitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return response.json();
  } catch {
    return { success: false };
  }
}
