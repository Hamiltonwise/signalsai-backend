/**
 * VisionaryView -- Corey's HQ.
 *
 * Musk Step 3 (simplify): ONE number at the top (MRR).
 * Bezos principle: show only the decisions waiting for the CEO.
 *
 * Five zones:
 * 1. The Numbers (MRR, clients, pipeline, runway)
 * 2. Flywheel Metrics (checkups, invites, conversions -- is the product spreading itself?)
 * 3. Needs Your Decision (RED clients + pending approvals)
 * 4. Foundation Pulse (Champions, Heroes seats funded, Foundation status)
 * 5. This Week's Signal (the one sentence that matters most)
 */

import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Heart,
  Zap,
  Target,
} from "lucide-react";
import { adminListOrganizations, type AdminOrganization } from "@/api/admin-organizations";
import { apiGet } from "@/api/index";

interface ClientHealth {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  risk?: string;
}

export default function VisionaryView() {
  const { data } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const { data: healthData } = useQuery({
    queryKey: ["admin-client-health"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success ? (res.clients as ClientHealth[]) : [];
    },
    staleTime: 60_000,
  });

  // Corey's personal task queue -- Chief of Staff view
  const { data: tasksData } = useQuery({
    queryKey: ["corey-tasks"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/dream-team/tasks?owner=Corey" });
      return res?.success ? (res.tasks as Array<{ id: number; title: string; status: string; priority: string; due_date?: string; source?: string }>) : [];
    },
    staleTime: 60_000,
  });

  const { data: signalData } = useQuery({
    queryKey: ["admin-signal"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/signal" });
      return res?.success ? res : null;
    },
    staleTime: 5 * 60_000,
  });

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  const activeOrgs = orgs.filter((o) => o.subscription_status === "active" || o.subscription_tier);
  const trialOrgs = orgs.filter((o) => !o.subscription_status || o.subscription_status === "trialing");
  const mrr = activeOrgs.length * 2000;
  const arr = mrr * 12;
  const burn = 9500;
  const isProfitable = mrr > burn;

  const redClients = (healthData || []).filter((c) => c.health === "red");
  const amberClients = (healthData || []).filter((c) => c.health === "amber");
  const greenClients = (healthData || []).filter((c) => c.health === "green");
  const championCount = orgs.filter((o: any) => o.is_champion).length;

  // Flywheel: checkup invites (would need a dedicated endpoint, show what we can)
  const totalClients = orgs.length;
  const conversionRate = totalClients > 0 ? Math.round((activeOrgs.length / totalClients) * 100) : 0;

  const signal = signalData?.signal || signalData?.sentence || null;

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Zone 1: The Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumberCard
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
          value={`$${mrr.toLocaleString()}`}
          label="MRR"
          sub={`$${arr.toLocaleString()} ARR`}
        />
        <NumberCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          value={String(activeOrgs.length)}
          label="Paying"
          sub={`${trialOrgs.length} in pipeline`}
        />
        <NumberCard
          icon={<TrendingUp className="h-4 w-4 text-[#D56753]" />}
          value={`${conversionRate}%`}
          label="Conversion"
          sub={`${totalClients} total accounts`}
        />
        <NumberCard
          icon={<Target className="h-4 w-4 text-purple-500" />}
          value={isProfitable ? "Yes" : "No"}
          label="Profitable"
          sub={isProfitable ? `+$${(mrr - burn).toLocaleString()}/mo` : `$${burn.toLocaleString()} burn`}
          valueColor={isProfitable ? "text-emerald-600" : "text-amber-500"}
        />
      </div>

      {/* Zone 2: This Week's Signal */}
      {signal && (
        <div className="bg-[#212D40] rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Zap className="h-4 w-4 text-[#D56753] mt-0.5 shrink-0" />
            <p className="text-sm text-white leading-relaxed">{signal}</p>
          </div>
        </div>
      )}

      {/* Zone 2.5: What Needs You -- Chief of Staff task queue */}
      {(() => {
        const openTasks = (tasksData || []).filter((t) => t.status !== "done" && t.status !== "completed");
        if (openTasks.length === 0) return null;
        return (
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">What Needs You</p>
              <span className="text-xs font-bold text-[#D56753] bg-[#D56753]/10 px-2 py-0.5 rounded-full">{openTasks.length}</span>
            </div>
            <div className="space-y-2">
              {openTasks.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-start gap-2 py-1 border-b border-gray-100 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    t.priority === "urgent" ? "bg-red-500" : t.priority === "high" ? "bg-amber-500" : "bg-gray-300"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#212D40] font-medium truncate">{t.title}</p>
                    {t.source && <p className="text-xs text-gray-400">{t.source}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Zone 3: Client Health at a Glance */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Client Health</p>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold text-[#212D40]">{greenClients.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-sm font-semibold text-[#212D40]">{amberClients.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-sm font-semibold text-[#212D40]">{redClients.length}</span>
          </div>
        </div>

        {/* RED clients -- needs Corey's decision */}
        {redClients.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Needs your decision</p>
            </div>
            {redClients.map((c) => (
              <div key={c.id} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-[#212D40]">{c.name}</p>
                <p className="text-xs text-red-600 mt-0.5">{c.risk || "Engagement dropped. Call or defer?"}</p>
              </div>
            ))}
          </div>
        )}

        {/* AMBER clients -- awareness only */}
        {amberClients.length > 0 && redClients.length === 0 && (
          <p className="text-sm text-amber-600">
            {amberClients.length} client{amberClients.length !== 1 ? "s" : ""} need{amberClients.length === 1 ? "s" : ""} a check. None critical.
          </p>
        )}

        {redClients.length === 0 && amberClients.length === 0 && (
          <p className="text-sm text-emerald-600">All clients healthy. No decisions needed.</p>
        )}
      </div>

      {/* Zone 4: Foundation Pulse */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="h-4 w-4 text-[#D56753]" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Foundation</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-semibold text-[#212D40]">{championCount}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Champions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-[#212D40]">{championCount}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Heroes Funded</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-[#212D40]">2</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">RISE Scholars</p>
          </div>
        </div>
      </div>

      {/* Zone 5: Flywheel Status */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Flywheel</p>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center justify-between">
            <span>Checkup to signup</span>
            <span className="font-semibold text-[#212D40]">{conversionRate}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Monday email (system)</span>
            <span className="font-semibold text-[#212D40]">{activeOrgs.length > 0 ? "Active" : "Waiting for Mailgun"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Agent signal bus</span>
            <span className="font-semibold text-emerald-600">Live (42 agents)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Competitor invites</span>
            <span className="font-semibold text-[#212D40]">Wired</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Lob card pipeline</span>
            <span className="font-semibold text-amber-500">Queuing (needs LOB_API_KEY)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberCard({
  icon,
  value,
  label,
  sub,
  valueColor,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-semibold ${valueColor || "text-[#212D40]"}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
