import { useContext } from "react";
import { GBPContext } from "../contexts/GBPContext";

export interface GBPData {
  newReviews: {
    prevMonth: number;
    currMonth: number;
  };
  avgRating: {
    prevMonth: number;
    currMonth: number;
  };
  callClicks: {
    prevMonth: number;
    currMonth: number;
  };
  trendScore: number;
}

export interface GBPAccount {
  name: string;
  [key: string]: unknown;
}

export interface GBPLocation {
  name: string;
  title: string;
  storeCode: string;
  metadata: object;
}

export interface GBPAIReadyData {
  meta: {
    accountId: string;
    locationId: string;
    dateRange: {
      startDate: string;
      endDate: string;
    };
  };
  reviews: {
    allTime: {
      averageRating: number;
      totalReviewCount: number;
    };
    window: {
      averageRating: number;
      newReviews: number;
    };
  };
  performance: {
    series: unknown[]; // Time series data for various metrics
  };
}

export interface GBPContextType {
  // GBP Key Data State
  gbpData: GBPData;
  isLoading: boolean;
  error: string | null;

  // AI Data State
  aiDataLoading: boolean;
  aiData: GBPAIReadyData | null;
  aiError: string | null;

  // Accounts State
  accounts: GBPAccount[];
  accountsLoading: boolean;
  accountsError: string | null;

  // Locations State
  locations: GBPLocation[];
  locationsLoading: boolean;
  locationsError: string | null;

  // Functions
  fetchGBPData: (accountId: string, locationId: string) => Promise<void>;
  fetchAIReadyData: (
    accountId: string,
    locationId: string,
    startDate?: string,
    endDate?: string
  ) => Promise<void>;
  fetchAccounts: () => Promise<void>;
  fetchLocations: (accountName?: string) => Promise<void>;
}

export const useGBP = () => {
  const context = useContext(GBPContext);
  if (context === undefined) {
    throw new Error("useGBP must be used within a GBPProvider");
  }
  return context;
};
