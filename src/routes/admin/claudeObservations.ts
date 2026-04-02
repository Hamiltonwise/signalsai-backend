/**
 * Claude Observations API
 *
 * GET /api/admin/claude-observations?role=visionary|integrator|build
 *
 * Returns role-specific observations sourced from real data:
 * - Compliance scan findings
 * - Clarity analytics anomalies
 * - Customer health signals
 * - Infrastructure status
 * - Competitive intelligence
 *
 * Each observation includes a confidence level (green/yellow/red)
 * and a source attribution.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import { getKeyDataForClient } from "../../controllers/clarity/feature-services/service.clarity-data";

const claudeObservationsRoutes = express.Router();

interface Observation {
  id: string;
  text: string;
  confidence: "green" | "yellow" | "red";
  type: "insight" | "action" | "blocker" | "verified";
  source?: string;
}

/**
 * Gather observations from real data sources.
 */
async function gatherObservations(role: string): Promise<Observation[]> {
  const observations: Observation[] = [];
  let obsIndex = 0;

  try {
    // 1. Compliance findings across all orgs
    const complianceScans = await db("compliance_scans")
      .orderBy("scanned_at", "desc")
      .limit(10)
      .catch(() => []);

    for (const scan of complianceScans) {
      const findings = typeof scan.findings === "string"
        ? JSON.parse(scan.findings)
        : scan.findings || [];

      const highFindings = findings.filter((f: any) => f.severity === "high");
      if (highFindings.length > 0 && (role === "visionary" || role === "integrator")) {
        const org = await db("organizations").where({ id: scan.organization_id }).first().catch(() => null);
        observations.push({
          id: `compliance-${obsIndex++}`,
          text: `${org?.name || "A customer"} has ${highFindings.length} high-priority compliance concern${highFindings.length !== 1 ? "s" : ""} on their website. "${highFindings[0].claim}" may need review before AAE.`,
          confidence: "yellow",
          type: "action",
          source: `Compliance scan, ${new Date(scan.scanned_at).toLocaleDateString()}`,
        });
      }
    }

    // 2. Clarity analytics anomalies
    const domains = ["dentalemr.com", "getalloro.com"];
    for (const domain of domains) {
      try {
        const clarityData = await getKeyDataForClient(domain);
        if (clarityData?.sessions) {
          const curr = clarityData.sessions.currMonth ?? 0;
          const prev = clarityData.sessions.prevMonth ?? 0;

          if (prev > 0 && curr === 0) {
            observations.push({
              id: `clarity-${obsIndex++}`,
              text: `${domain} shows 0 sessions this month vs ${prev.toLocaleString()} last month. This is likely a tracking issue, not a real traffic collapse. Clarity snippet may have been removed during a site update.`,
              confidence: "yellow",
              type: "blocker",
              source: "Microsoft Clarity",
            });
          } else if (prev > 0 && curr < prev * 0.7) {
            const dropPct = Math.round((1 - curr / prev) * 100);
            if (role === "visionary" || role === "integrator") {
              observations.push({
                id: `clarity-${obsIndex++}`,
                text: `${domain} traffic is down ${dropPct}% this month (${curr.toLocaleString()} vs ${prev.toLocaleString()} sessions). Worth investigating.`,
                confidence: "yellow",
                type: "insight",
                source: "Microsoft Clarity",
              });
            }
          }
        }
      } catch {
        // Clarity data not available for this domain
      }
    }

    // 3. Customer health signals
    if (role === "visionary" || role === "integrator") {
      const orgs = await db("organizations")
        .whereIn("subscription_status", ["active", "trial"])
        .select("id", "name", "subscription_status", "created_at")
        .catch(() => []);

      for (const org of orgs) {
        // Check for recent agent results (sign of active monitoring)
        const recentResults = await db("agent_results")
          .where({ organization_id: org.id })
          .where("created_at", ">", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .count("* as count")
          .first()
          .catch(() => null);

        if (recentResults && parseInt((recentResults as any)?.count || "0", 10) === 0) {
          if (org.subscription_status === "active") {
            observations.push({
              id: `health-${obsIndex++}`,
              text: `No agent results for ${org.name} in the past week. Proofline may not be running for this org.`,
              confidence: "yellow",
              type: "insight",
              source: "Agent pipeline",
            });
          }
        }
      }
    }

    // 4. PMS pipeline health (stuck or failed jobs)
    if (role === "visionary" || role === "integrator" || role === "build") {
      const stuckJobs = await db("pms_jobs")
        .where("status", "pending")
        .where("timestamp", "<", new Date(Date.now() - 15 * 60 * 1000)) // older than 15 min
        .select("id", "organization_id", "timestamp")
        .catch(() => []);

      for (const job of stuckJobs) {
        const org = await db("organizations").where({ id: job.organization_id }).first().catch(() => null);
        const minutesStuck = Math.round((Date.now() - new Date(job.timestamp).getTime()) / 60_000);
        observations.push({
          id: `pms-stuck-${obsIndex++}`,
          text: `PMS upload for ${org?.name || "a customer"} has been processing for ${minutesStuck} minutes. The parser webhook may be unreachable. Retry or switch to manual entry.`,
          confidence: "yellow",
          type: "blocker",
          source: `PMS job #${job.id}`,
        });
      }

      // Check for failed jobs in the last 24 hours
      const failedJobs = await db("pms_jobs")
        .where("status", "error")
        .where("timestamp", ">", new Date(Date.now() - 24 * 60 * 60 * 1000))
        .select("id", "organization_id", "automation_status_detail")
        .catch(() => []);

      for (const job of failedJobs) {
        const org = await db("organizations").where({ id: job.organization_id }).first().catch(() => null);
        const detail = typeof job.automation_status_detail === "string"
          ? JSON.parse(job.automation_status_detail)
          : job.automation_status_detail;
        const failedStep = Object.entries(detail?.steps || {}).find(
          ([, v]: [string, any]) => v?.status === "failed"
        );
        const stepName = failedStep ? failedStep[0].replace(/_/g, " ") : "unknown step";
        observations.push({
          id: `pms-failed-${obsIndex++}`,
          text: `PMS upload for ${org?.name || "a customer"} failed at ${stepName}. Data was not processed. Retry from the admin panel.`,
          confidence: "red",
          type: "blocker",
          source: `PMS job #${job.id}`,
        });
      }
    }

    // 5. Infrastructure blockers (build role)
    if (role === "build") {
      // Check for pending migrations
      const envVarsNeeded = [];
      if (!process.env.HUBSPOT_CLIENT_ID) envVarsNeeded.push("HUBSPOT_CLIENT_ID");
      if (!process.env.HUBSPOT_CLIENT_SECRET) envVarsNeeded.push("HUBSPOT_CLIENT_SECRET");
      if (!process.env.HUBSPOT_REDIRECT_URI) envVarsNeeded.push("HUBSPOT_REDIRECT_URI");

      if (envVarsNeeded.length > 0) {
        observations.push({
          id: `infra-${obsIndex++}`,
          text: `HubSpot integration is built but missing env vars: ${envVarsNeeded.join(", ")}. Jay can't connect until these are set.`,
          confidence: "green",
          type: "blocker",
          source: "Environment check",
        });
      }

      // Check Redis
      try {
        const healthRes = await fetch("http://localhost:3000/api/health");
        const health = await healthRes.json();
        if (health.redis !== "connected") {
          observations.push({
            id: `infra-${obsIndex++}`,
            text: "Redis is not connected. BullMQ jobs, caching, and rate limiting are affected.",
            confidence: "red",
            type: "blocker",
            source: "Health check",
          });
        }
      } catch {
        // Can't reach health endpoint
      }
    }

    // 5. Verified wins (all roles)
    const recentScans = await db("compliance_scans")
      .where("scanned_at", ">", new Date(Date.now() - 24 * 60 * 60 * 1000))
      .count("* as count")
      .first()
      .catch(() => null);

    if (recentScans && parseInt((recentScans as any)?.count || "0", 10) > 0) {
      observations.push({
        id: `verified-${obsIndex++}`,
        text: "Compliance scanner is active. Website marketing claims are being monitored automatically.",
        confidence: "green",
        type: "verified",
        source: "System status",
      });
    }

    const keywordCount = await db("focus_keywords")
      .where({ is_active: true })
      .count("* as count")
      .first()
      .catch(() => null);

    if (keywordCount && parseInt((keywordCount as any)?.count || "0", 10) > 0) {
      observations.push({
        id: `verified-${obsIndex++}`,
        text: `${parseInt((keywordCount as any).count, 10)} focus keywords tracked across all customers. Monday position checks are configured.`,
        confidence: "green",
        type: "verified",
        source: "Keyword tracker",
      });
    }

  } catch (err: any) {
    console.error("[Claude Observations] Error gathering data:", err.message);
  }

  // Sort: blockers first, then actions, then insights, then verified
  const priority = { blocker: 0, action: 1, insight: 2, verified: 3 };
  observations.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));

  return observations;
}

claudeObservationsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const role = (req.query.role as string) || "visionary";
      const observations = await gatherObservations(role);
      return res.json({ success: true, observations });
    } catch (error: any) {
      console.error("[Claude Observations] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load observations" });
    }
  }
);

export default claudeObservationsRoutes;
