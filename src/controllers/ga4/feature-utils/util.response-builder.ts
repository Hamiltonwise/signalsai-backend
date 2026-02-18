/**
 * GA4 Response Builder Utilities
 *
 * Constructs standardized response structures for GA4 endpoints.
 * Preserves exact response shapes from the original route file.
 */

export interface KeyDataMetric {
  prevMonth: number;
  currMonth: number;
}

export interface KeyDataResponse {
  activeUsers: KeyDataMetric;
  engagementRate: KeyDataMetric;
  conversions: KeyDataMetric;
  trendScore: number;
}

export interface DiagnosticProperty {
  propertyId: string;
  displayName: string;
  timeZone: string;
  currencyCode: string;
  accountId: string;
  accountDisplayName: string;
}

export interface PropertyWithDomain {
  propertyId: string;
  domain: string;
}

/**
 * Builds the response for the POST /getKeyData endpoint.
 */
export const buildKeyDataResponse = (
  currentData: { activeUsers: number; engagementRate: number; conversions: number },
  previousData: { activeUsers: number; engagementRate: number; conversions: number },
  trendScore: number
): KeyDataResponse => {
  return {
    activeUsers: {
      prevMonth: previousData.activeUsers,
      currMonth: currentData.activeUsers,
    },
    engagementRate: {
      prevMonth: previousData.engagementRate,
      currMonth: currentData.engagementRate,
    },
    conversions: {
      prevMonth: previousData.conversions,
      currMonth: currentData.conversions,
    },
    trendScore,
  };
};

/**
 * Builds the response for the GET /diag/properties endpoint.
 */
export const buildPropertiesResponse = (
  properties: DiagnosticProperty[]
): { properties: DiagnosticProperty[] } => {
  return { properties };
};
