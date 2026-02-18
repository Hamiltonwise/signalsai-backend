import { businessprofileperformance_v1 } from "@googleapis/businessprofileperformance";

/** Performance time-series fetcher (CALL_CLICKS etc.) */
export async function fetchPerfTimeSeries(
  perf: businessprofileperformance_v1.Businessprofileperformance,
  locationId: string,
  metrics: string[],
  startDate: string,
  endDate: string,
) {
  const location = `locations/${locationId}`;
  const y1 = +startDate.slice(0, 4);
  const m1 = +startDate.slice(5, 7);
  const d1 = +startDate.slice(8, 10);
  const y2 = +endDate.slice(0, 4);
  const m2 = +endDate.slice(5, 7);
  const d2 = +endDate.slice(8, 10);

  const resp = await perf.locations.fetchMultiDailyMetricsTimeSeries({
    location,
    dailyMetrics: metrics,
    // IMPORTANT: dot-notation query params (no nested objects)
    "dailyRange.startDate.year": y1,
    "dailyRange.startDate.month": m1,
    "dailyRange.startDate.day": d1,
    "dailyRange.endDate.year": y2,
    "dailyRange.endDate.month": m2,
    "dailyRange.endDate.day": d2,
  } as any);

  return resp.data.multiDailyMetricTimeSeries || [];
}

/** Fallback: total CALL_CLICKS from Performance */
export async function getCallClicksTotal(
  perf: businessprofileperformance_v1.Businessprofileperformance,
  locationId: string,
  startDate: string,
  endDate: string,
) {
  const seriesResp = await fetchPerfTimeSeries(
    perf,
    locationId,
    ["CALL_CLICKS"],
    startDate,
    endDate,
  );

  // seriesResp is Schema$MultiDailyMetricTimeSeries[] from the API
  const first = seriesResp?.[0];
  const dmtList = first?.dailyMetricTimeSeries ?? [];

  const callClicksEntry = dmtList.find(
    (e: any) => e.dailyMetric === "CALL_CLICKS",
  );

  const dated = callClicksEntry?.timeSeries?.datedValues ?? [];
  const total = dated.reduce((sum: number, dv: any) => {
    // value is a string; may be undefined if 0
    const v = dv?.value !== undefined ? Number(dv.value) : 0;
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  return { callClicksTotal: total };
}
