/**
 * Data access service for Clarity data.
 * Wraps ClarityDataModel operations and orchestrates data retrieval.
 */
import {
  ClarityDataModel,
  IClarityData,
} from "../../../models/ClarityDataModel";
import { getMonthRanges } from "../feature-utils/util.clarity-date-ranges";
import {
  processKeyData,
  KeyDataResult,
} from "./service.clarity-metrics";

/**
 * Store raw Clarity response via the model layer.
 */
export const storeData = async (
  domain: string,
  reportDate: string,
  data: unknown
): Promise<void> => {
  await ClarityDataModel.upsert(domain, reportDate, data);
};

/**
 * Orchestrate the getKeyData endpoint logic.
 * Fetches rows spanning both month ranges, delegates metric processing.
 */
export const getKeyDataForClient = async (
  clientId: string
): Promise<KeyDataResult> => {
  const ranges = getMonthRanges();

  const rows = await ClarityDataModel.findByDomainAndDateRange(
    clientId,
    ranges.prevMonth.start,
    ranges.currMonth.end
  );

  return processKeyData(rows, ranges);
};

/**
 * Orchestrate the getAIReadyData endpoint logic.
 * Fetches current month rows and returns daily data.
 */
export const getAIReadyDataForClient = async (
  clientId: string
): Promise<{
  domain: string;
  month: string;
  days: { report_date: string; data: any }[];
}> => {
  const ranges = getMonthRanges();

  const rows = await ClarityDataModel.findByDomainAndDateRange(
    clientId,
    ranges.currMonth.start,
    ranges.currMonth.end
  );

  const dailyData = rows.map((r: IClarityData) => ({
    report_date: r.report_date,
    data: typeof r.data === "string" ? JSON.parse(r.data) : r.data,
  }));

  return {
    domain: clientId,
    month: `${ranges.currMonth.start} to ${ranges.currMonth.end}`,
    days: dailyData,
  };
};
