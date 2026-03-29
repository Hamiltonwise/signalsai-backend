/**
 * CS Pulse -- Daily Health Classification Cron (WO-T5)
 *
 * Schedule: Daily 7:00 AM PT (configured in BullMQ scheduler or n8n).
 * For each active org: classify GREEN / AMBER / RED based on
 * login recency and open dream_team_tasks. Posts consolidated
 * brief to #alloro-cs via webhook. Logs to behavioral_events.
 *
 * Env: ALLORO_CS_SLACK_WEBHOOK
 */

import axios from "axios";
import { db } from "../database/connection";

const CS_SLACK_WEBHOOK = process.env.ALLORO_CS_SLACK_WEBHOOK || "";

type HealthStatus = "green" | "amber" | "red";

interface OrgHealth {
  org_id: number;
  org_name: string;
  status: HealthStatus;
  reason: string;
  days_since_login: number | null;
  open_tasks: number;
}

/**
 * Classify a single org's health status.
 *
 * RED:   No login in 14+ days, OR 3+ open tasks overdue
 * AMBER: No login in 7-13 days, OR 2+ open tasks
 * GREEN: Everything else
 */
export async function classifyOrgHealth(orgId: number): Promise<OrgHealth | null> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return null;

  // Days since last login (use first_login_at as the most recent login signal we have)
  let daysSinceLogin: number | null = null;
  if (org.first_login_at) {
    const now = new Date();
    const lastLogin = new Date(org.first_login_at);
    daysSinceLogin = Math.floor((now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Open dream_team_tasks count
  const openTasksResult = await db("dream_team_tasks")
    .where({ status: "open" })
    .whereExists(function () {
      this.select(db.raw(1))
        .from("dream_team_nodes")
        .whereRaw("dream_team_nodes.id = dream_team_tasks.node_id")
        .whereRaw("dream_team_nodes.org_id = ?", [orgId]);
    })
    .count("id as count")
    .first();

  const openTasks = Number(openTasksResult?.count || 0);

  // Overdue tasks (due_date in the past)
  const overdueResult = await db("dream_team_tasks")
    .where({ status: "open" })
    .whereNotNull("due_date")
    .where("due_date", "<", db.fn.now())
    .whereExists(function () {
      this.select(db.raw(1))
        .from("dream_team_nodes")
        .whereRaw("dream_team_nodes.id = dream_team_tasks.node_id")
        .whereRaw("dream_team_nodes.org_id = ?", [orgId]);
    })
    .count("id as count")
    .first();

  const overdueTasks = Number(overdueResult?.count || 0);

  // Classification
  let status: HealthStatus = "green";
  let reason = "Active and healthy";

  if ((daysSinceLogin !== null && daysSinceLogin >= 14) || overdueTasks >= 3) {
    status = "red";
    reason = daysSinceLogin !== null && daysSinceLogin >= 14
      ? `No login in ${daysSinceLogin} days`
      : `${overdueTasks} overdue tasks`;
  } else if ((daysSinceLogin !== null && daysSinceLogin >= 7) || openTasks >= 2) {
    status = "amber";
    reason = daysSinceLogin !== null && daysSinceLogin >= 7
      ? `No login in ${daysSinceLogin} days`
      : `${openTasks} open tasks`;
  }

  // ─── Lemonis Churn Risk Signals (WO-54) ──────────────────────────

  const accountAgeDays = org.created_at
    ? Math.floor((Date.now() - new Date(org.created_at).getTime()) / 86_400_000)
    : 0;

  const signals: string[] = [];

  // Signal 1: Data Avoidance (no GBP + no PMS after 14 days)
  if (accountAgeDays >= 14 && !org.gbp_access_token) {
    const hasPMS = await db("pms_jobs").where({ organization_id: orgId }).first();
    if (!hasPMS) {
      signals.push(`${org.name || "Account"}: avoiding data connection at ${accountAgeDays} days.`);
      if (status === "green") { status = "amber"; reason = "Data avoidance at 14+ days"; }
    }
  }

  // Signal 3: One Action Inaction (same card 3+ weeks)
  const recentActions = await db("behavioral_events")
    .where({ organization_id: orgId, event_type: "one_action.completed" })
    .where("created_at", ">=", new Date(Date.now() - 21 * 86_400_000))
    .count("id as count")
    .first();
  if (Number(recentActions?.count || 0) === 0 && accountAgeDays > 21) {
    signals.push(`${org.name || "Account"}: One Action Card not acted on for 3+ weeks.`);
    if (status === "green") { status = "amber"; reason = "One Action not acted on"; }
  }

  // Signal 5: Low Confidence Score
  const ownerProfile = org.owner_profile
    ? (typeof org.owner_profile === "string" ? JSON.parse(org.owner_profile) : org.owner_profile)
    : null;
  if (ownerProfile?.confidence_score != null && ownerProfile.confidence_score <= 4) {
    signals.push(`${org.name || "Account"}: owner confidence score ${ownerProfile.confidence_score}/10 at signup.`);
    if (status === "green") { status = "amber"; reason = `Low confidence: ${ownerProfile.confidence_score}/10`; }
  }

  // Persist classification
  await db("organizations")
    .where({ id: orgId })
    .update({ client_health_status: status });

  // ─── Autonomous Churn Intervention (zero-human recovery) ──────
  // When status is AMBER or RED, auto-fire a personalized recovery
  // email before creating a task for Jo. The email is the first
  // intervention. Jo only gets involved if auto-recovery fails.
  if ((status === "amber" || status === "red") && signals.length > 0) {
    try {
      // Check if we already sent a recovery email in the last 14 days
      const hasTable = await db.schema.hasTable("behavioral_events");
      if (hasTable) {
        const recentRecovery = await db("behavioral_events")
          .where({ organization_id: orgId, event_type: "churn.recovery_sent" })
          .where("created_at", ">=", new Date(Date.now() - 14 * 86_400_000))
          .first();

        if (!recentRecovery) {
          // Find the owner's email
          const orgUser = await db("organization_users")
            .where({ organization_id: orgId, role: "admin" })
            .first();
          if (orgUser) {
            const user = await db("users").where({ id: orgUser.user_id }).first("email", "first_name");
            if (user?.email) {
              // Queue recovery email via the email service
              const emailWebhook = process.env.ALLORO_EMAIL_SERVICE_WEBHOOK;
              if (emailWebhook) {
                const firstName = user.first_name || "there";
                const subject = `${firstName}, something changed in your market this week`;
                const body = `${firstName},\n\nYour market moved while you were away. We caught something specific about your competitive position that you should see before Monday.\n\nIt takes 60 seconds: ${process.env.APP_URL || "https://app.getalloro.com"}/dashboard\n\nIf any of this is off, reply. I read every reply personally.\n\nCorey`;

                await fetch(emailWebhook, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: user.email,
                    subject,
                    text: body,
                    from: "corey@getalloro.com",
                  }),
                }).catch(() => {});

                // Log the recovery attempt
                await db("behavioral_events").insert({
                  organization_id: orgId,
                  event_type: "churn.recovery_sent",
                  metadata: JSON.stringify({ reason, signals, method: "auto_email" }),
                }).catch(() => {});

                console.log(`[CSPulse] Auto-recovery email sent to ${user.email} for ${org.name} (${status})`);
              }
            }
          }
        }
      }
    } catch (recoveryErr: any) {
      console.warn(`[CSPulse] Auto-recovery failed for ${org.name}:`, recoveryErr.message);
    }
  }

  return {
    org_id: orgId,
    org_name: org.name,
    status,
    reason,
    days_since_login: daysSinceLogin,
    open_tasks: openTasks,
  };
}

