/**
 * DentalEMR Weekly Partner Report -- WO-DENTALEMR-REPORT
 *
 * Schedule: Monday 8:00 AM PT (after Monday email sends at 7am).
 * Sends Merideth a transparent report of what her referrals produce.
 *
 * // Requires ALLORO_N8N_WEBHOOK_URL and partner report n8n template
 */

import axios from "axios";
import { db } from "../database/connection";

const N8N_WEBHOOK = process.env.ALLORO_N8N_WEBHOOK_URL || "";

interface ReferredPractice {
  name: string;
  city: string;
  months_active: number;
  mrr: number;
}

interface PartnerReport {
  partner_name: string;
  partner_email: string;
  referrals_this_month: number;
  referrals_all_time: number;
  mrr_attributed: number;
  active_accounts: number;
  trial_accounts: number;
  conversion_rate: number;
  top_referred_practices: ReferredPractice[];
}

/**
 * Build the weekly report for Merideth (DentalEMR partner).
 */
export async function buildDentalEMRReport(): Promise<PartnerReport | null> {
  // Find Merideth's org
  const meridethUser = await db("users")
    .where({ email: "merideth@dentalemr.com" })
    .first();

  if (!meridethUser) {
    console.log("[DentalEMR] Merideth's account not found, skipping report");
    return null;
  }

  // Get all orgs referred from DentalEMR channel
  const referredOrgs = await db("organizations")
    .where({ source_channel: "dentalemr" })
    .select(
      "id",
      "name",
      "operational_jurisdiction",
      "subscription_status",
      "subscription_tier",
      "subscription_started_at",
      "created_at",
    );

  if (referredOrgs.length === 0) {
    // Also check referred_by_org_id as fallback
    const meridethOrg = await db("organization_users")
      .where({ user_id: meridethUser.id })
      .first();

    if (meridethOrg) {
      const referredByMerideth = await db("organizations")
        .where({ referred_by_org_id: meridethOrg.organization_id })
        .select(
          "id",
          "name",
          "operational_jurisdiction",
          "subscription_status",
          "subscription_tier",
          "subscription_started_at",
          "created_at",
        );

      if (referredByMerideth.length > 0) {
        return buildReportFromOrgs(referredByMerideth, "Merideth", "merideth@dentalemr.com");
      }
    }

    console.log("[DentalEMR] No referred orgs found");
    return null;
  }

  return buildReportFromOrgs(referredOrgs, "Merideth", "merideth@dentalemr.com");
}

function buildReportFromOrgs(
  orgs: any[],
  partnerName: string,
  partnerEmail: string,
): PartnerReport {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Counts
  const activeOrgs = orgs.filter((o) => o.subscription_status === "active");
  const trialOrgs = orgs.filter((o) => o.subscription_status === "trial");
  const thisMonthSignups = orgs.filter(
    (o) => new Date(o.created_at) >= thisMonthStart,
  );

  // MRR: $2,000/location per active subscription
  // Simplified: count active orgs * $2,000
  const mrrAttributed = activeOrgs.length * 2000;

  // Conversion rate
  const conversionRate = orgs.length > 0
    ? Math.round((activeOrgs.length / orgs.length) * 10000) / 100
    : 0;

  // Top 3 practices by MRR (active first, then by months active)
  const topPractices: ReferredPractice[] = activeOrgs
    .map((o) => {
      const monthsActive = o.subscription_started_at
        ? Math.max(1, Math.floor((now.getTime() - new Date(o.subscription_started_at).getTime()) / (30 * 24 * 60 * 60 * 1000)))
        : 0;

      // Extract city from operational_jurisdiction
      const city = o.operational_jurisdiction
        ? o.operational_jurisdiction.split(",")[0].trim()
        : "";

      return {
        name: o.name,
        city,
        months_active: monthsActive,
        mrr: 2000,
      };
    })
    .sort((a, b) => b.months_active - a.months_active)
    .slice(0, 3);

  return {
    partner_name: partnerName,
    partner_email: partnerEmail,
    referrals_this_month: thisMonthSignups.length,
    referrals_all_time: orgs.length,
    mrr_attributed: mrrAttributed,
    active_accounts: activeOrgs.length,
    trial_accounts: trialOrgs.length,
    conversion_rate: conversionRate,
    top_referred_practices: topPractices,
  };
}

/**
 * Send the DentalEMR partner report via n8n webhook.
 * Called by BullMQ cron Monday 8am PT.
 */
export async function sendDentalEMRReport(): Promise<boolean> {
  const report = await buildDentalEMRReport();
  if (!report) return false;

  if (!N8N_WEBHOOK) {
    console.log("[DentalEMR] N8N_WEBHOOK not set -- report logged only:", JSON.stringify(report).slice(0, 300));
    return false;
  }

  try {
    await axios.post(N8N_WEBHOOK, {
      email_type: "partner_report",
      ...report,
    }, { timeout: 30000 });

    console.log(`[DentalEMR] Weekly report sent to ${report.partner_email}: ${report.active_accounts} active, $${report.mrr_attributed} MRR`);
    return true;
  } catch (err: any) {
    console.error("[DentalEMR] Report send failed:", err.message);
    return false;
  }
}
