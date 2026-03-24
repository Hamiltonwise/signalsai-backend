/**
 * Checkup API — Free Referral Base Checkup analysis
 */

export interface CheckupScore {
  composite: number;
  reputation: number;
  visibility: number;
  competitive: number;
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

export interface CheckupAnalysis {
  success: boolean;
  score: CheckupScore;
  topCompetitor: CheckupCompetitor | null;
  competitors: CheckupCompetitor[];
  findings: CheckupFinding[];
  totalImpact: number;
  market: CheckupMarket;
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
}): Promise<CheckupAnalysis> {
  const response = await fetch("/api/checkup/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Checkup analysis failed: ${response.statusText}`);
  }

  return response.json();
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
