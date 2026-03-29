/**
 * State of Business Clarity Report Generator
 *
 * Auto-generates the annual/quarterly benchmark report from Alloro Labs
 * data. Queries benchmark data per vertical, synthesizes findings with
 * Claude, and stores the result in published_content as a "report" category.
 *
 * Runs quarterly: 1st of Jan, Apr, Jul, Oct at 6 AM PT (1 PM UTC).
 */

import { db } from "../../database/connection";
import Anthropic from "@anthropic-ai/sdk";

// -- Types ------------------------------------------------------------------

interface VerticalBenchmark {
  vertical: string;
  sampleSize: number;
  avgScore: number;
  topPerformerThreshold: number;
  commonGaps: string[];
  avgReviewVelocity: number;
  avgResponseRate: number;
}

interface ClarityFinding {
  vertical: string;
  avgScore: number;
  topPerformers: number;
  sampleSize: number;
  commonGaps: string[];
}

export interface ClarityReport {
  title: string;
  quarter: string;
  generatedAt: string;
  executiveSummary: string;
  findingsByVertical: ClarityFinding[];
  crossVerticalPatterns: string[];
  yearOverYearTrends: string[];
  methodology: string;
}

// -- Constants --------------------------------------------------------------

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
const MIN_SAMPLE_SIZE = 5;

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// -- Core -------------------------------------------------------------------

/**
 * Generate the State of Business Clarity report.
 * Pulls benchmark data for every vertical with N >= 5,
 * synthesizes a narrative report via Claude, and stores it.
 */
export async function generateStateReport(): Promise<{
  success: boolean;
  report: ClarityReport;
}> {
  const now = new Date();
  const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;

  try {
    // 1. Gather benchmark data per vertical
    const benchmarks = await gatherBenchmarks();

    if (benchmarks.length === 0) {
      const emptyReport: ClarityReport = {
        title: `State of Business Clarity - ${quarter}`,
        quarter,
        generatedAt: now.toISOString(),
        executiveSummary:
          "Insufficient data to generate this quarter's report. Benchmarks require at least 5 businesses per vertical.",
        findingsByVertical: [],
        crossVerticalPatterns: [],
        yearOverYearTrends: [],
        methodology: getMethodologyText(),
      };
      return { success: true, report: emptyReport };
    }

    // 2. Check for historical reports (year-over-year)
    const previousReports = await db("published_content")
      .where("category", "report")
      .where("subcategory", "state_of_clarity")
      .orderBy("created_at", "desc")
      .limit(4)
      .select("title", "body", "created_at")
      .catch(() => [] as { title: string; body: string; created_at: string }[]);

    // 3. Synthesize via Claude
    const report = await synthesizeReport(
      benchmarks,
      quarter,
      previousReports,
      now
    );

    // 4. Store in published_content
    await storeReport(report);

    console.log(
      `[StateOfClarity] Report generated for ${quarter}: ${benchmarks.length} verticals analyzed.`
    );

    return { success: true, report };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[StateOfClarity] Failed to generate report:", message);

    const fallbackReport: ClarityReport = {
      title: `State of Business Clarity - ${quarter}`,
      quarter,
      generatedAt: now.toISOString(),
      executiveSummary: `Report generation failed: ${message}`,
      findingsByVertical: [],
      crossVerticalPatterns: [],
      yearOverYearTrends: [],
      methodology: getMethodologyText(),
    };

    return { success: false, report: fallbackReport };
  }
}

// -- Data Gathering ---------------------------------------------------------

async function gatherBenchmarks(): Promise<VerticalBenchmark[]> {
  // Query organizations grouped by vertical, compute scores
  const verticals = await db("organizations")
    .select("vertical")
    .count("id as count")
    .whereNotNull("vertical")
    .where("vertical", "!=", "")
    .groupBy("vertical")
    .having(db.raw("count(id) >= ?", [MIN_SAMPLE_SIZE]))
    .catch(() => [] as { vertical: string; count: string | number }[]);

  const benchmarks: VerticalBenchmark[] = [];

  for (const row of verticals) {
    const vertical = String(row.vertical);
    const sampleSize =
      typeof row.count === "string" ? parseInt(row.count, 10) : Number(row.count);

    // Get average clarity score for this vertical
    const scoreData = await db("organizations")
      .where("vertical", vertical)
      .whereNotNull("clarity_score")
      .avg("clarity_score as avg_score")
      .first()
      .catch(() => null);

    const avgScore = scoreData?.avg_score
      ? Math.round(Number(scoreData.avg_score) * 10) / 10
      : 0;

    // Top performer threshold (75th percentile approximation)
    const topThreshold = await db("organizations")
      .where("vertical", vertical)
      .whereNotNull("clarity_score")
      .orderBy("clarity_score", "desc")
      .limit(Math.max(1, Math.floor(sampleSize * 0.25)))
      .select("clarity_score")
      .catch(() => [] as { clarity_score: number }[]);

    const topPerformerThreshold =
      topThreshold.length > 0
        ? Number(topThreshold[topThreshold.length - 1]?.clarity_score || 0)
        : 0;

    // Common gaps from checkup data
    const gaps = await db("checkup_scores")
      .join("organizations", "checkup_scores.org_id", "organizations.id")
      .where("organizations.vertical", vertical)
      .where("checkup_scores.score", "<", 50)
      .select("checkup_scores.category")
      .groupBy("checkup_scores.category")
      .orderByRaw("count(*) desc")
      .limit(3)
      .catch(() => [] as { category: string }[]);

    // Review velocity average
    const velocityData = await db("organizations")
      .where("vertical", vertical)
      .whereNotNull("review_velocity")
      .avg("review_velocity as avg_velocity")
      .first()
      .catch(() => null);

    // Response rate average
    const responseData = await db("organizations")
      .where("vertical", vertical)
      .whereNotNull("response_rate")
      .avg("response_rate as avg_response")
      .first()
      .catch(() => null);

    benchmarks.push({
      vertical,
      sampleSize,
      avgScore,
      topPerformerThreshold: Math.round(topPerformerThreshold * 10) / 10,
      commonGaps: gaps.map((g) => g.category),
      avgReviewVelocity: velocityData?.avg_velocity
        ? Math.round(Number(velocityData.avg_velocity) * 10) / 10
        : 0,
      avgResponseRate: responseData?.avg_response
        ? Math.round(Number(responseData.avg_response) * 10) / 10
        : 0,
    });
  }

  return benchmarks;
}

