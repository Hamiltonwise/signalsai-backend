/**
 * Human Deployment Scout Agent -- Execution Service
 *
 * Runs weekly Sunday 7 PM PT.
 * Queries dream_team_tasks (open count, age), behavioral_events
 * (agent action volume), and organizations (active count).
 * Determines if human hiring is needed based on 5 trigger signals.
 *
 * Writes "ops.hiring_signal" event with recommendation.
 *
 * Data-driven (SQL queries only). No AI calls.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface TriggerSignal {
  name: string;
  threshold: string;
  currentValue: number | string;
  fired: boolean;
  weeksSustained: number;
  recommendation: string;
}

interface HiringRecommendation {
  trigger: string;
  role: string;
  contractOrFt: "contract" | "full-time" | "fractional";
  monthlyBurnIncrease: string;
  alternative: string;
}

interface HumanDeploymentReport {
  signals: TriggerSignal[];
  anySignalFired: boolean;
  recommendations: HiringRecommendation[];
  summary: string;
  activeOrgs: number;
  openTaskCount: number;
  agentEventVolume7d: number;
  agentErrorRate7d: number;
  reportedAt: string;
}

// -- Thresholds -------------------------------------------------------------

const BUILD_QUEUE_THRESHOLD = 10;
const BUILD_QUEUE_WEEKS_REQUIRED = 3;
const CS_RESPONSE_THRESHOLD_HOURS = 24;
const FOUNDER_BOTTLENECK_THRESHOLD = 5;

// -- Core -------------------------------------------------------------------

/**
 * Run the weekly Human Deployment Scout.
 */
export async function runHumanDeploymentScan(): Promise<HumanDeploymentReport> {
  const signals: TriggerSignal[] = [];
  const recommendations: HiringRecommendation[] = [];

  const activeOrgs = await countActiveOrgs();
  const openTaskCount = await countOpenTasks();
  const agentEventVolume7d = await countAgentEvents(7);
  const agentErrorRate7d = await computeAgentErrorRate(7);

  // Signal 1: Build Queue Overload
  const buildQueueSignal = await checkBuildQueueOverload();
  signals.push(buildQueueSignal);
  if (buildQueueSignal.fired) {
    recommendations.push({
      trigger: "Build Queue Overload",
      role: "Engineering backup (contract)",
      contractOrFt: "contract",
      monthlyBurnIncrease: "$8,000-$12,000",
      alternative:
        "Audit current agent system for automation opportunities that could reduce queue depth.",
    });
  }

  // Signal 2: CS Response Degradation
  const csResponseSignal = await checkCSResponseDegradation();
  signals.push(csResponseSignal);
  if (csResponseSignal.fired) {
    recommendations.push({
      trigger: "CS Response Degradation",
      role: "CS Associate",
      contractOrFt: "full-time",
      monthlyBurnIncrease: "$4,500-$6,000",
      alternative:
        "Check if CS agent automations are functioning correctly before hiring.",
    });
  }

  // Signal 3: Founder Bottleneck
  const founderSignal = await checkFounderBottleneck();
  signals.push(founderSignal);
  if (founderSignal.fired) {
    recommendations.push({
      trigger: "Founder Bottleneck",
      role: "Agent system audit first, then CS hire if structural",
      contractOrFt: "contract",
      monthlyBurnIncrease: "$0 (audit) or $4,500-$6,000 (hire)",
      alternative:
        "Review which routine decisions are reaching Corey and automate them.",
    });
  }

  // Signal 4: Vertical Expansion Relationship Need
  const verticalSignal = await checkVerticalExpansionNeed();
  signals.push(verticalSignal);
  if (verticalSignal.fired) {
    recommendations.push({
      trigger: "Vertical Expansion Relationship Need",
      role: "Partnerships hire (part-time)",
      contractOrFt: "contract",
      monthlyBurnIncrease: "$3,000-$5,000",
      alternative:
        "Delay expansion until organic inbound is strong enough to reduce relationship dependency.",
    });
  }

  // Signal 5: Financial Complexity
  const financialSignal = await checkFinancialComplexity();
  signals.push(financialSignal);
  if (financialSignal.fired) {
    recommendations.push({
      trigger: "Financial Complexity",
      role: "Fractional CFO",
      contractOrFt: "fractional",
      monthlyBurnIncrease: "$3,000-$5,000",
      alternative:
        "Implement automated financial reporting to reduce manual close time.",
    });
  }

  const anySignalFired = signals.some((s) => s.fired);

  const summary = anySignalFired
    ? `${recommendations.length} hire signal(s) detected. Review recommendations.`
    : "No hire signals detected. Current team capacity is sufficient.";

  const report: HumanDeploymentReport = {
    signals,
    anySignalFired,
    recommendations,
    summary,
    activeOrgs,
    openTaskCount,
    agentEventVolume7d,
    agentErrorRate7d,
    reportedAt: new Date().toISOString(),
  };

  await writeHiringSignalEvent(report);

  console.log(
    `[HumanDeploymentScout] Scan complete: ${signals.filter((s) => s.fired).length} signal(s) fired, ` +
      `${openTaskCount} open tasks, ${activeOrgs} active orgs, ` +
      `${agentErrorRate7d.toFixed(1)}% agent error rate.`
  );

  return report;
}

