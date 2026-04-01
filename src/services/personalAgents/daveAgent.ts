/**
 * Dave Agent -- Personal AI agent for the Builder (CTO).
 *
 * Monitors: pipeline status (green/red), Redis health, deploy history,
 * error rates, migration status, PM2 process status, pending tasks.
 *
 * Tone: technical, async-friendly, includes exact commands to fix things.
 * No meetings needed.
 */

import { db } from "../../database/connection";
import { isRedisHealthy } from "../redis";
import { PersonalBrief } from "./types";

interface SystemCheck {
  name: string;
  status: "green" | "red";
  detail: string;
  fixCommand?: string;
}

async function checkDatabaseHealth(): Promise<SystemCheck> {
  try {
    const start = Date.now();
    await db.raw("SELECT 1");
    const latency = Date.now() - start;
    return {
      name: "PostgreSQL",
      status: latency < 500 ? "green" : "red",
      detail: `Responding in ${latency}ms`,
    };
  } catch (err: any) {
    return {
      name: "PostgreSQL",
      status: "red",
      detail: err.message,
      fixCommand: "sudo systemctl restart postgresql",
    };
  }
}

async function checkRedisHealth(): Promise<SystemCheck> {
  try {
    const healthy = await isRedisHealthy();
    return {
      name: "Redis",
      status: healthy ? "green" : "red",
      detail: healthy ? "Connected and responding" : "Not responding",
      fixCommand: healthy ? undefined : "sudo systemctl restart redis-server",
    };
  } catch {
    return {
      name: "Redis",
      status: "red",
      detail: "Connection failed",
      fixCommand: "sudo systemctl restart redis-server",
    };
  }
}

async function getRecentErrors(hours: number = 24): Promise<{ count: number; topTypes: string[] }> {
  const since = new Date();
  since.setHours(since.getHours() - hours);

  try {
    const countResult = await db("behavioral_events")
      .where("created_at", ">=", since.toISOString())
      .where("event_type", "like", "%error%")
      .count("id as count")
      .first();

    const topTypes = await db("behavioral_events")
      .where("created_at", ">=", since.toISOString())
      .where("event_type", "like", "%error%")
      .groupBy("event_type")
      .orderByRaw("count(*) desc")
      .limit(5)
      .select("event_type", db.raw("count(*) as cnt"));

    return {
      count: Number(countResult?.count || 0),
      topTypes: topTypes.map((t: { event_type: string; cnt: string }) => `${t.event_type} (${t.cnt})`),
    };
  } catch {
    return { count: 0, topTypes: [] };
  }
}

async function getRecentDeploys(hours: number = 24): Promise<{ total: number; failed: number; events: string[] }> {
  const since = new Date();
  since.setHours(since.getHours() - hours);

  try {
    const deploys = await db("behavioral_events")
      .where("created_at", ">=", since.toISOString())
      .whereIn("event_type", ["deploy.started", "deploy.succeeded", "deploy.failed"])
      .orderBy("created_at", "desc")
      .select("event_type", "created_at", "properties")
      .limit(20);

    const total = deploys.length;
    const failed = deploys.filter((d: { event_type: string }) => d.event_type === "deploy.failed").length;

    return {
      total,
      failed,
      events: deploys.map((d: { event_type: string; created_at: string }) => {
        const time = new Date(d.created_at).toISOString().slice(11, 16);
        return `${time} UTC: ${d.event_type}`;
      }),
    };
  } catch {
    return { total: 0, failed: 0, events: [] };
  }
}

async function getPendingTasks(): Promise<{ title: string; priority: string }[]> {
  try {
    const tasks = await db("dream_team_tasks")
      .where({ status: "open" })
      .whereRaw("LOWER(title) LIKE '%dave%' OR LOWER(title) LIKE '%infra%' OR LOWER(title) LIKE '%deploy%' OR LOWER(title) LIKE '%server%'")
      .orderByRaw("CASE WHEN priority = 'P0' THEN 0 WHEN priority = 'P1' THEN 1 WHEN priority = 'P2' THEN 2 ELSE 3 END")
      .select("title", "priority")
      .limit(10);

    return tasks.map((t: { title: string; priority: string | null }) => ({
      title: t.title,
      priority: t.priority || "P2",
    }));
  } catch {
    return [];
  }
}

