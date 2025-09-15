import express from "express";
import axios from "axios";
import db from "../database/connection";
import { domainMappings } from "../utils/domainMappings";

const clarityRoutes = express.Router();

// ======= CONFIG =======
const CLARITY_API_TOKEN = process.env.CLARITY_API_TOKEN!;
// Set to true for: previous = past 2 months, current = past 1 month (complete months only)
// Set to false for: previous = past 1 month, current = current month (complete month)
const USE_COMPLETE_MONTHS_ONLY = true;

// ======= HELPERS =======

/**
 * Fetch data from Clarity Export API (project-live-insights)
 */
const fetchClarityLiveInsights = async (
  projectId: string,
  numOfDays: 1 | 2 | 3,
  dimensions?: string[]
) => {
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

  const url = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

  const resp = await axios.get(url, { headers, params });
  return resp.data;
};

/**
 * Store the raw clarity response into clarity_data_store as JSON
 */
const storeClarityData = async (
  domain: string,
  reportDate: string,
  data: any
) => {
  await db("clarity_data_store")
    .insert({
      domain,
      report_date: reportDate,
      data: JSON.stringify(data),
    })
    .onConflict(["domain", "report_date"])
    .merge({
      data: JSON.stringify(data),
      created_at: db.fn.now(),
    });
};

/**
 * Extract KPI metrics from clarity JSON
 */
const extractMetrics = (data: any[]) => {
  const findMetric = (name: string) =>
    data.find((m) => m.metricName === name)?.information?.[0] || {};

  const traffic = findMetric("Traffic");
  const deadClicks = findMetric("DeadClickCount");
  const quickbacks = findMetric("QuickbackClick");

  return {
    sessions: Number(traffic.totalSessionCount || 0),
    deadClicks: Number(deadClicks.subTotal || 0),
    bounceRate: Number(quickbacks.sessionsWithMetricPercentage || 0) / 100, // %
  };
};

/**
 * Calculate trend score
 */
const calculateTrendScore = (curr: any, prev: any) => {
  const sessionsChange =
    prev.sessions === 0
      ? 0
      : ((curr.sessions - prev.sessions) / prev.sessions) * 100;

  const bounceChange =
    prev.bounceRate === 0
      ? 0
      : ((curr.bounceRate - prev.bounceRate) / prev.bounceRate) * 100;

  const deadClickChange =
    prev.deadClicks === 0
      ? 0
      : ((curr.deadClicks - prev.deadClicks) / prev.deadClicks) * 100;

  // weights: sessions +40%, bounce (inverse) +35%, dead clicks (inverse) +25%
  const trendScore =
    sessionsChange * 0.4 + -bounceChange * 0.35 + -deadClickChange * 0.25;

  return Math.round(trendScore * 100) / 100;
};

/**
 * Get date ranges for month comparison based on configuration
 * - If USE_COMPLETE_MONTHS_ONLY = true: previous = past 2 months, current = past 1 month (complete months only)
 * - If USE_COMPLETE_MONTHS_ONLY = false: previous = past 1 month, current = current month (including partial)
 */
const getMonthRanges = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  let startCurr: Date, endCurr: Date, startPrev: Date, endPrev: Date;

  if (USE_COMPLETE_MONTHS_ONLY) {
    // Mode 1: Compare two complete past months
    startCurr = new Date(Date.UTC(year, month - 1, 1)); // first day prev month
    endCurr = new Date(Date.UTC(year, month, 0)); // last day prev month
    startPrev = new Date(Date.UTC(year, month - 2, 1)); // first day 2 months ago
    endPrev = new Date(Date.UTC(year, month - 1, 0)); // last day 2 months ago
  } else {
    // Mode 2: Compare previous complete month vs current complete month
    startCurr = new Date(Date.UTC(year, month, 1)); // first day current month
    endCurr = new Date(Date.UTC(year, month + 1, 0)); // last day current month
    startPrev = new Date(Date.UTC(year, month - 1, 1)); // first day prev month
    endPrev = new Date(Date.UTC(year, month, 0)); // last day prev month
  }

  return {
    currMonth: {
      start: startCurr.toISOString().slice(0, 10),
      end: endCurr.toISOString().slice(0, 10),
    },
    prevMonth: {
      start: startPrev.toISOString().slice(0, 10),
      end: endPrev.toISOString().slice(0, 10),
    },
  };
};

// ======= ROUTES =======

clarityRoutes.get("/diag/projects", (_req, res) => {
  return res.json(domainMappings);
});

/**
 * POST /clarity/fetch
 */
