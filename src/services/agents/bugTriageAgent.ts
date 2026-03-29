/**
 * Bug Triage Agent -- Execution Service
 *
 * Self-healing product loop. Monitors behavioral_events for error
 * patterns, groups by type, counts frequency, and creates
 * dream_team_tasks for errors exceeding threshold (5+ in 24h).
 *
 * Checks if SENTRY_DSN is available for enhanced error context.
 * Runs hourly via BullMQ cron.
 *
 * Writes "ops.bug_detected" event for each triaged bug.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface ErrorGroup {
  eventType: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sampleProperties: Record<string, unknown>;
  orgIds: number[];
}

interface TriageSummary {
  scannedAt: string;
  totalErrorEvents: number;
  errorGroups: number;
  tasksCreated: number;
  sentryAvailable: boolean;
}

// -- Constants --------------------------------------------------------------

const ERROR_THRESHOLD = 5; // 5+ occurrences in 24h triggers a task
const LOOKBACK_HOURS = 24;

// -- Core -------------------------------------------------------------------

/**
 * Run the Bug Triage scan.
 * Queries behavioral_events for error patterns in the last 24 hours,
 * groups them, and creates tasks for anything exceeding threshold.
 */
export async function runBugTriage(): Promise<TriageSummary> {
  const sentryAvailable = !!process.env.SENTRY_DSN;
  const cutoff = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Find all error-type events in the last 24 hours
  const errorEvents = await db("behavioral_events")
    .where("created_at", ">=", cutoff)
    .andWhere(function () {
      this.where("event_type", "like", "%error%")
        .orWhere("event_type", "like", "%fail%")
        .orWhere("event_type", "like", "%exception%");
    })
    .orderBy("created_at", "desc");

  if (errorEvents.length === 0) {
    console.log("[BugTriage] No error events in the last 24 hours.");
    return {
      scannedAt: new Date().toISOString(),
      totalErrorEvents: 0,
      errorGroups: 0,
      tasksCreated: 0,
      sentryAvailable,
    };
  }

  // Group errors by event_type
  const groups = new Map<string, ErrorGroup>();

  for (const event of errorEvents) {
    const existing = groups.get(event.event_type);
    const props = typeof event.properties === "string"
      ? safeParseJSON(event.properties)
      : event.properties || {};

    if (existing) {
      existing.count++;
      if (event.created_at < existing.firstSeen) {
        existing.firstSeen = event.created_at;
      }
      if (event.created_at > existing.lastSeen) {
        existing.lastSeen = event.created_at;
      }
      if (event.org_id && !existing.orgIds.includes(event.org_id)) {
        existing.orgIds.push(event.org_id);
      }
    } else {
      groups.set(event.event_type, {
        eventType: event.event_type,
        count: 1,
        firstSeen: event.created_at,
        lastSeen: event.created_at,
        sampleProperties: props,
        orgIds: event.org_id ? [event.org_id] : [],
      });
    }
  }

  // Create tasks for groups exceeding threshold
  let tasksCreated = 0;

  for (const group of groups.values()) {
    if (group.count >= ERROR_THRESHOLD) {
      const alreadyTriaged = await checkExistingTask(group.eventType);
      if (!alreadyTriaged) {
        await createBugTask(group, sentryAvailable);
        await writeBugDetectedEvent(group);
        tasksCreated++;
      }
    }
  }

  const summary: TriageSummary = {
    scannedAt: new Date().toISOString(),
    totalErrorEvents: errorEvents.length,
    errorGroups: groups.size,
    tasksCreated,
    sentryAvailable,
  };

  console.log(
    `[BugTriage] Scan complete: ${errorEvents.length} error events, ${groups.size} groups, ${tasksCreated} tasks created`
  );

  return summary;
}

// -- Helpers ----------------------------------------------------------------

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * Check if there is already an open dream_team_task for this error type.
 * Prevents duplicate triage tasks.
 */
async function checkExistingTask(eventType: string): Promise<boolean> {
  const existing = await db("dream_team_tasks")
    .where("source_agent", "bug_triage")
    .andWhere("status", "!=", "done")
    .andWhere("title", "like", `%${eventType}%`)
    .first();
  return !!existing;
}

/**
 * Create a dream_team_task for a bug that exceeds the threshold.
 */
async function createBugTask(
  group: ErrorGroup,
  sentryAvailable: boolean
): Promise<void> {
  const severity =
    group.count >= 50
      ? "critical"
      : group.count >= 20
        ? "high"
        : group.count >= 10
          ? "medium"
          : "low";

  const affectedOrgs =
    group.orgIds.length > 0
      ? `Affects ${group.orgIds.length} org(s): [${group.orgIds.slice(0, 5).join(", ")}${group.orgIds.length > 5 ? "..." : ""}]`
      : "No org association detected.";

  const sentryNote = sentryAvailable
    ? "Sentry DSN is configured. Check Sentry dashboard for stack traces and session replay."
    : "No Sentry DSN configured. Error details limited to behavioral_events properties.";

  try {
    await db("dream_team_tasks").insert({
      title: `Bug: ${group.eventType} (${group.count}x in 24h)`,
      description: [
        `Automated bug detection: "${group.eventType}" occurred ${group.count} times in the last 24 hours.`,
        "",
        `Severity: ${severity}`,
        `First seen: ${group.firstSeen}`,
        `Last seen: ${group.lastSeen}`,
        affectedOrgs,
        "",
        `Sample properties: ${JSON.stringify(group.sampleProperties, null, 2).substring(0, 500)}`,
        "",
        sentryNote,
      ].join("\n"),
      source_agent: "bug_triage",
      priority: severity === "critical" ? 1 : severity === "high" ? 2 : severity === "medium" ? 3 : 4,
      status: "open",
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: any) {
    console.error(
      `[BugTriage] Failed to create task for ${group.eventType}:`,
      err.message
    );
  }
}

// -- Writers ----------------------------------------------------------------

async function writeBugDetectedEvent(group: ErrorGroup): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "ops.bug_detected",
      properties: JSON.stringify({
        error_type: group.eventType,
        count_24h: group.count,
        first_seen: group.firstSeen,
        last_seen: group.lastSeen,
        affected_orgs: group.orgIds.length,
        sample_properties: group.sampleProperties,
        triaged_at: new Date().toISOString(),
      }),
    });
  } catch (err: any) {
    console.error(
      `[BugTriage] Failed to write bug_detected event:`,
      err.message
    );
  }
}