/**
 * Run CS Pulse for all active orgs.
 * Posts a single consolidated Slack brief to #alloro-cs.
 * RED clients listed first. GREEN collapsed to count.
 */
export async function runCsPulse(): Promise<{ classified: number; total: number }> {
  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select("id", "name");

  const results: OrgHealth[] = [];

  for (const org of orgs) {
    try {
      const health = await classifyOrgHealth(org.id);
      if (health) results.push(health);
    } catch (err: any) {
      console.error(`[CSPulse] Error classifying ${org.name}:`, err.message);
    }
  }

  const red = results.filter((r) => r.status === "red");
  const amber = results.filter((r) => r.status === "amber");
  const green = results.filter((r) => r.status === "green");

  // Auto-create dream_team_task for RED clients (assigned to Jo)
  for (const client of red) {
    try {
      const existing = await db("dream_team_tasks")
        .where({ owner_name: "Jo", status: "open" })
        .whereRaw("title LIKE ?", [`%${client.org_name}%`])
        .whereRaw("source_type = 'cs_pulse'")
        .first();

      if (!existing) {
        await db("dream_team_tasks").insert({
          owner_name: "Jo",
          title: `RED health alert: ${client.org_name}`,
          description: `CS Pulse flagged ${client.org_name} as RED. Reason: ${client.reason}. Org ID: ${client.org_id}. Needs immediate outreach.`,
          status: "open",
          priority: "urgent",
          source_type: "cs_pulse",
        });
      }
    } catch (err: any) {
      console.error(`[CSPulse] Failed to create task for ${client.org_name}:`, err.message);
    }
  }

  // Log to behavioral_events
  await db("behavioral_events").insert({
    event_type: "cs_pulse.daily_brief",
    properties: JSON.stringify({
      total: results.length,
      red: red.length,
      amber: amber.length,
      green: green.length,
      red_clients: red.map((r) => ({ org_id: r.org_id, name: r.org_name, reason: r.reason })),
      amber_clients: amber.map((r) => ({ org_id: r.org_id, name: r.org_name, reason: r.reason })),
    }),
  });

  // Build Slack message
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "CS Pulse -- Daily Health Brief" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${results.length} clients* | :red_circle: ${red.length} RED | :large_orange_circle: ${amber.length} AMBER | :large_green_circle: ${green.length} GREEN`,
      },
    },
  ];

  if (red.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":red_circle: *RED -- Immediate Attention*\n" +
          red.map((r) => `- *${r.org_name}*: ${r.reason} (${r.open_tasks} open tasks)`).join("\n"),
      },
    });
  }

  if (amber.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":large_orange_circle: *AMBER -- Watch List*\n" +
          amber.map((r) => `- *${r.org_name}*: ${r.reason}`).join("\n"),
      },
    });
  }

  if (green.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:large_green_circle: *GREEN* -- ${green.length} client${green.length !== 1 ? "s" : ""} healthy`,
      },
    });
  }

  // Post to Slack
  if (CS_SLACK_WEBHOOK) {
    try {
      await axios.post(CS_SLACK_WEBHOOK, { blocks }, { timeout: 15000 });
      console.log(`[CSPulse] Brief posted to #alloro-cs`);
    } catch (err: any) {
      console.error(`[CSPulse] Slack post failed:`, err.message);
    }
  } else {
    console.log(`[CSPulse] ALLORO_CS_SLACK_WEBHOOK not set -- brief logged only`);
  }

  console.log(`[CSPulse] Classified ${results.length} orgs: ${red.length} RED, ${amber.length} AMBER, ${green.length} GREEN`);
  return { classified: results.length, total: orgs.length };
}