function calculateHealthScore(checks: SystemCheck[], errorCount: number, failedDeploys: number): number {
  let score = 100;

  // Each red check costs 25 points
  const redChecks = checks.filter((c) => c.status === "red").length;
  score -= redChecks * 25;

  // Errors cost 1 point per 10 errors (max 20 point deduction)
  score -= Math.min(20, Math.floor(errorCount / 10));

  // Failed deploys cost 10 points each (max 20 point deduction)
  score -= Math.min(20, failedDeploys * 10);

  return Math.max(0, Math.min(100, score));
}

export async function generateDailyBrief(_userId: number): Promise<PersonalBrief> {
  const [dbCheck, redisCheck, errors, deploys, tasks] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
    getRecentErrors(),
    getRecentDeploys(),
    getPendingTasks(),
  ]);

  const systemChecks = [dbCheck, redisCheck];
  const sections: PersonalBrief["sections"] = [];
  let urgentCount = 0;

  // Section 1: System status
  const statusItems: string[] = systemChecks.map((check) => {
    const icon = check.status === "green" ? "[OK]" : "[DOWN]";
    const line = `${icon} ${check.name}: ${check.detail}`;
    if (check.status === "red") urgentCount++;
    return check.fixCommand ? `${line} -- fix: ${check.fixCommand}` : line;
  });

  const allGreen = systemChecks.every((c) => c.status === "green");
  sections.push({
    title: allGreen ? "System Status: All Green" : "System Status: Issues Detected",
    items: statusItems,
  });

  // Section 2: Deploys
  if (deploys.total > 0 || deploys.failed > 0) {
    const deployItems: string[] = [
      `${deploys.total} deploys in last 24h, ${deploys.failed} failed`,
    ];
    if (deploys.failed > 0) {
      urgentCount += deploys.failed;
      deployItems.push("Fix: check PM2 logs with `pm2 logs --lines 50`");
    }
    if (deploys.events.length > 0) {
      deployItems.push(...deploys.events.slice(0, 5));
    }
    sections.push({ title: "Deploy History (24h)", items: deployItems });
  }

  // Section 3: Errors
  const errorItems: string[] = [`${errors.count} error events in last 24h`];
  if (errors.topTypes.length > 0) {
    errorItems.push(...errors.topTypes);
  }
  if (errors.count > 0) {
    errorItems.push("Inspect: `SELECT event_type, count(*) FROM behavioral_events WHERE event_type LIKE '%error%' AND created_at > now() - interval '24h' GROUP BY 1 ORDER BY 2 DESC;`");
  }
  sections.push({ title: "Error Summary", items: errorItems });

  // Section 4: Queued tasks
  if (tasks.length > 0) {
    sections.push({
      title: "Queued Tasks",
      items: tasks.map((t) => `[${t.priority}] ${t.title}`),
    });
  }

  // Health score
  const healthScore = calculateHealthScore(systemChecks, errors.count, deploys.failed);

  // Headline
  const headline = allGreen && errors.count === 0
    ? `All systems green. ${errors.count} errors, ${deploys.failed} failed deploys.`
    : `${urgentCount} system issue${urgentCount === 1 ? "" : "s"} detected. ${errors.count} errors in last 24h.`;

  const signoff = `System health score: ${healthScore}/100 (uptime: ${allGreen ? "100%" : "degraded"}, errors: ${errors.count}, deploy success: ${deploys.total > 0 ? Math.round(((deploys.total - deploys.failed) / deploys.total) * 100) : 100}%)`;

  return { headline, sections, signoff, urgentCount };
}
