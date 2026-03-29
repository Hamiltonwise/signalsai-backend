/**
 * Content Performance Agent -- Execution Service
 *
 * Runs weekly Sunday 6pm PT (1 AM UTC Monday).
 * Queries behavioral_events for content attribution: groups by
 * source_channel/utm_source, counts checkup starts and account
 * creations per source. Calculates content ROI (which sources
 * drive the most conversions). Writes "content.performance_brief"
 * event with { topSources, conversionBySource, recommendation }.
 *
 * Data-driven (SQL queries only). No AI calls.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface SourceConversion {
  source: string;
  checkupStarts: number;
  accountCreations: number;
  conversionRate: number;
}

interface ContentPerformanceBrief {
  topSources: SourceConversion[];
  conversionBySource: SourceConversion[];
  recommendation: string;
  periodStart: string;
  periodEnd: string;
  totalCheckupStarts: number;
  totalAccountCreations: number;
}

// -- Core -------------------------------------------------------------------

/**
 * Run the Content Performance analysis for the last 7 days.
 */
export async function runContentPerformance(): Promise<ContentPerformanceBrief> {
  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStart = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Count checkup starts grouped by source
  const checkupBySource = await db("behavioral_events")
    .select(
      db.raw(
        "COALESCE(properties->>'source_channel', properties->>'utm_source', 'direct') as source"
      )
    )
    .count("* as count")
    .where("event_type", "checkup.started")
    .where("created_at", ">=", periodStart)
    .groupByRaw(
      "COALESCE(properties->>'source_channel', properties->>'utm_source', 'direct')"
    )
    .orderBy("count", "desc");

  // Count account creations grouped by source
  const accountsBySource = await db("behavioral_events")
    .select(
      db.raw(
        "COALESCE(properties->>'source_channel', properties->>'utm_source', 'direct') as source"
      )
    )
    .count("* as count")
    .where("event_type", "account.created")
    .where("created_at", ">=", periodStart)
    .groupByRaw(
      "COALESCE(properties->>'source_channel', properties->>'utm_source', 'direct')"
    )
    .orderBy("count", "desc");

  // Build a lookup for account creations
  const accountMap: Record<string, number> = {};
  for (const row of accountsBySource) {
    accountMap[row.source as string] = Number(row.count);
  }

  // Build conversion data
  const conversionBySource: SourceConversion[] = checkupBySource.map(
    (row: any) => {
      const source = row.source as string;
      const checkupStarts = Number(row.count);
      const accountCreations = accountMap[source] || 0;
      const conversionRate =
        checkupStarts > 0
          ? Math.round((accountCreations / checkupStarts) * 10000) / 100
          : 0;
      return { source, checkupStarts, accountCreations, conversionRate };
    }
  );

  // Include sources that have account creations but no checkup starts
  for (const row of accountsBySource) {
    const source = row.source as string;
    if (!conversionBySource.find((c) => c.source === source)) {
      conversionBySource.push({
        source,
        checkupStarts: 0,
        accountCreations: Number(row.count),
        conversionRate: 0,
      });
    }
  }

  // Sort by account creations (most valuable first)
  conversionBySource.sort(
    (a, b) => b.accountCreations - a.accountCreations
  );

  const topSources = conversionBySource.slice(0, 5);

  const totalCheckupStarts = conversionBySource.reduce(
    (sum, s) => sum + s.checkupStarts,
    0
  );
  const totalAccountCreations = conversionBySource.reduce(
    (sum, s) => sum + s.accountCreations,
    0
  );

  // Generate recommendation
  const recommendation = generateRecommendation(
    topSources,
    totalCheckupStarts,
    totalAccountCreations
  );

  const brief: ContentPerformanceBrief = {
    topSources,
    conversionBySource,
    recommendation,
    periodStart,
    periodEnd,
    totalCheckupStarts,
    totalAccountCreations,
  };

  // Write the performance brief event
  await writePerformanceBriefEvent(brief);

  console.log(
    `[ContentPerformance] Brief generated: ${totalCheckupStarts} checkup starts, ${totalAccountCreations} accounts from ${conversionBySource.length} sources`
  );

  return brief;
}

// -- Helpers ----------------------------------------------------------------

function generateRecommendation(
  topSources: SourceConversion[],
  totalCheckupStarts: number,
  totalAccountCreations: number
): string {
  if (topSources.length === 0) {
    return "No content attribution data this week. Ensure UTM parameters are configured on all content links.";
  }

  const bestConverter = topSources.reduce((best, current) =>
    current.conversionRate > best.conversionRate ? current : best
  );

  const highestVolume = topSources[0];

  const parts: string[] = [];

  if (bestConverter.conversionRate > 0) {
    parts.push(
      `Highest conversion rate: ${bestConverter.source} at ${bestConverter.conversionRate}% (${bestConverter.accountCreations} accounts from ${bestConverter.checkupStarts} checkup starts).`
    );
  }

  if (
    highestVolume.source !== bestConverter.source &&
    highestVolume.accountCreations > 0
  ) {
    parts.push(
      `Highest volume: ${highestVolume.source} with ${highestVolume.accountCreations} account creations.`
    );
  }

  if (totalAccountCreations === 0) {
    parts.push(
      "Zero account creations attributed to content this week. Review UTM tracking and content CTAs."
    );
  } else {
    const overallRate =
      totalCheckupStarts > 0
        ? Math.round((totalAccountCreations / totalCheckupStarts) * 10000) /
          100
        : 0;
    parts.push(
      `Overall content conversion rate: ${overallRate}% (${totalAccountCreations} accounts from ${totalCheckupStarts} checkup starts).`
    );
  }

  return parts.join(" ");
}

async function writePerformanceBriefEvent(
  brief: ContentPerformanceBrief
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.performance_brief",
      properties: JSON.stringify({
        top_sources: brief.topSources,
        conversion_by_source: brief.conversionBySource,
        recommendation: brief.recommendation,
        period_start: brief.periodStart,
        period_end: brief.periodEnd,
        total_checkup_starts: brief.totalCheckupStarts,
        total_account_creations: brief.totalAccountCreations,
      }),
    });
  } catch (err: any) {
    console.error(
      "[ContentPerformance] Failed to write performance brief event:",
      err.message
    );
  }
}
