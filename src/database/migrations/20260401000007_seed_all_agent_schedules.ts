import type { Knex } from "knex";
import { CronExpressionParser } from "cron-parser";

/**
 * Seed schedules for ALL dream team agents.
 *
 * Idempotent: skips any agent_key that already has a row.
 * Staggered cron times prevent all agents from firing simultaneously.
 */

interface ScheduleSeed {
  agent_key: string;
  display_name: string;
  description: string;
  schedule_type: "cron";
  cron_expression: string;
  timezone: string;
}

const SCHEDULES: ScheduleSeed[] = [
  // ─── Daily agents (staggered through the day) ───────────────
  {
    agent_key: "client_monitor",
    display_name: "Client Monitor",
    description: "Daily client health scoring. Classifies each org as GREEN/AMBER/RED based on behavioral_events from the last 7 days.",
    schedule_type: "cron",
    cron_expression: "0 6 * * *",       // 6:00 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "cs_agent",
    display_name: "CS Agent",
    description: "Daily proactive CS interventions. Detects behavioral triggers and generates response suggestions.",
    schedule_type: "cron",
    cron_expression: "30 6 * * *",      // 6:30 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "cs_coach",
    display_name: "CS Coach",
    description: "Daily CS coaching suggestions. Analyzes support interactions and recommends improvements.",
    schedule_type: "cron",
    cron_expression: "0 7 * * *",       // 7:00 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "cs_expander",
    display_name: "CS Expander",
    description: "Daily expansion opportunity detection. Identifies upsell and cross-sell signals from client behavior.",
    schedule_type: "cron",
    cron_expression: "30 7 * * *",      // 7:30 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "aeo_monitor",
    display_name: "AEO Monitor",
    description: "Daily AI search citation monitoring. Tracks how AI engines reference client businesses.",
    schedule_type: "cron",
    cron_expression: "0 8 * * *",       // 8:00 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "content_performance",
    display_name: "Content Performance",
    description: "Daily content ROI tracking. Measures performance of published content across platforms.",
    schedule_type: "cron",
    cron_expression: "30 8 * * *",      // 8:30 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "competitive_scout",
    display_name: "Competitive Scout",
    description: "Daily competitor activity scan. Detects competitor moves across all client markets.",
    schedule_type: "cron",
    cron_expression: "0 9 * * *",       // 9:00 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "bug_triage",
    display_name: "Bug Triage",
    description: "Daily auto-triage of open bugs. Classifies severity, assigns to queues, escalates P0s.",
    schedule_type: "cron",
    cron_expression: "0 10 * * *",      // 10:00 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "morning_briefing",
    display_name: "Morning Briefing",
    description: "Daily synthesis of overnight events, agent outputs, and priority actions. 6am PT.",
    schedule_type: "cron",
    cron_expression: "0 13 * * *",      // 13:00 UTC = 6am PT daily
    timezone: "UTC",
  },
  {
    agent_key: "week1_win",
    display_name: "Week 1 Win",
    description: "Daily check for new accounts in their first week. Generates the single most valuable quick win.",
    schedule_type: "cron",
    cron_expression: "0 16 * * *",      // 16:00 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "nothing_gets_lost",
    display_name: "Nothing Gets Lost",
    description: "Daily orphan document scan. Finds unreferenced knowledge docs, stale Canon pages, and broken links.",
    schedule_type: "cron",
    cron_expression: "0 22 * * *",      // 22:00 UTC daily
    timezone: "UTC",
  },
  {
    agent_key: "learning_agent",
    display_name: "Learning Agent",
    description: "Daily heuristic calibration. End-of-day analysis of which agent outputs drove real improvement.",
    schedule_type: "cron",
    cron_expression: "0 23 * * *",      // 23:00 UTC daily
    timezone: "UTC",
  },

  // ─── Weekly agents (staggered across the week) ──────────────
  {
    agent_key: "foundation_operations",
    display_name: "Foundation Operations",
    description: "Weekly Heroes & Founders Foundation ops check. RISE Program status, grant pipeline, sponsor outreach.",
    schedule_type: "cron",
    cron_expression: "0 3 * * 1",       // Mondays 3:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "cfo_agent",
    display_name: "CFO Agent",
    description: "Weekly financial review. Revenue projections, cost analysis, and financial health scoring.",
    schedule_type: "cron",
    cron_expression: "0 4 * * 1",       // Mondays 4:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "cmo_agent",
    display_name: "CMO Agent",
    description: "Weekly content strategy. Generates content briefs, topic recommendations, and messaging guidance.",
    schedule_type: "cron",
    cron_expression: "0 5 * * 1",       // Mondays 5:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "conversion_optimizer",
    display_name: "Conversion Optimizer",
    description: "Weekly funnel analysis. Identifies drop-off points, A/B test proposals, and conversion improvements.",
    schedule_type: "cron",
    cron_expression: "0 5 * * 2",       // Tuesdays 5:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "vertical_readiness",
    display_name: "Vertical Readiness",
    description: "Weekly vertical expansion readiness assessment. Scores new verticals on TAM, fit, and effort.",
    schedule_type: "cron",
    cron_expression: "0 3 * * 3",       // Wednesdays 3:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "strategic_intelligence",
    display_name: "Strategic Intelligence",
    description: "Weekly strategic signals. Identifies macro trends, partnership opportunities, and market shifts.",
    schedule_type: "cron",
    cron_expression: "0 5 * * 3",       // Wednesdays 5:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "human_deployment_scout",
    display_name: "Human Deployment Scout",
    description: "Weekly hiring and scaling signal detection. Identifies when to hire, what roles, and cost impact.",
    schedule_type: "cron",
    cron_expression: "0 3 * * 4",       // Thursdays 3:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "technology_horizon",
    display_name: "Technology Horizon",
    description: "Weekly tech landscape scan. Evaluates new models, tools, and capabilities relevant to the platform.",
    schedule_type: "cron",
    cron_expression: "0 5 * * 4",       // Thursdays 5:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "podcast_scout",
    display_name: "Podcast Scout",
    description: "Weekly podcast opportunity detection. Identifies relevant shows, pitch angles, and booking windows.",
    schedule_type: "cron",
    cron_expression: "0 3 * * 5",       // Fridays 3:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "trend_scout",
    display_name: "Trend Scout",
    description: "Weekly trend detection. Identifies emerging patterns in client industries and adjacent markets.",
    schedule_type: "cron",
    cron_expression: "0 5 * * 5",       // Fridays 5:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "weekly_digest",
    display_name: "Weekly Digest",
    description: "Friday summary of the week's behavioral_events, agent outputs, client health, and competitive moves.",
    schedule_type: "cron",
    cron_expression: "0 14 * * 5",      // Fridays 14:00 UTC = 7am PT
    timezone: "UTC",
  },
  {
    agent_key: "market_signal_scout",
    display_name: "Market Signal Scout",
    description: "Weekly market signal aggregation. Collects and scores signals from news, social, and industry sources.",
    schedule_type: "cron",
    cron_expression: "0 5 * * 6",       // Saturdays 5:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "real_estate_agent",
    display_name: "Real Estate Agent",
    description: "Weekly real estate market signal scan. Tracks commercial real estate trends relevant to client expansion.",
    schedule_type: "cron",
    cron_expression: "0 3 * * 6",       // Saturdays 3:00 UTC
    timezone: "UTC",
  },
  {
    agent_key: "intelligence_agent",
    display_name: "Intelligence Agent",
    description: "Weekly market intelligence. Deep analysis of market data, ranking trends, and competitive positioning.",
    schedule_type: "cron",
    cron_expression: "0 20 * * 0",      // Sundays 20:00 UTC
    timezone: "UTC",
  },
];

function computeNextRun(cronExpression: string): Date {
  const interval = CronExpressionParser.parse(cronExpression, {
    currentDate: new Date(),
    tz: "UTC",
  });
  return interval.next().toDate();
}

export async function up(knex: Knex): Promise<void> {
  const now = new Date();

  for (const seed of SCHEDULES) {
    const exists = await knex("schedules")
      .where({ agent_key: seed.agent_key })
      .first();

    if (exists) {
      console.log(`[seed-schedules] Skipping ${seed.agent_key} (already exists)`);
      continue;
    }

    const nextRun = computeNextRun(seed.cron_expression);

    await knex("schedules").insert({
      agent_key: seed.agent_key,
      display_name: seed.display_name,
      description: seed.description,
      schedule_type: seed.schedule_type,
      cron_expression: seed.cron_expression,
      timezone: seed.timezone,
      enabled: true,
      next_run_at: nextRun,
      created_at: now,
      updated_at: now,
    });

    console.log(`[seed-schedules] Registered ${seed.agent_key} -> ${seed.cron_expression}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const keys = SCHEDULES.map((s) => s.agent_key);
  await knex("schedules").whereIn("agent_key", keys).del();
}
