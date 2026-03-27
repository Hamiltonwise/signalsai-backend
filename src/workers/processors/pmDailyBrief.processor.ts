import { Job } from "bullmq";
import { db } from "../../database/connection";
import { PmDailyBriefModel } from "../../models/PmDailyBriefModel";
import { runAgent } from "../../agents/service.llm-runner";
import { loadPrompt } from "../../agents/service.prompt-loader";

export async function processPmDailyBrief(_job: Job): Promise<void> {
  console.log("[PM-DAILY-BRIEF] Starting daily brief generation...");

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Check if brief already exists for today (idempotent)
  const existing = await PmDailyBriefModel.findOne({ brief_date: today });
  if (existing) {
    console.log("[PM-DAILY-BRIEF] Brief already exists for today, skipping.");
    return;
  }

  // Aggregate task data
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(now.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const [completedYesterday, overdueTasks, dueToday, dueThisWeek, allActive] =
    await Promise.all([
      db("pm_tasks")
        .select("pm_tasks.*", "pm_projects.name as project_name")
        .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
        .where("pm_projects.status", "active")
        .whereBetween("pm_tasks.completed_at", [
          yesterdayStart.toISOString(),
          todayStart.toISOString(),
        ]),
      db("pm_tasks")
        .select("pm_tasks.*", "pm_projects.name as project_name")
        .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
        .where("pm_projects.status", "active")
        .whereNull("pm_tasks.completed_at")
        .where("pm_tasks.deadline", "<", now.toISOString()),
      db("pm_tasks")
        .select("pm_tasks.*", "pm_projects.name as project_name")
        .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
        .where("pm_projects.status", "active")
        .whereNull("pm_tasks.completed_at")
        .whereBetween("pm_tasks.deadline", [
          todayStart.toISOString(),
          todayEnd.toISOString(),
        ]),
      db("pm_tasks")
        .select("pm_tasks.*", "pm_projects.name as project_name")
        .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
        .where("pm_projects.status", "active")
        .whereNull("pm_tasks.completed_at")
        .whereBetween("pm_tasks.deadline", [
          now.toISOString(),
          endOfWeek.toISOString(),
        ]),
      db("pm_tasks")
        .select("pm_tasks.*", "pm_projects.name as project_name")
        .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
        .where("pm_projects.status", "active")
        .whereNull("pm_tasks.completed_at")
        .orderBy("pm_tasks.priority", "asc")
        .limit(50),
    ]);

  // Format data for Claude
  const dataPayload = {
    completed_yesterday: completedYesterday.map((t: any) => ({
      id: t.id,
      title: t.title,
      project: t.project_name,
    })),
    overdue: overdueTasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      deadline: t.deadline,
      project: t.project_name,
    })),
    due_today: dueToday.map((t: any) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      project: t.project_name,
    })),
    due_this_week: dueThisWeek.map((t: any) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      deadline: t.deadline,
      project: t.project_name,
    })),
    all_active_tasks: allActive.map((t: any) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      deadline: t.deadline,
      project: t.project_name,
    })),
  };

  // If no tasks at all, generate a simple "no activity" brief
  const hasAnyData =
    completedYesterday.length > 0 ||
    overdueTasks.length > 0 ||
    dueToday.length > 0 ||
    allActive.length > 0;

  let briefData: any;

  if (!hasAnyData) {
    briefData = {
      greeting: "Good morning! It's a fresh start — no tasks in the system yet.",
      yesterday_summary: "No tasks were completed yesterday.",
      overdue_alert: null,
      recommended_focus: [],
      upcoming_deadlines: "No upcoming deadlines.",
    };
  } else {
    const systemPrompt = loadPrompt("pmAgents/DailyBrief");
    const result = await runAgent({
      systemPrompt,
      userMessage: JSON.stringify(dataPayload),
      maxTokens: 2048,
      temperature: 0.3,
      prefill: "{",
    });

    briefData = result.parsed;
    if (!briefData || typeof briefData !== "object") {
      console.error("[PM-DAILY-BRIEF] Failed to parse Claude response:", result.raw);
      briefData = {
        greeting: "Good morning!",
        yesterday_summary: `${completedYesterday.length} tasks completed yesterday.`,
        overdue_alert:
          overdueTasks.length > 0
            ? `${overdueTasks.length} tasks are overdue.`
            : null,
        recommended_focus: [],
        upcoming_deadlines: `${dueThisWeek.length} tasks due this week.`,
      };
    }
  }

  // Build summary HTML
  const summaryHtml = [
    `<p>${briefData.greeting}</p>`,
    briefData.yesterday_summary
      ? `<p><strong>Yesterday:</strong> ${briefData.yesterday_summary}</p>`
      : "",
    briefData.overdue_alert
      ? `<p><strong>Overdue:</strong> ${briefData.overdue_alert}</p>`
      : "",
    briefData.upcoming_deadlines
      ? `<p><strong>This week:</strong> ${briefData.upcoming_deadlines}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Store brief
  await PmDailyBriefModel.create({
    brief_date: today,
    summary_html: summaryHtml,
    tasks_completed_yesterday: completedYesterday.length,
    tasks_overdue: overdueTasks.length,
    tasks_due_today: dueToday.length,
    recommended_tasks: briefData.recommended_focus || [],
    generated_at: new Date(),
  });

  console.log("[PM-DAILY-BRIEF] Brief generated and stored for", today);
}
