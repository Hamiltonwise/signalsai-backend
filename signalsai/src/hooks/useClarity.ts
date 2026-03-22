import { useContext } from "react";
import { ClarityContext } from "../contexts/ClarityContext";

export interface ClarityData {
  sessions: {
    prevMonth: number;
    currMonth: number;
  };
  bounceRate: {
    prevMonth: number;
    currMonth: number;
  };
  deadClicks: {
    prevMonth: number;
    currMonth: number;
  };
  trendScore: number;
}

export interface ClarityAIReadyData {
  overview: {
    totalSessions: number;
    totalDeadClicks: number;
    avgBounceRate: number;
    dateRange: { startDate: string; endDate: string };
  };
  topPagesWithDeadClicks: Array<{
    url: string;
    deadClicks: number;
    sessions: number;
    bounceRate: number;
  }>;
  userJourneyInsights: Array<{
    stage: string;
    dropoffRate: number;
    commonIssues: Array<string>;
  }>;
  heatmapData: {
    clickDensity: Array<{
      element: string;
      clicks: number;
      isDeadClick: boolean;
    }>;
    scrollDepth: {
      average: number;
      percentiles: { p25: number; p50: number; p75: number };
    };
  };
  conversionFunnelAnalysis: Array<{
    step: string;
    completionRate: number;
    dropoffReasons: Array<string>;
  }>;
  opportunities: Array<{
    type: string;
    [key: string]: unknown;
  }>;
}

export interface ClarityContextType {
  // Clarity Data State
  clarityData: ClarityData;
  isLoading: boolean;
  error: string | null;

  // AI Data State
  aiDataLoading: boolean;
  aiData: ClarityAIReadyData | null;
  aiError: string | null;

  // Functions
  fetchClarityData: () => Promise<void>;
  fetchAIReadyClarityData: () => Promise<void>;
}

export const useClarity = () => {
  const context = useContext(ClarityContext);
  if (context === undefined) {
    throw new Error("useClarity must be used within a ClarityProvider");
  }
  return context;
};
