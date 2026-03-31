/**
 * Revenue Dashboard -- HQ revenue metrics panel.
 *
 * Four metric cards (MRR, trial pipeline, churn risk, NRR proxy)
 * MRR trend chart (CSS-only, last 6 months)
 * Active subscription table sorted by health status
 */

import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import { apiGet } from "@/api/index";

// --- Types -------------------------------------------------------------------

interface ClientHealthEntry {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  risk?: string;
  last_login?: string;
  tier?: string;
}

const HEALTH_DOT: Record<string, string> = {
  red: "bg-red-500",
  amber: "bg-amber-400",
  green: "bg-emerald-500",
};

const TIER_PRICING: Record<string, number> = {
  DWY: 997,
  DFY: 2497,
};

function orgMonthlyRate(org: { subscription_tier?: string | null }): number {
  return TIER_PRICING[org.subscription_tier || "DWY"] ?? 997;
}

function monthsActive(startDate: string | null): number {
  if (!startDate) return 0;
  const diff = Date.now() - new Date(startDate).getTime();
  return Math.max(1, Math.floor(diff / (30 * 86_400_000)));
}

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// --- MRR Trend Bar Chart (CSS-only, no deps) ---------------------------------

function MRRTrendChart({ orgs }: { orgs: AdminOrganization[] }) {
  // Group active orgs by subscription_started_at month, build last 6 months
  const now = new Date();
  const months: { label: string; mrr: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("en-US", { month: "short" });

    // Count orgs that were active by this month
    const activeByMonth = orgs.filter((o) => {
      if (o.subscription_status !== "active" && !o.subscription_tier) return false;
      const started = o.created_at ? new Date(o.created_at) : null;
      return started && started <= new Date(d.getFullYear(), d.getMonth() + 1, 0);
    });

    months.push({ label, mrr: activeByMonth.reduce((s, o) => s + orgMonthlyRate(o), 0) });
  }

  const maxMRR = Math.max(...months.map((m) => m.mrr), 1);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">MRR Trend (6 months)</p>
      <div className="flex items-end gap-3 h-32">
        {months.map((m, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-[#212D40] tabular-nums">
              {m.mrr > 0 ? `$${(m.mrr / 1000).toFixed(0)}K` : "--"}
            </span>
            <div
              className="w-full rounded-t-lg bg-[#D56753] transition-all duration-700"
              style={{ height: `${maxMRR > 0 ? (m.mrr / maxMRR) * 100 : 0}%`, minHeight: m.mrr > 0 ? 4 : 0 }}
            />
            <span className="text-[10px] text-gray-400">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main Component ----------------------------------------------------------

export default function RevenueDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const { data: healthData } = useQuery({
    queryKey: ["admin-client-health-revenue"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success ? (res.clients as ClientHealthEntry[]) : [];
    },
    staleTime: 60_000,
    retry: false,
  });

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  const healthMap = new Map<number, ClientHealthEntry>();
  (healthData || []).forEach((c) => healthMap.set(c.id, c));

  const activeOrgs = orgs.filter((o) => o.subscription_status === "active" || o.subscription_tier);
  const trialOrgs = orgs.filter((o) => o.subscription_status === "trialing" || o.subscription_status === "trial");
  const criticalOrgs = (healthData || []).filter((c) => c.health === "red");

  const mrr = activeOrgs.reduce((s, o) => s + orgMonthlyRate(o), 0);

  // NRR proxy: compare current active count to 30-days-ago active count
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const activeLastMonth = orgs.filter((o) => {
    if (o.subscription_status !== "active" && !o.subscription_tier) return false;
    return new Date(o.created_at) <= thirtyDaysAgo;
  });
  const lastMonthMRR = activeLastMonth.reduce((s, o) => s + orgMonthlyRate(o), 0);
  const nrr = lastMonthMRR > 0 ? Math.round((mrr / lastMonthMRR) * 100) : 100;

  // Subscription table: active orgs sorted by health (critical first)
  const tableOrgs = [...activeOrgs].sort((a, b) => {
    const ha = healthMap.get(a.id)?.health || "green";
    const hb = healthMap.get(b.id)?.health || "green";
    const order = { red: 0, amber: 1, green: 2 };
    return (order[ha] ?? 2) - (order[hb] ?? 2);
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-bold text-[#212D40]">Revenue</h1>

      {/* Four metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
          <DollarSign className="h-5 w-5 text-emerald-500 mx-auto mb-2" />
          <p className="text-2xl font-black text-[#212D40]">${mrr.toLocaleString()}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">MRR</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{activeOrgs.length} active</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
          <Users className="h-5 w-5 text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-black text-[#212D40]">{trialOrgs.length}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Trial Pipeline</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Est. ${trialOrgs.reduce((s, o) => s + orgMonthlyRate(o), 0).toLocaleString()}/mo if converted
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
          <AlertTriangle className="h-5 w-5 text-red-500 mx-auto mb-2" />
          <p className={`text-2xl font-black ${criticalOrgs.length > 0 ? "text-red-600" : "text-[#212D40]"}`}>
            {criticalOrgs.length}
          </p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Churn Risk</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            ${criticalOrgs.reduce((s: number, c) => s + (TIER_PRICING[c.tier || "DWY"] ?? 997), 0).toLocaleString()} at risk
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
          {nrr >= 100 ? (
            <TrendingUp className="h-5 w-5 text-emerald-500 mx-auto mb-2" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-500 mx-auto mb-2" />
          )}
          <p className={`text-2xl font-black ${nrr >= 100 ? "text-emerald-600" : "text-red-600"}`}>
            {nrr}%
          </p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">NRR Proxy</p>
          <p className="text-[10px] text-gray-400 mt-0.5">vs. 30 days ago</p>
        </div>
      </div>

      {/* MRR trend chart */}
      <MRRTrendChart orgs={orgs} />

      {/* Subscription table */}
      {tableOrgs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Practice</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Monthly</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Months</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Health</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {tableOrgs.map((org) => {
                const h = healthMap.get(org.id);
                const healthColor = HEALTH_DOT[h?.health || "green"] || HEALTH_DOT.green;
                return (
                  <tr key={org.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-[#212D40] truncate">{org.name}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#212D40] tabular-nums">${orgMonthlyRate(org).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 tabular-nums">{monthsActive(org.created_at)}</td>
                    <td className="px-5 py-3">
                      <span className={`w-3 h-3 rounded-full inline-block ${healthColor}`} />
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(h?.last_login)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// T2 registers GET /api/admin/revenue-summary
// T1 adds "revenue" route to Admin.tsx
