/**
 * Foundation Operations Agent -- Execution Service
 *
 * Runs weekly (Monday 9 AM PT) and monthly (1st of month).
 * Queries organizations table for Foundation-tier accounts.
 * Tracks RISE Scholar pipeline, Foundation event calendar,
 * and veteran business owner applications.
 *
 * Writes "foundation.ops_report" event with status summary.
 *
 * Data-driven (SQL queries only). No AI calls.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface RISEPipelineStatus {
  totalApplications: number;
  pendingVerification: number;
  activeScholars: number;
  newThisWeek: number;
  milestonesDue: number;
}

interface FoundationCalendarItem {
  type: string;
  description: string;
  dueDate: string;
  daysUntilDue: number;
  urgency: "normal" | "approaching" | "urgent";
}

interface FoundationOpsReport {
  reportType: "weekly" | "monthly";
  foundationOrgs: number;
  risePipeline: RISEPipelineStatus;
  upcomingDeadlines: FoundationCalendarItem[];
  openTasks: number;
  staleTasks: number;
  reportedAt: string;
}

// -- Core -------------------------------------------------------------------

/**
 * Run the weekly Foundation operations report.
 */
export async function runWeeklyReport(): Promise<FoundationOpsReport> {
  const foundationOrgs = await countFoundationOrgs();
  const risePipeline = await getRISEPipelineStatus();
  const upcomingDeadlines = await getUpcomingDeadlines();
  const { openTasks, staleTasks } = await getFoundationTaskStatus();

  const report: FoundationOpsReport = {
    reportType: "weekly",
    foundationOrgs,
    risePipeline,
    upcomingDeadlines,
    openTasks,
    staleTasks,
    reportedAt: new Date().toISOString(),
  };

  await writeOpsReportEvent(report);

  console.log(
    `[FoundationOps] Weekly report: ${foundationOrgs} Foundation orgs, ` +
      `${risePipeline.activeScholars} active scholars, ` +
      `${upcomingDeadlines.length} upcoming deadlines, ` +
      `${openTasks} open tasks.`
  );

  return report;
}

/**
 * Run the monthly Foundation operations report (includes additional metrics).
 */
export async function runMonthlyReport(): Promise<FoundationOpsReport> {
  const foundationOrgs = await countFoundationOrgs();
  const risePipeline = await getRISEPipelineStatus();
  const upcomingDeadlines = await getUpcomingDeadlines(60); // 60-day lookahead for monthly
  const { openTasks, staleTasks } = await getFoundationTaskStatus();

  const report: FoundationOpsReport = {
    reportType: "monthly",
    foundationOrgs,
    risePipeline,
    upcomingDeadlines,
    openTasks,
    staleTasks,
    reportedAt: new Date().toISOString(),
  };

  await writeOpsReportEvent(report);

  console.log(
    `[FoundationOps] Monthly report: ${foundationOrgs} Foundation orgs, ` +
      `${risePipeline.activeScholars} active scholars, ` +
      `${upcomingDeadlines.length} upcoming deadlines.`
  );

  return report;
}

// -- Query Functions --------------------------------------------------------

async function countFoundationOrgs(): Promise<number> {
  try {
    const result = await db("organizations")
      .where("tier", "foundation")
      .count("* as cnt")
      .first();
    return Number(result?.cnt ?? 0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[FoundationOps] Failed to count Foundation orgs:", message);
    return 0;
  }
}

async function getRISEPipelineStatus(): Promise<RISEPipelineStatus> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Total applications (Foundation-tier orgs)
    const totalResult = await db("organizations")
      .where("tier", "foundation")
      .count("* as cnt")
      .first();
    const totalApplications = Number(totalResult?.cnt ?? 0);

    // Track RISE-related behavioral events
    const pendingResult = await db("behavioral_events")
      .where("event_type", "rise.verification_pending")
      .count("* as cnt")
      .first();
    const pendingVerification = Number(pendingResult?.cnt ?? 0);

    // Active scholars: Foundation orgs with at least one behavioral event
    const activeResult = await db("organizations as o")
      .where("o.tier", "foundation")
      .whereExists(function () {
        this.select(db.raw("1"))
          .from("behavioral_events as be")
          .whereRaw("be.org_id = o.id")
          .where("be.created_at", ">=", oneWeekAgo);
      })
      .count("* as cnt")
      .first();
    const activeScholars = Number(activeResult?.cnt ?? 0);

    // New this week
    const newResult = await db("organizations")
      .where("tier", "foundation")
      .where("created_at", ">=", oneWeekAgo)
      .count("* as cnt")
      .first();
    const newThisWeek = Number(newResult?.cnt ?? 0);

    // Milestones due: Foundation-related tasks with upcoming due dates
    const milestonesResult = await db("dream_team_tasks")
      .where("status", "open")
      .where("source_type", "foundation")
      .whereNotNull("due_date")
      .where("due_date", "<=", new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString())
      .count("* as cnt")
      .first();
    const milestonesDue = Number(milestonesResult?.cnt ?? 0);

    return {
      totalApplications,
      pendingVerification,
      activeScholars,
      newThisWeek,
      milestonesDue,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[FoundationOps] Failed to get RISE pipeline status:", message);
    return {
      totalApplications: 0,
      pendingVerification: 0,
      activeScholars: 0,
      newThisWeek: 0,
      milestonesDue: 0,
    };
  }
}

