export type RawPmsSource = {
  name?: string;
  referrals?: number | string;
  production?: number | string;
  inferred_referral_type?: "self" | "doctor";
};

export type RawPmsMonthEntry = {
  month?: string;
  sources?: RawPmsSource[];
  self_referrals?: number | string;
  total_referrals?: number | string;
  doctor_referrals?: number | string;
  production_total?: number | string;
};

export const parseResponseLog = (value: unknown): any => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      // Fallback to raw string when JSON parsing fails
      return value;
    }
  }

  return value;
};

export const extractMonthEntriesFromResponse = (
  responseLog: unknown
): RawPmsMonthEntry[] => {
  if (responseLog === null || responseLog === undefined) {
    return [];
  }

  let candidate: unknown = responseLog;

  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      return [];
    }
  }

  if (Array.isArray(candidate)) {
    return candidate as RawPmsMonthEntry[];
  }

  if (typeof candidate === "object" && candidate !== null) {
    const container = candidate as Record<string, unknown>;

    // Check for monthly_rollup as the canonical field (primary)
    if (Array.isArray(container.monthly_rollup)) {
      return container.monthly_rollup as RawPmsMonthEntry[];
    }

    // Fallback to report_data for backward compatibility
    if (Array.isArray(container.report_data)) {
      return container.report_data as RawPmsMonthEntry[];
    }
  }

  return [];
};

export const normalizeApproval = (value: any): boolean | null => {
  if (value === 1 || value === true || value === "1") {
    return true;
  }
  if (value === 0 || value === false || value === "0") {
    return false;
  }
  return null;
};
