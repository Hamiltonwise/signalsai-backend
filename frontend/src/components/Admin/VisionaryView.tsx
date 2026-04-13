/**
 * VisionaryView -- Corey's HQ.
 *
 * WO-60: Flywheel Dashboard.
 *
 * Bezos principle: show only the decisions waiting for the CEO.
 * Musk principle: reduce human dependency at every step.
 * 90-second rule: open, see everything, make one decision, close.
 *
 * Six zones:
 * 1. The Numbers (real Stripe MRR, clients, pipeline, profitability)
 * 2. Flywheel Velocity (checkups -> trials -> TTFV -> paid -> referrals)
 * 3. This Week's Signal (one sentence from the intelligence system)
 * 4. One Decision Card (the single most important thing to decide)
 * 5. Conversion Funnel (checkup-to-paid pipeline with rates)
 * 6. Foundation Pulse (Champions, Heroes, RISE)
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
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { adminListOrganizations, type AdminOrganization } from "@/api/admin-organizations";
import { apiGet } from "@/api/index";

interface ClientHealth {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  risk?: string;
}

interface MrrData {
  success: boolean;
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  source: string;
}

interface FunnelData {
  success: boolean;
  funnel: {
    scans_started: number;
    scans_completed: number;
    gates_viewed: number;
    emails_captured: number;
    accounts_created: number;
    first_logins: number;
    ttfv_yes: number;
    subscriptions: number;
  };
  conversion_rates: {
    scan_to_gate: string;
    gate_to_capture: string;
    capture_to_ttfv: string;
    ttfv_to_subscribe: string;
    end_to_end: string;
  };
  viral: {
    shares: number;
    competitor_invites: number;
    referral_signups: number;
  };
}

export default function VisionaryView() {
  const { data } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const { data: mrrData } = useQuery<MrrData>({
    queryKey: ["admin-mrr"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/revenue/mrr" });
      return res?.success ? res as MrrData : { success: false, mrr: 0, arr: 0, activeSubscriptions: 0, trialingSubscriptions: 0, source: "error" };
    },
    staleTime: 5 * 60_000,
  });

  const { data: funnelData } = useQuery<FunnelData | null>({
    queryKey: ["admin-checkup-funnel", 7],
    queryFn: async (): Promise<FunnelData | null> => {
      const res = await apiGet({ path: "/admin/checkup-funnel?days=7" });
      return res?.success ? res as FunnelData : null;
    },
    staleTime: 5 * 60_000,
  });

  const { data: healthData } = useQuery({
    queryKey: ["admin-client-health"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success ? (res.clients as ClientHealth[]) : [];
    },
    staleTime: 60_000,
  });

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

  // Real MRR from Stripe, with fallback to estimate
  const mrr = mrrData?.mrr ?? activeOrgs.length * 2000;
  const arr = mrrData?.arr ?? mrr * 12;
  const mrrSource = mrrData?.source || "estimate";
  const burn = 9500;
  const isProfitable = mrr > burn;

  const redClients = (healthData || []).filter((c) => c.health === "red");
  const amberClients = (healthData || []).filter((c) => c.health === "amber");
  const greenClients = (healthData || []).filter((c) => c.health === "green");
  const championCount = orgs.filter((o: any) => o.is_champion).length;

  const signal = signalData?.signal || signalData?.sentence || null;

  const funnel = funnelData?.funnel;
  const rates = funnelData?.conversion_rates;
  const viral = funnelData?.viral;

  // Build the ONE decision card from system state
  const oneDecision = buildOneDecision(redClients, trialOrgs, tasksData || [], funnel);

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Zone 1: The Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumberCard
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
          value={`$${mrr.toLocaleString()}`}
          label="MRR"
          sub={mrrSource === "stripe" ? `$${arr.toLocaleString()} ARR` : `$${arr.toLocaleString()} ARR (est.)`}
        />
        <NumberCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          value={String(mrrData?.activeSubscriptions ?? activeOrgs.length)}
          label="Paying"
          sub={`${mrrData?.trialingSubscriptions ?? trialOrgs.length} trialing`}
        />
        <NumberCard
          icon={<TrendingUp className="h-4 w-4 text-[#D56753]" />}
          value={rates?.end_to_end || "---"}
          label="End-to-End"
          sub="Scan to paid (7d)"
        />
        <NumberCard
          icon={<Target className="h-4 w-4 text-purple-500" />}
          value={isProfitable ? "Yes" : "No"}
          label="Profitable"
          sub={isProfitable ? `+$${(mrr - burn).toLocaleString()}/mo` : `$${burn.toLocaleString()} burn`}
          valueColor={isProfitable ? "text-emerald-600" : "text-amber-500"}
        />
      </div>

      {/* Zone 2: Flywheel Velocity (this week) */}
      {funnel && (
        <div className="bg-stone-50/80 border border-stone-200/60 rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Flywheel this week</p>
          <div className="flex items-center justify-between gap-1 overflow-x-auto">
            <FlywheelNode value={funnel.scans_started} label="Scans" />
            <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
            <FlywheelNode value={funnel.emails_captured} label="Captured" />
            <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
            <FlywheelNode value={funnel.accounts_created} label="Accounts" />
            <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
            <FlywheelNode value={funnel.ttfv_yes} label="TTFV" />
            <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
            <FlywheelNode value={funnel.subscriptions} label="Paid" />
            <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
            <FlywheelNode value={viral?.shares || 0} label="Shares" />
          </div>
          {viral && viral.referral_signups > 0 && (
            <p className="text-xs text-emerald-600 mt-3">{viral.referral_signups} referral-driven signup{viral.referral_signups !== 1 ? "s" : ""} this week</p>
          )}
        </div>
      )}

      {/* Zone 3: This Week's Signal */}
      {signal && (
        <div className="bg-[#212D40] rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Zap className="h-4 w-4 text-[#D56753] mt-0.5 shrink-0" />
            <p className="text-sm text-white leading-relaxed">{signal}</p>
          </div>
        </div>
      )}

      {/* Zone 4: One Decision Card */}
      {oneDecision && (
        <div className={`rounded-2xl p-5 ${
          oneDecision.urgency === "red"
            ? "bg-red-50 border border-red-200"
            : oneDecision.urgency === "amber"
            ? "bg-amber-50 border border-amber-200"
            : "bg-stone-50/80 border border-stone-200/60"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className={`h-3.5 w-3.5 ${
              oneDecision.urgency === "red" ? "text-red-500" : oneDecision.urgency === "amber" ? "text-amber-500" : "text-gray-400"
            }`} />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Needs your decision</p>
          </div>
          <p className="text-sm font-semibold text-[#1A1D23]">{oneDecision.title}</p>
          <p className="text-xs text-gray-500 mt-1">{oneDecision.detail}</p>
        </div>
      )}

      {/* Zone 5: Conversion Funnel */}
      {rates && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Conversion funnel (7d)</p>
          <div className="space-y-2">
            <FunnelRow label="Scan to gate" rate={rates.scan_to_gate} />
            <FunnelRow label="Gate to email" rate={rates.gate_to_capture} />
            <FunnelRow label="Email to TTFV" rate={rates.capture_to_ttfv} />
            <FunnelRow label="TTFV to paid" rate={rates.ttfv_to_subscribe} />
          </div>
        </div>
      )}

      {/* Zone 6: Client Health */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Client Health</p>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold text-[#1A1D23]">{greenClients.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-sm font-semibold text-[#1A1D23]">{amberClients.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-sm font-semibold text-[#1A1D23]">{redClients.length}</span>
          </div>
        </div>

        {redClients.length > 0 && (
          <div className="space-y-2">
            {redClients.map((c) => (
              <div key={c.id} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-[#1A1D23]">{c.name}</p>
                <p className="text-xs text-red-600 mt-0.5">{c.risk || "Engagement dropped"}</p>
              </div>
            ))}
          </div>
        )}

        {redClients.length === 0 && amberClients.length === 0 && (
          <p className="text-sm text-emerald-600">All clients healthy.</p>
        )}
      </div>

      {/* Zone 7: Foundation Pulse */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="h-4 w-4 text-[#D56753]" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Foundation</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-semibold text-[#1A1D23]">{championCount}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Champions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-[#1A1D23]">{championCount}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Heroes Funded</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-[#1A1D23]">2</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">RISE Scholars</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── One Decision Card Logic ─────────────────────────────────────
// Surfaces the single most important decision from system state.
// Priority: red clients > expiring trials > urgent tasks > nothing.

function buildOneDecision(
  redClients: ClientHealth[],
  trialOrgs: AdminOrganization[],
  tasks: Array<{ id: number; title: string; status: string; priority: string; due_date?: string }>,
  funnel?: FunnelData["funnel"] | null,
): { title: string; detail: string; urgency: "red" | "amber" | "green" } | null {
  // 1. Red client needs intervention
  if (redClients.length > 0) {
    const c = redClients[0];
    return {
      title: `${c.name} needs attention`,
      detail: c.risk || "Engagement dropped. Call or defer?",
      urgency: "red",
    };
  }

  // 2. Trials about to expire
  const expiringTrials = trialOrgs.filter((o: any) => {
    if (!o.trial_end) return false;
    const daysLeft = Math.ceil((new Date(o.trial_end).getTime() - Date.now()) / 86_400_000);
    return daysLeft >= 0 && daysLeft <= 2;
  });
  if (expiringTrials.length > 0) {
    return {
      title: `${expiringTrials.length} trial${expiringTrials.length > 1 ? "s" : ""} expire${expiringTrials.length === 1 ? "s" : ""} in 48 hours`,
      detail: "Review their engagement and decide: extend, convert, or let expire?",
      urgency: "amber",
    };
  }

  // 3. Urgent task from dream team
  const urgentTasks = tasks.filter((t) => t.priority === "urgent" && t.status !== "done" && t.status !== "completed");
  if (urgentTasks.length > 0) {
    return {
      title: urgentTasks[0].title,
      detail: `Urgent task. ${urgentTasks.length > 1 ? `${urgentTasks.length - 1} more waiting.` : ""}`,
      urgency: "amber",
    };
  }

  // 4. Flywheel stall (no scans this week)
  if (funnel && funnel.scans_started === 0) {
    return {
      title: "Zero checkup scans this week",
      detail: "The top of the flywheel is stalled. Distribution problem.",
      urgency: "amber",
    };
  }

  return null; // No decisions needed. Clean week.
}

// ─── Sub-components ──────────────────────────────────────────────

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
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-semibold ${valueColor || "text-[#1A1D23]"}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function FlywheelNode({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center min-w-[48px]">
      <p className="text-lg font-semibold text-[#1A1D23]">{value}</p>
      <p className="text-xs text-gray-400 uppercase tracking-wider leading-tight">{label}</p>
    </div>
  );
}

function FunnelRow({ label, rate }: { label: string; rate: string }) {
  const pct = parseInt(rate) || 0;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm text-gray-600">{label}</span>
        <ChevronRight className="h-3 w-3 text-gray-300" />
      </div>
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${pct >= 50 ? "bg-emerald-500" : pct >= 20 ? "bg-amber-400" : "bg-red-400"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-[#1A1D23] w-10 text-right">{rate}</span>
      </div>
    </div>
  );
}
