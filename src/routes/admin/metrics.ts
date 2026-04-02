/**
 * Admin Metrics API -- Pre-computed business metrics for all admin dashboards.
 *
 * Every admin page calls this instead of computing MRR/health/counts locally.
 * The single source of truth is src/services/businessMetrics.ts.
 *
 * Returns three sections:
 * 1. mrr: total, byOrg, burn, delta, paying count
 * 2. clients: per-paying-client detail (name, mrr, health, lastLogin, insight)
 * 3. pipeline: funnel stages with conversion rates
 */

import { Router, Request, Response } from "express";
import { db } from "../../database/connection";
import { getMRRBreakdown, getOrgMRR, refreshBurnRate } from "../../services/businessMetrics";

const router = Router();

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function clientInsight(org: any, mrr: number, totalMrr: number): string {
  const lastLogin = org.first_login_at || org.last_login_at;
  if (!lastLogin) return "Has not logged in yet";

  const daysSinceLogin = Math.floor(
    (Date.now() - new Date(lastLogin).getTime()) / 86_400_000
  );

  if (daysSinceLogin === 0) return "Active today";
  if (daysSinceLogin <= 2) return `Active ${daysSinceLogin}d ago`;
  if (daysSinceLogin <= 7) return `Quiet for ${daysSinceLogin} days`;

  const concentration = totalMrr > 0 ? Math.round((mrr / totalMrr) * 100) : 0;
  const riskPrefix = concentration >= 25 ? `${concentration}% of revenue. ` : "";
  return `${riskPrefix}No login in ${daysSinceLogin} days`;
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const orgs = await db("organizations")
      .select(
        "id", "name", "subscription_status", "subscription_tier",
        "client_health_status", "created_at", "onboarding_completed",
        "first_login_at"
      );

    // ---- MRR Breakdown ----
    const allOrgs = orgs.map((o: any) => ({ ...o }));
    const mrr = getMRRBreakdown(allOrgs);

    // ---- Paying Clients (detailed) ----
    const payingClients = allOrgs
      .filter((o: any) => getOrgMRR(o.id) > 0)
      .map((o: any) => {
        const orgMrr = getOrgMRR(o.id);
        return {
          id: o.id,
          name: o.name,
          mrr: orgMrr,
          health: o.client_health_status || "green",
          lastLogin: o.first_login_at ? timeAgo(o.first_login_at) : "never",
          lastLoginRaw: o.first_login_at || null,
          insight: clientInsight(o, orgMrr, mrr.total),
          concentration: mrr.total > 0 ? Math.round((orgMrr / mrr.total) * 100) : 0,
        };
      })
      .sort((a: any, b: any) => b.mrr - a.mrr);

    // ---- Pipeline Funnel ----
    // Stages: checkup (has org record) -> account (has login) -> trial -> onboarding complete -> paying
    const nonPaying = allOrgs.filter((o: any) => getOrgMRR(o.id) === 0);

    const checkupStarted = nonPaying.length; // All non-paying orgs came through checkup
    const accountCreated = nonPaying.filter(
      (o: any) => o.first_login_at
    ).length;
    const inTrial = nonPaying.filter(
      (o: any) => o.subscription_status === "trial" || o.subscription_status === "trialing"
    ).length;
    const onboardingComplete = nonPaying.filter(
      (o: any) => o.onboarding_completed
    ).length;
    const paying = payingClients.length;
    const totalSignups = allOrgs.length;

    const convRate = (num: number, denom: number) =>
      denom > 0 ? Math.round((num / denom) * 100) : 0;

    const pipeline = {
      totalSignups,
      checkupStarted,
      accountCreated,
      inTrial,
      onboardingComplete,
      paying,
      conversionRates: {
        checkupToAccount: convRate(accountCreated, checkupStarted),
        accountToTrial: convRate(inTrial, accountCreated || 1),
        trialToOnboarded: convRate(onboardingComplete, inTrial || 1),
        overallToPaying: convRate(paying, totalSignups),
      },
      // Recent signups (last 7 days)
      recentSignups: allOrgs
        .filter((o: any) => {
          const age = Date.now() - new Date(o.created_at).getTime();
          return age < 7 * 86_400_000;
        })
        .map((o: any) => ({ id: o.id, name: o.name, createdAt: o.created_at })),
    };

    // ---- Health (paying only) ----
    const payingHealth = { green: 0, amber: 0, red: 0 };
    for (const c of payingClients) {
      if (c.health === "red") payingHealth.red++;
      else if (c.health === "amber") payingHealth.amber++;
      else payingHealth.green++;
    }

    // ---- Burn multiple ----
    // burn_multiple = net_burn / net_new_ARR (Sacks framework)
    // At this stage, simplify: burn / MRR
    const burnMultiple = mrr.total > 0
      ? parseFloat((mrr.burn / mrr.total).toFixed(1))
      : null;

    // ---- ARPU ----
    const arpu = paying > 0 ? Math.round(mrr.total / paying) : 0;

    res.json({
      mrr: {
        total: mrr.total,
        byOrg: mrr.byOrg,
        burn: mrr.burn,
        delta: mrr.delta,
        isProfitable: mrr.isProfitable,
        payingCount: mrr.payingCount,
        burnMultiple,
        arpu,
      },
      clients: payingClients,
      pipeline,
      health: payingHealth,
    });
  } catch (err: any) {
    console.error("[AdminMetrics] Error:", err.message);
    res.status(500).json({ error: "Failed to compute metrics" });
  }
});

export default router;