clarityRoutes.post("/fetch", async (req, res) => {
  try {
    const { clientId, numOfDays = 1, dimensions } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ error: "Missing clientId" });
    }
    if (![1, 2, 3].includes(numOfDays)) {
      return res
        .status(400)
        .json({ error: "numOfDays must be 1, 2, or 3 (Clarity API limit)" });
    }

    const mapping = domainMappings.find(
      (m) => m.domain === clientId || m.gsc_domainkey === clientId
    );
    if (!mapping?.clarity_projectId) {
      return res.status(404).json({ error: "No mapping found for clientId" });
    }

    console.log(
      `📡 Fetching Clarity data for ${mapping.domain} (projectId=${mapping.clarity_projectId})`
    );

    const rawData = await fetchClarityLiveInsights(
      mapping.clarity_projectId,
      numOfDays as 1 | 2 | 3,
      dimensions
    );

    const today = new Date().toISOString().split("T")[0];
    await storeClarityData(mapping.domain, today, rawData);

    return res.json({
      success: true,
      domain: mapping.domain,
      report_date: today,
      data: rawData,
      message: "Clarity data fetched and stored successfully",
    });
  } catch (err: any) {
    console.error("❌ Error in /clarity/fetch:", err?.message || err);
    return res
      .status(500)
      .json({ error: `Failed to fetch Clarity data: ${err.message}` });
  }
});

/**
 * POST /clarity/getKeyData
 * Body: { clientId: string }
 */
clarityRoutes.post("/getKeyData", async (req, res) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ error: "Missing clientId" });
    }

    const ranges = getMonthRanges();

    const rows = await db("clarity_data_store")
      .where("domain", clientId)
      .andWhereBetween("report_date", [
        ranges.prevMonth.start,
        ranges.currMonth.end,
      ]);

    // Split into prevMonth and currMonth buckets
    const prevMonthRows = rows.filter((r) => {
      const reportDate =
        typeof r.report_date === "string"
          ? r.report_date
          : r.report_date.toISOString().slice(0, 10);

      return (
        reportDate >= ranges.prevMonth.start &&
        reportDate <= ranges.prevMonth.end
      );
    });
    const currMonthRows = rows.filter((r) => {
      const reportDate =
        typeof r.report_date === "string"
          ? r.report_date
          : r.report_date.toISOString().slice(0, 10);

      return (
        reportDate >= ranges.currMonth.start &&
        reportDate <= ranges.currMonth.end
      );
    });

    const agg = (rows: any[]) => {
      let totalSessions = 0;
      let totalDeadClicks = 0;
      let bounceRates: number[] = [];
      for (const r of rows) {
        const parsed = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        const m = extractMetrics(parsed);
        totalSessions += m.sessions;
        totalDeadClicks += m.deadClicks;
        bounceRates.push(m.bounceRate);
      }
      return {
        sessions: totalSessions,
        deadClicks: totalDeadClicks,
        bounceRate:
          bounceRates.length > 0
            ? bounceRates.reduce((a, b) => a + b, 0) / bounceRates.length
            : 0,
      };
    };

    const prevMonthData = agg(prevMonthRows);
    const currMonthData = agg(currMonthRows);

    const trendScore = calculateTrendScore(currMonthData, prevMonthData);

    return res.json({
      sessions: {
        prevMonth: prevMonthData.sessions,
        currMonth: currMonthData.sessions,
      },
      bounceRate: {
        prevMonth: prevMonthData.bounceRate,
        currMonth: currMonthData.bounceRate,
      },
      deadClicks: {
        prevMonth: prevMonthData.deadClicks,
        currMonth: currMonthData.deadClicks,
      },
      trendScore,
    });
  } catch (err: any) {
    console.error("❌ Error in /clarity/getKeyData:", err?.message || err);
    return res
      .status(500)
      .json({ error: `Failed to get Clarity key data: ${err.message}` });
  }
});

/**
 * POST /clarity/getAIReadyData
 * Body: { clientId: string }
 */
clarityRoutes.post("/getAIReadyData", async (req, res) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ error: "Missing clientId" });
    }

    const ranges = getMonthRanges();

    const rows = await db("clarity_data_store")
      .where("domain", clientId)
      .andWhereBetween("report_date", [
        ranges.currMonth.start,
        ranges.currMonth.end,
      ]);

    const dailyData = rows.map((r) => ({
      report_date: r.report_date,
      data: typeof r.data === "string" ? JSON.parse(r.data) : r.data,
    }));

    return res.json({
      success: true,
      domain: clientId,
      month: `${ranges.currMonth.start} to ${ranges.currMonth.end}`,
      days: dailyData,
    });
  } catch (err: any) {
    console.error("❌ Error in /clarity/getAIReadyData:", err?.message || err);
    return res
      .status(500)
      .json({ error: `Failed to get Clarity AI Ready data: ${err.message}` });
  }
});

export default clarityRoutes;