// -- Signal Checks ----------------------------------------------------------

async function checkBuildQueueOverload(): Promise<TriggerSignal> {
  const openCount = await countOpenTasks();

  // Check how many consecutive weeks the queue has been over threshold
  const weeksSustained = await countSustainedWeeks(
    "ops.hiring_signal",
    "build_queue_overload",
    openCount >= BUILD_QUEUE_THRESHOLD
  );

  const fired = openCount >= BUILD_QUEUE_THRESHOLD && weeksSustained >= BUILD_QUEUE_WEEKS_REQUIRED;

  return {
    name: "Build Queue Overload",
    threshold: `${BUILD_QUEUE_THRESHOLD}+ items for ${BUILD_QUEUE_WEEKS_REQUIRED} consecutive weeks`,
    currentValue: openCount,
    fired,
    weeksSustained,
    recommendation: fired
      ? "Engineering backup hire recommended (contract first)."
      : `${openCount} items in queue (threshold: ${BUILD_QUEUE_THRESHOLD}).`,
  };
}

async function checkCSResponseDegradation(): Promise<TriggerSignal> {
  const oneDayAgo = new Date(Date.now() - CS_RESPONSE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const overdueResult = await db("dream_team_tasks")
      .where("owner_name", "Jo")
      .where("status", "!=", "done")
      .where("created_at", "<", oneDayAgo)
      .count("* as cnt")
      .first();
    const overdueCount = Number(overdueResult?.cnt ?? 0);

    return {
      name: "CS Response Degradation",
      threshold: `24hr+ response times on open items`,
      currentValue: overdueCount,
      fired: overdueCount > 0,
      weeksSustained: overdueCount > 0 ? 1 : 0,
      recommendation: overdueCount > 0
        ? `${overdueCount} items assigned to Jo are past 24hr SLA.`
        : "CS response times are within SLA.",
    };
  } catch {
    return {
      name: "CS Response Degradation",
      threshold: `24hr+ response times on open items`,
      currentValue: "N/A",
      fired: false,
      weeksSustained: 0,
      recommendation: "Unable to check CS response times.",
    };
  }
}

async function checkFounderBottleneck(): Promise<TriggerSignal> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Count tasks assigned to Corey that are routine (not strategic)
    const coreyTasksResult = await db("dream_team_tasks")
      .where("owner_name", "Corey")
      .where("created_at", ">=", oneWeekAgo)
      .where("priority", "!=", "urgent")
      .count("* as cnt")
      .first();
    const routineDecisions = Number(coreyTasksResult?.cnt ?? 0);

    return {
      name: "Founder Bottleneck",
      threshold: `${FOUNDER_BOTTLENECK_THRESHOLD}+ routine decisions/week`,
      currentValue: routineDecisions,
      fired: routineDecisions >= FOUNDER_BOTTLENECK_THRESHOLD,
      weeksSustained: routineDecisions >= FOUNDER_BOTTLENECK_THRESHOLD ? 1 : 0,
      recommendation: routineDecisions >= FOUNDER_BOTTLENECK_THRESHOLD
        ? `Corey made ${routineDecisions} routine decisions this week. Agent audit recommended.`
        : `${routineDecisions} routine decisions this week (threshold: ${FOUNDER_BOTTLENECK_THRESHOLD}).`,
    };
  } catch {
    return {
      name: "Founder Bottleneck",
      threshold: `${FOUNDER_BOTTLENECK_THRESHOLD}+ routine decisions/week`,
      currentValue: "N/A",
      fired: false,
      weeksSustained: 0,
      recommendation: "Unable to check founder bottleneck.",
    };
  }
}

async function checkVerticalExpansionNeed(): Promise<TriggerSignal> {
  try {
    // Check if any vertical has 5/5 readiness score
    const readyVerticals = await db("behavioral_events")
      .where("event_type", "growth.vertical_readiness")
      .orderBy("created_at", "desc")
      .first();

    if (readyVerticals) {
      const props =
        typeof readyVerticals.properties === "string"
          ? JSON.parse(readyVerticals.properties)
          : readyVerticals.properties;

      const deploymentReady = props?.deployment_ready || [];
      const needsRelationships = deploymentReady.length > 0;

      return {
        name: "Vertical Expansion Relationship Need",
        threshold: "5/5 thresholds met for a vertical requiring relationship building",
        currentValue: deploymentReady.length,
        fired: needsRelationships,
        weeksSustained: needsRelationships ? 1 : 0,
        recommendation: needsRelationships
          ? `${deploymentReady.join(", ")} ready for deployment. Partnerships hire may be needed.`
          : "No verticals at 5/5 readiness.",
      };
    }

    return {
      name: "Vertical Expansion Relationship Need",
      threshold: "5/5 thresholds met for a vertical requiring relationship building",
      currentValue: 0,
      fired: false,
      weeksSustained: 0,
      recommendation: "No vertical readiness data available.",
    };
  } catch {
    return {
      name: "Vertical Expansion Relationship Need",
      threshold: "5/5 thresholds met",
      currentValue: "N/A",
      fired: false,
      weeksSustained: 0,
      recommendation: "Unable to check vertical expansion need.",
    };
  }
}

