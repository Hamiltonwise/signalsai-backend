/**
 * Service for interacting with the Microsoft Clarity Export API.
 */
import axios from "axios";

const CLARITY_API_TOKEN = process.env.CLARITY_API_TOKEN!;
const CLARITY_API_BASE_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";

/**
 * Fetch data from Clarity Export API (project-live-insights).
 */
export const fetchClarityLiveInsights = async (
  projectId: string,
  numOfDays: 1 | 2 | 3,
  dimensions?: string[]
): Promise<any> => {
  const headers = {
    Authorization: `Bearer ${CLARITY_API_TOKEN}`,
    "Content-Type": "application/json",
  };

  const params: Record<string, string> = {
    projectId,
    numOfDays: String(numOfDays),
  };

  if (dimensions && dimensions.length > 0) {
    dimensions.slice(0, 3).forEach((dim, idx) => {
      params[`dimension${idx + 1}`] = dim;
    });
  }

  const resp = await axios.get(CLARITY_API_BASE_URL, { headers, params });
  return resp.data;
};