async function getUpcomingDeadlines(
  lookaheadDays: number = 14
): Promise<FoundationCalendarItem[]> {
  const deadlines: FoundationCalendarItem[] = [];
  const now = Date.now();

  try {
    // Check Foundation-related tasks with due dates
    const dueTasks = await db("dream_team_tasks")
      .where("status", "!=", "done")
      .where("source_type", "foundation")
      .whereNotNull("due_date")
      .where(
        "due_date",
        "<=",
        new Date(now + lookaheadDays * 24 * 60 * 60 * 1000).toISOString()
      )
      .select("title", "due_date", "priority")
      .orderBy("due_date", "asc");

    for (const task of dueTasks) {
      const dueDate = new Date(task.due_date);
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - now) / (24 * 60 * 60 * 1000)
      );
      deadlines.push({
        type: "foundation_task",
        description: task.title,
        dueDate: task.due_date,
        daysUntilDue,
        urgency:
          daysUntilDue <= 3
            ? "urgent"
            : daysUntilDue <= 7
              ? "approaching"
              : "normal",
      });
    }

    // Check for Foundation behavioral events indicating upcoming compliance deadlines
    const complianceEvents = await db("behavioral_events")
      .where("event_type", "like", "foundation.deadline%")
      .where("created_at", ">=", new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString())
      .select("properties", "created_at")
      .orderBy("created_at", "desc")
      .limit(10);

    for (const evt of complianceEvents) {
      try {
        const props =
          typeof evt.properties === "string"
            ? JSON.parse(evt.properties)
            : evt.properties;
        if (props?.due_date) {
          const dueDate = new Date(props.due_date);
          const daysUntilDue = Math.ceil(
            (dueDate.getTime() - now) / (24 * 60 * 60 * 1000)
          );
          if (daysUntilDue >= 0 && daysUntilDue <= lookaheadDays) {
            deadlines.push({
              type: props.deadline_type || "compliance",
              description: props.description || "Foundation deadline",
              dueDate: props.due_date,
              daysUntilDue,
              urgency:
                daysUntilDue <= 3
                  ? "urgent"
                  : daysUntilDue <= 7
                    ? "approaching"
                    : "normal",
            });
          }
        }
      } catch {
        // skip malformed event
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[FoundationOps] Failed to get upcoming deadlines:", message);
  }

  return deadlines;
}

async function getFoundationTaskStatus(): Promise<{
  openTasks: number;
  staleTasks: number;
}> {
  try {
    const openResult = await db("dream_team_tasks")
      .where("status", "open")
      .where("source_type", "foundation")
      .count("* as cnt")
      .first();
    const openTasks = Number(openResult?.cnt ?? 0);

    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const staleResult = await db("dream_team_tasks")
      .where("status", "open")
      .where("source_type", "foundation")
      .where("created_at", "<", sevenDaysAgo)
      .count("* as cnt")
      .first();
    const staleTasks = Number(staleResult?.cnt ?? 0);

    return { openTasks, staleTasks };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[FoundationOps] Failed to get task status:", message);
    return { openTasks: 0, staleTasks: 0 };
  }
}

// -- Event Writing ----------------------------------------------------------

async function writeOpsReportEvent(report: FoundationOpsReport): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "foundation.ops_report",
      properties: JSON.stringify({
        report_type: report.reportType,
        foundation_orgs: report.foundationOrgs,
        rise_pipeline: {
          total_applications: report.risePipeline.totalApplications,
          pending_verification: report.risePipeline.pendingVerification,
          active_scholars: report.risePipeline.activeScholars,
          new_this_week: report.risePipeline.newThisWeek,
          milestones_due: report.risePipeline.milestonesDue,
        },
        upcoming_deadlines: report.upcomingDeadlines,
        open_tasks: report.openTasks,
        stale_tasks: report.staleTasks,
        reported_at: report.reportedAt,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[FoundationOps] Failed to write ops report event:", message);
  }
}