// -- Synthesis --------------------------------------------------------------

async function synthesizeReport(
  benchmarks: VerticalBenchmark[],
  quarter: string,
  previousReports: { title: string; body: string; created_at: string }[],
  now: Date
): Promise<ClarityReport> {
  const client = getAnthropic();

  const benchmarkSummary = benchmarks
    .map(
      (b) =>
        `${b.vertical}: N=${b.sampleSize}, avg score=${b.avgScore}, top threshold=${b.topPerformerThreshold}, gaps=[${b.commonGaps.join(", ")}], review velocity=${b.avgReviewVelocity}/mo, response rate=${b.avgResponseRate}%`
    )
    .join("\n");

  const historicalContext =
    previousReports.length > 0
      ? `Previous reports:\n${previousReports.map((r) => `${r.title} (${r.created_at})`).join("\n")}`
      : "No previous reports available for year-over-year comparison.";

  const response = await client.messages.create({
    model: LLM_MODEL,
    max_tokens: 4000,
    system: `You are the State of Business Clarity report writer for Alloro. You produce authoritative, data-driven quarterly benchmark reports.

Rules:
- No em-dashes. Use commas or periods instead.
- Executive summary must be exactly 100 words.
- Cross-vertical patterns should be specific and actionable (e.g. "Businesses that respond to reviews within 4 hours see 31% higher velocity").
- Use universal business language, not vertical-specific jargon.
- Every claim must tie to a data point from the benchmarks.
- Tone: confident, editorial, like a Bloomberg market report for small business.

Return valid JSON matching this structure:
{
  "executiveSummary": "string (100 words)",
  "findingsByVertical": [{"vertical": "string", "avgScore": number, "topPerformers": number, "sampleSize": number, "commonGaps": ["string"]}],
  "crossVerticalPatterns": ["string"],
  "yearOverYearTrends": ["string"]
}`,
    messages: [
      {
        role: "user",
        content: `Generate the ${quarter} State of Business Clarity report.

Benchmark data:
${benchmarkSummary}

${historicalContext}

Today's date: ${now.toISOString().split("T")[0]}`,
      },
    ],
  });

  const responseText =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

  return {
    title: `State of Business Clarity - ${quarter}`,
    quarter,
    generatedAt: now.toISOString(),
    executiveSummary:
      parsed.executiveSummary || "Report synthesis incomplete.",
    findingsByVertical: Array.isArray(parsed.findingsByVertical)
      ? parsed.findingsByVertical
      : benchmarks.map((b) => ({
          vertical: b.vertical,
          avgScore: b.avgScore,
          topPerformers: b.topPerformerThreshold,
          sampleSize: b.sampleSize,
          commonGaps: b.commonGaps,
        })),
    crossVerticalPatterns: Array.isArray(parsed.crossVerticalPatterns)
      ? parsed.crossVerticalPatterns
      : [],
    yearOverYearTrends: Array.isArray(parsed.yearOverYearTrends)
      ? parsed.yearOverYearTrends
      : [],
    methodology: getMethodologyText(),
  };
}

// -- Storage ----------------------------------------------------------------

async function storeReport(report: ClarityReport): Promise<void> {
  try {
    await db("published_content").insert({
      title: report.title,
      category: "report",
      subcategory: "state_of_clarity",
      body: JSON.stringify(report),
      status: "published",
      published_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[StateOfClarity] Failed to store report:", message);
  }
}

// -- Helpers ----------------------------------------------------------------

function getMethodologyText(): string {
  return [
    "The Business Clarity Score is a composite metric (0-100) measuring a business's online presence health.",
    "It aggregates five dimensions: review velocity (new reviews per month), review sentiment (average rating and trend),",
    "response engagement (owner response rate and speed), search visibility (ranking position across key terms),",
    "and competitive positioning (relative performance vs. local competitors).",
    "",
    "Scores are calculated from live data collected via Google Business Profile, review platforms, and search ranking APIs.",
    "Only businesses with at least 30 days of tracked data are included in benchmarks.",
    "Top performer thresholds represent the 75th percentile within each vertical.",
    "All averages are arithmetic means rounded to one decimal place.",
  ].join(" ");
}