async function checkFinancialComplexity(): Promise<TriggerSignal> {
  try {
    // Check behavioral_events for financial complexity signals
    const finEvents = await db("behavioral_events")
      .where("event_type", "ops.financial_close")
      .orderBy("created_at", "desc")
      .first();

    if (finEvents) {
      const props =
        typeof finEvents.properties === "string"
          ? JSON.parse(finEvents.properties)
          : finEvents.properties;
      const hoursSpent = Number(props?.hours_spent ?? 0);

      return {
        name: "Financial Complexity",
        threshold: "Monthly close taking 3+ hours",
        currentValue: hoursSpent,
        fired: hoursSpent >= 3,
        weeksSustained: hoursSpent >= 3 ? 1 : 0,
        recommendation: hoursSpent >= 3
          ? `Monthly close took ${hoursSpent} hours. Fractional CFO recommended.`
          : `Monthly close at ${hoursSpent} hours (threshold: 3).`,
      };
    }

    return {
      name: "Financial Complexity",
      threshold: "Monthly close taking 3+ hours",
      currentValue: "No data",
      fired: false,
      weeksSustained: 0,
      recommendation: "No financial close data tracked yet.",
    };
  } catch {
    return {
      name: "Financial Complexity",
      threshold: "Monthly close taking 3+ hours",
      currentValue: "N/A",
      fired: false,
      weeksSustained: 0,
      recommendation: "Unable to check financial complexity.",
    };
  }
}

// -- Helpers ----------------------------------------------------------------

async function countActiveOrgs(): Promise<number> {
  try {
    const result = await db("organizations")
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0);
  } catch {
    return 0;
  }
}

async function countOpenTasks(): Promise<number> {
  try {
    const result = await db("dream_team_tasks")
      .where("status", "open")
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0);
  } catch {
    return 0;
  }
}

async function countAgentEvents(days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const result = await db("behavioral_events")
      .where("created_at", ">=", since)
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0);
  } catch {
    return 0;
  }
}

async function computeAgentErrorRate(days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const totalResult = await db("behavioral_events")
      .where("created_at", ">=", since)
      .count("* as cnt")
      .first();
    const total = Number(totalResult?.cnt ?? 0);

    const errorResult = await db("behavioral_events")
      .where("created_at", ">=", since)
      .where("event_type", "like", "%error%")
      .count("* as cnt")
      .first();
    const errors = Number(errorResult?.cnt ?? 0);

    if (total === 0) return 0;
    return Math.round((errors / total) * 10000) / 100;
  } catch {
    return 0;
  }
}

async function countSustainedWeeks(
  eventType: string,
  signalName: string,
  currentlyFired: boolean
): Promise<number> {
  if (!currentlyFired) return 0;

  try {
    // Look at the last 4 weekly reports
    const recentReports = await db("behavioral_events")
      .where("event_type", eventType)
      .orderBy("created_at", "desc")
      .limit(4);

    let sustained = 1; // Current week counts
    for (const report of recentReports) {
      const props =
        typeof report.properties === "string"
          ? JSON.parse(report.properties)
          : report.properties;
      const signals = props?.signals || [];
      const signal = signals.find((s: any) => s.name === signalName);
      if (signal?.fired) {
        sustained++;
      } else {
        break;
      }
    }
    return sustained;
  } catch {
    return currentlyFired ? 1 : 0;
  }
}

// -- Event Writing ----------------------------------------------------------

async function writeHiringSignalEvent(
  report: HumanDeploymentReport
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "ops.hiring_signal",
      properties: JSON.stringify({
        signals: report.signals.map((s) => ({
          name: s.name,
          threshold: s.threshold,
          current_value: s.currentValue,
          fired: s.fired,
          weeks_sustained: s.weeksSustained,
          recommendation: s.recommendation,
        })),
        any_signal_fired: report.anySignalFired,
        recommendations: report.recommendations,
        summary: report.summary,
        active_orgs: report.activeOrgs,
        open_task_count: report.openTaskCount,
        agent_event_volume_7d: report.agentEventVolume7d,
        agent_error_rate_7d: report.agentErrorRate7d,
        reported_at: report.reportedAt,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[HumanDeploymentScout] Failed to write hiring signal event:",
      message
    );
  }
}
