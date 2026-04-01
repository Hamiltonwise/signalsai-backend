/**
 * Visionary View -- Corey's CEO War Room
 *
 * Studio McGee makeover. One thing at the top. Everything else in its place.
 * Precision, leverage, speed.
 *
 * Layout (top to bottom):
 * 1. Personal Agent Headline (the ONE thing, warm terracotta card)
 * 2. Morning Briefing Stats (only non-zero values, hidden when all zero)
 * 3. Revenue Panel (MRR, burn, profitability)
 * 4. Decisions Needing You (Red blast radius only)
 * 5. Route to Unicorn (collapsed, current phase + next milestone only)
 * 6. The Scoreboard (Records to Beat + Confidence, collapsible)
 * 7. Pipeline Funnel
 * 8. Portfolio Score
 * 9. Agent Health (footer-level indicator)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TailorText } from "@/components/TailorText";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  Activity,
  Shield,
  Trophy,
  Map,
  Navigation,
  CheckCircle2,
  Circle,
  Target,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import FounderMode from "./FounderMode";
import { KillSwitchBanner } from "@/components/Admin/KillSwitchBanner";
import {} from "react-router-dom";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
// Schedule type no longer needed -- Mission Control fetches its own data
import {
  fetchDreamTeamTasks,
  type DreamTeamTask,
} from "@/api/dream-team";
import { apiGet, apiPatch } from "@/api/index";

// ---- Helpers ---------------------------------------------------------------

// Real customer pricing (per-org, not per-tier, until billing is standardized)
const ORG_MONTHLY_RATE: Record<number, number> = {
  5: 2000,   // Garrison Orthodontics
  6: 3500,   // DentalEMR
  8: 1500,   // Artful Orthodontics
  21: 0,     // McPherson Endodontics (beta)
  25: 5000,  // Caswell Orthodontics (3 locations)
  34: 0,     // Alloro (team org)
  39: 1500,  // One Endodontics
  42: 0,     // Valley Endodontics (demo)
};
// Fallback removed: ORG_MONTHLY_RATE is the single source of truth for pricing

const MONTHLY_BURN = 9500;

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

// ---- Interfaces ------------------------------------------------------------

interface ClientHealthEntry {
  id: number;
  name: string;
  health: "green" | "amber" | "red";
  score?: number;
  risk?: string;
  last_login?: string;
}

interface MorningBriefing {
  id?: number;
  topEvent?: string;
  headline?: string;
  summary?: string;
  signups?: number;
  competitor_moves?: number;
  reviews_received?: number;
  generated_at?: string;
}

interface BriefSection {
  title: string;
  items: string[];
}

interface PersonalAgentBrief {
  role: string;
  generatedAt: string;
  headline: string;
  sections: BriefSection[];
  signoff: string;
  urgentCount: number;
}

// ---- Panel Components ------------------------------------------------------

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card-supporting ${className}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  label,
  iconColor = "text-[#D56753]/50",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#D56753]/40">
        {label}
      </p>
    </div>
  );
}

/** Collapsible wrapper */
function CollapsibleSection({
  title,
  icon: Icon,
  iconColor = "text-gray-400",
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 w-full text-left mb-2 group"
      >
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#D56753]/40 flex-1">
          {title}
        </p>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        )}
      </button>
      {open && children}
    </div>
  );
}

// ---- Panel 0: Personal Agent Headline (THE one thing) ----------------------

function PersonalAgentHeadline({ brief }: { brief: PersonalAgentBrief | null | undefined; }) {
  const hasHeadline = brief?.headline;

  return (
    <div className="rounded-2xl border-2 border-[#D56753]/20 bg-gradient-to-br from-[#FFF9F7] via-white to-[#FFF5F2] p-8 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <Zap className="h-4 w-4 text-[#D56753]" />
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#D56753]/60">
          Right Now
        </p>
      </div>

      {hasHeadline ? (
        <p className="text-2xl sm:text-3xl font-semibold text-[#212D40] leading-snug">
          {brief.headline}
        </p>
      ) : (
        <TailorText
          editKey="hq.visionary.agent.placeholder"
          defaultText="All quiet. Your agents are running. No decisions need you."
          as="p"
          className="text-2xl sm:text-3xl font-semibold text-gray-400 leading-snug"
        />
      )}

      {brief?.signoff && (
        <p className="text-xs text-gray-400 mt-4">{brief.signoff}</p>
      )}
    </div>
  );
}

// ---- Panel 1: Morning Briefing Stats (only non-zero) -----------------------

function MorningBriefingStats({
  healthData,
}: {
  healthData: ClientHealthEntry[];
}) {
  const { data: briefingRaw } = useQuery({
    queryKey: ["morning-briefing-latest"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/morning-briefing/latest" });
      return res?.success !== false ? res : null;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const briefing: MorningBriefing | null = briefingRaw ?? null;

  const greenCount = healthData.filter((c) => c.health === "green").length;
  const amberCount = healthData.filter((c) => c.health === "amber").length;
  const redCount = healthData.filter((c) => c.health === "red").length;

  // Build stat cards, only include non-zero values
  const stats: { key: string; value: string | React.ReactNode; label: string; editKey: string }[] = [];

  if (briefing?.signups && briefing.signups > 0) {
    stats.push({
      key: "signups",
      value: String(briefing.signups),
      label: "New Signups",
      editKey: "hq.visionary.briefing.newSignups",
    });
  }
  if (briefing?.competitor_moves && briefing.competitor_moves > 0) {
    stats.push({
      key: "competitor_moves",
      value: String(briefing.competitor_moves),
      label: "Competitor Moves",
      editKey: "hq.visionary.briefing.competitorMoves",
    });
  }
  if (briefing?.reviews_received && briefing.reviews_received > 0) {
    stats.push({
      key: "reviews",
      value: String(briefing.reviews_received),
      label: "Reviews",
      editKey: "hq.visionary.briefing.reviews",
    });
  }
  if (greenCount + amberCount + redCount > 0) {
    stats.push({
      key: "health",
      value: "health",
      label: "Client Health",
      editKey: "hq.visionary.briefing.clientHealth",
    });
  }

  // If everything is zero, don't show the stat bar at all
  if (stats.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.key} className="rounded-xl bg-white border border-[#D56753]/6 p-4 text-center shadow-sm">
          {stat.value === "health" ? (
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-bold text-[#212D40]">{greenCount}</span>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-sm font-bold text-[#212D40]">{amberCount}</span>
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm font-bold text-[#212D40]">{redCount}</span>
            </div>
          ) : (
            <p className="text-2xl font-black text-[#212D40]">{stat.value}</p>
          )}
          <TailorText editKey={stat.editKey} defaultText={stat.label} as="p" className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1" />
        </div>
      ))}
    </div>
  );
}

// ---- Panel 2: Revenue ------------------------------------------------------

function RevenuePanel({ orgs }: { orgs: AdminOrganization[] }) {
  const activeOrgs = orgs.filter(
    (o) => o.subscription_status === "active" || o.subscription_tier
  );

  const mrr = activeOrgs.reduce((sum, o) => {
    return sum + (ORG_MONTHLY_RATE[o.id] ?? 0);
  }, 0);

  const now = new Date();
  const thisMonth = now.getMonth();
  const lastMonthOrgs = activeOrgs.filter((o) => {
    const d = new Date(o.created_at);
    return d.getMonth() === (thisMonth === 0 ? 11 : thisMonth - 1);
  });
  const thisMonthOrgs = activeOrgs.filter((o) => {
    const d = new Date(o.created_at);
    return d.getMonth() === thisMonth;
  });
  const growth = thisMonthOrgs.length - lastMonthOrgs.length;

  const monthlyDelta = mrr - MONTHLY_BURN;
  const isProfitable = monthlyDelta >= 0;
  const runwayMonths = !isProfitable && mrr > 0
    ? Math.floor(MONTHLY_BURN / Math.max(1, MONTHLY_BURN - mrr))
    : null;

  return (
    <Panel>
      <PanelHeader icon={DollarSign} label="Revenue" iconColor="text-emerald-600" />

      <div className="space-y-5">
        <div>
          <p className="text-4xl font-black text-[#212D40]">
            ${mrr.toLocaleString()}
          </p>
          <TailorText editKey="hq.visionary.revenue.mrrLabel" defaultText="Monthly Recurring Revenue" as="p" className="text-xs text-gray-400 mt-1" />
        </div>

        <div className="flex items-center gap-2">
          {growth >= 0 ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span
            className={`text-sm font-semibold ${
              growth >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {growth >= 0 ? "+" : ""}
            {growth} net new this month
          </span>
        </div>

        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <TailorText editKey="hq.visionary.revenue.runwayLabel" defaultText={`Runway ($${MONTHLY_BURN.toLocaleString()} burn)`} as="p" className="text-xs text-gray-400 mb-1" />
          {isProfitable ? (
            <p className="text-lg font-bold text-emerald-600">
              Profitable. +${monthlyDelta.toLocaleString()}/mo
            </p>
          ) : mrr === 0 ? (
            <TailorText editKey="hq.visionary.revenue.preRevenue" defaultText="Pre-revenue" as="p" className="text-lg font-bold text-gray-400" />
          ) : (
            <p className="text-lg font-bold text-amber-600">
              {runwayMonths} months runway at current burn
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ---- Panel 3: Decisions Needing You ----------------------------------------

interface RedDecisionTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  blast_radius?: string;
  owner_name: string;
  created_at: string;
}

function DecisionPanel({
  tasks,
  agentBrief,
}: {
  tasks: DreamTeamTask[];
  agentBrief: PersonalAgentBrief | null | undefined;
}) {
  const queryClient = useQueryClient();

  // Fetch red blast_radius tasks that are open
  const { data: redTasksRaw } = useQuery({
    queryKey: ["admin-tasks-red"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/tasks?blast_radius=red&status=open" });
      return res?.success !== false
        ? ((res?.tasks || []) as RedDecisionTask[])
        : [];
    },
    retry: false,
    staleTime: 30_000,
  });
  const redTasks = redTasksRaw ?? [];

  // Also show urgent/high tasks without blast_radius as fallback
  const urgentFallback = tasks.filter(
    (t) =>
      (t.priority === "urgent" || t.priority === "high") &&
      t.status === "open"
  );
  // Exclude any that are already in redTasks
  const redTaskIds = new Set(redTasks.map((t) => t.id));
  const extraUrgent = urgentFallback.filter((t) => !redTaskIds.has(t.id));

  // Pull urgent items from agent brief sections
  const urgentSection = agentBrief?.sections?.find(
    (s) => s.title.toLowerCase().includes("urgent") || s.title.toLowerCase().includes("decision")
  );
  const agentUrgentItems = urgentSection?.items ?? [];

  const hasItems = redTasks.length > 0 || extraUrgent.length > 0 || agentUrgentItems.length > 0;

  const approveMutation = useMutation({
    mutationFn: async ({ taskId, action }: { taskId: string; action: "approved" | "rejected" }) => {
      return apiPatch({
        path: `/admin/tasks/${taskId}`,
        passedData: { status: action },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks-red"] });
      queryClient.invalidateQueries({ queryKey: ["dream-team-tasks-visionary"] });
    },
  });

  return (
    <div
      className={`rounded-2xl border p-6 transition-all ${
        hasItems
          ? "border-red-300 bg-red-50/50 shadow-[0_4px_16px_rgba(239,68,68,0.06)]"
          : "card-supporting"
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle
          className={`h-4 w-4 ${hasItems ? "text-red-500" : "text-gray-400"}`}
        />
        <p
          className={`text-[11px] font-bold uppercase tracking-wider ${
            hasItems ? "text-red-500" : "text-gray-400"
          }`}
        >
          Decisions Needing You
          {hasItems && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {redTasks.length + extraUrgent.length + agentUrgentItems.length}
            </span>
          )}
        </p>
      </div>

      {!hasItems ? (
        <TailorText editKey="hq.visionary.decisions.empty" defaultText="No decisions pending. The system is running." as="p" className="text-sm text-gray-400" />
      ) : (
        <div className="space-y-2">
          {/* Red blast radius tasks with Approve/Deny */}
          {redTasks.map((t) => (
            <div
              key={t.id}
              className="rounded-xl bg-white border border-red-200 px-4 py-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#212D40] truncate">
                    {t.title}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t.owner_name} . {timeAgo(t.created_at)}
                  </p>
                </div>
                <span className="shrink-0 ml-3 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  red
                </span>
              </div>
              {t.description && (
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">{t.description}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => approveMutation.mutate({ taskId: t.id, action: "approved" })}
                  disabled={approveMutation.isPending}
                  className="flex-1 text-xs font-semibold py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => approveMutation.mutate({ taskId: t.id, action: "rejected" })}
                  disabled={approveMutation.isPending}
                  className="flex-1 text-xs font-semibold py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  Deny
                </button>
              </div>
            </div>
          ))}

          {/* Agent brief urgent items */}
          {agentUrgentItems.map((item, idx) => (
            <div
              key={`agent-${idx}`}
              className="flex items-center justify-between rounded-xl bg-white border border-red-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#212D40]">
                  {item}
                </p>
                <p className="text-xs text-gray-400">Personal Agent</p>
              </div>
              <span className="shrink-0 ml-3 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                red
              </span>
            </div>
          ))}

          {/* Other urgent tasks (not red blast radius) */}
          {extraUrgent.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-xl bg-white border border-red-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#212D40] truncate">
                  {t.title}
                </p>
                <p className="text-xs text-gray-400">
                  {t.owner_name} . {timeAgo(t.created_at)}
                </p>
              </div>
              <span
                className={`shrink-0 ml-3 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  t.priority === "urgent"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {t.priority}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Panel 4: Route to Unicorn (compact, collapsible) ----------------------

interface RoadmapPhaseEntry {
  id: number;
  name: string;
  label: string;
  description: string;
  mrrTarget: string;
  clientTarget: string;
  status: "complete" | "current" | "upcoming";
}

interface RoadmapMilestone {
  name: string;
  target: number;
  current: number;
  estimatedDate: string;
}

interface RoadmapState {
  currentMRR: number;
  currentClients: number;
  checkupsCompleted: number;
  trialConversionRate: number;
  referralRate: number;
  monthlyGrowthRate: number;
  currentPhase: string;
  phaseIndex: number;
  phaseDescription: string;
  nextMilestone: RoadmapMilestone;
  courseCorrection: string | null;
  etaToUnicorn: string;
  phases: RoadmapPhaseEntry[];
}

function RoadmapPanel() {
  const [timelineOpen, setTimelineOpen] = useState(false);

  const { data: roadmap, isLoading } = useQuery<RoadmapState>({
    queryKey: ["admin-roadmap"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/roadmap" });
      return res;
    },
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30 p-6 shadow-sm">
        <PanelHeader icon={Map} label="Route to Unicorn" iconColor="text-blue-600" />
        <div className="h-6 w-2/3 skeleton rounded" />
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <PanelHeader icon={Map} label="Route to Unicorn" iconColor="text-blue-600" />
        <TailorText editKey="hq.visionary.roadmap.unavailable" defaultText="Roadmap data unavailable. Check backend connection." as="p" className="text-sm text-gray-400" />
      </div>
    );
  }

  const milestoneProgress =
    roadmap.nextMilestone.target > 0
      ? Math.min(100, Math.round((roadmap.nextMilestone.current / roadmap.nextMilestone.target) * 100))
      : 0;

  const currentPhaseEntry = roadmap.phases.find((p) => p.status === "current");

  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30 p-6 shadow-sm">
      <PanelHeader icon={Map} label="Route to Unicorn" iconColor="text-blue-600" />

      {/* Current Position + Next Milestone: compact side-by-side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Current Phase */}
        <div className="rounded-xl bg-white border border-blue-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Navigation className="h-3.5 w-3.5 text-[#D56753]" />
            <TailorText editKey="hq.visionary.roadmap.currentPosition" defaultText="Current Position" as="p" className="text-[10px] font-bold uppercase tracking-wider text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-[#212D40]">
            {roadmap.currentPhase}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {currentPhaseEntry?.description || roadmap.phaseDescription}
          </p>
        </div>

        {/* Next Milestone */}
        <div className="rounded-xl bg-white border border-blue-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-3.5 w-3.5 text-blue-500" />
            <TailorText editKey="hq.visionary.roadmap.nextTurn" defaultText="Next Milestone" as="p" className="text-[10px] font-bold uppercase tracking-wider text-gray-400" />
          </div>
          <p className="text-sm font-medium text-[#212D40] mb-2">
            {roadmap.nextMilestone.name}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all duration-700"
                  style={{ width: `${Math.max(2, milestoneProgress)}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-bold text-[#212D40] shrink-0">
              {milestoneProgress}%
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            ETA: {roadmap.nextMilestone.estimatedDate}
          </p>
        </div>
      </div>

      {/* Course Correction (always visible if present) */}
      {roadmap.courseCorrection && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Course Correction</span>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            {roadmap.courseCorrection}
          </p>
        </div>
      )}

      {/* Collapsible Full Phase Timeline */}
      <button
        onClick={() => setTimelineOpen(!timelineOpen)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {timelineOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span className="text-[10px] font-bold uppercase tracking-wider">
          Full Route Timeline ({roadmap.phases.length} phases)
        </span>
      </button>

      {timelineOpen && (
        <div className="mt-3">
          {/* ETA to Unicorn */}
          <div className="mb-4 rounded-xl bg-gradient-to-r from-[#212D40] to-[#2d3d54] p-3">
            <TailorText editKey="hq.visionary.roadmap.etaToUnicorn" defaultText="ETA to Unicorn" as="p" className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1" />
            <p className="text-sm text-white leading-relaxed">
              {roadmap.etaToUnicorn}
            </p>
          </div>

          {/* Phase Timeline */}
          <div className="relative">
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200" />
            <div className="space-y-1">
              {roadmap.phases.map((phase) => (
                <div key={phase.id} className="flex items-start gap-3 relative">
                  <div className="shrink-0 mt-0.5 z-10">
                    {phase.status === "complete" ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    ) : phase.status === "current" ? (
                      <div className="h-6 w-6 rounded-full border-[3px] border-[#D56753] bg-white flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-[#D56753]" />
                      </div>
                    ) : (
                      <Circle className="h-6 w-6 text-gray-300" />
                    )}
                  </div>
                  <div
                    className={`flex-1 rounded-lg px-3 py-2 ${
                      phase.status === "current"
                        ? "bg-white border border-[#D56753]/30 shadow-sm"
                        : phase.status === "complete"
                          ? "bg-emerald-50/50"
                          : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-sm font-semibold ${
                          phase.status === "current"
                            ? "text-[#D56753]"
                            : phase.status === "complete"
                              ? "text-emerald-700"
                              : "text-gray-400"
                        }`}
                      >
                        {phase.name}: {phase.label}
                      </p>
                      <span className="text-[10px] text-gray-400">
                        {phase.mrrTarget} MRR / {phase.clientTarget} clients
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-0.5 ${
                        phase.status === "current" ? "text-gray-600" : "text-gray-400"
                      }`}
                    >
                      {phase.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
            <div className="rounded-xl bg-white border border-[#D56753]/6 p-3 text-center">
              <p className="text-lg font-black text-[#212D40]">
                ${roadmap.currentMRR.toLocaleString()}
              </p>
              <TailorText editKey="hq.visionary.roadmap.metrics.mrr" defaultText="MRR" as="p" className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5" />
            </div>
            <div className="rounded-xl bg-white border border-[#D56753]/6 p-3 text-center">
              <p className="text-lg font-black text-[#212D40]">
                {roadmap.currentClients}
              </p>
              <TailorText editKey="hq.visionary.roadmap.metrics.clients" defaultText="Clients" as="p" className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5" />
            </div>
            <div className="rounded-xl bg-white border border-[#D56753]/6 p-3 text-center">
              <p className="text-lg font-black text-[#212D40]">
                {roadmap.checkupsCompleted}
              </p>
              <TailorText editKey="hq.visionary.roadmap.metrics.checkups" defaultText="Checkups" as="p" className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5" />
            </div>
            <div className="rounded-xl bg-white border border-[#D56753]/6 p-3 text-center">
              <p className="text-lg font-black text-[#212D40]">
                {roadmap.trialConversionRate > 0 ? `${roadmap.trialConversionRate}%` : "--"}
              </p>
              <TailorText editKey="hq.visionary.roadmap.metrics.trialConv" defaultText="Trial Conv." as="p" className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5" />
            </div>
            <div className="rounded-xl bg-white border border-[#D56753]/6 p-3 text-center">
              <p className="text-lg font-black text-[#212D40]">
                {roadmap.referralRate > 0 ? `${roadmap.referralRate}%` : "--"}
              </p>
              <TailorText editKey="hq.visionary.roadmap.metrics.referralRate" defaultText="Referral Rate" as="p" className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Panel 5: The Scoreboard (collapsible) ---------------------------------

const RECORDS_TO_BEAT = [
  {
    record: "Most capital-efficient vertical SaaS",
    who: "Veeva ($7M to $32B)",
    theirTime: "6 years",
    alloroTarget: "3 years",
  },
  {
    record: "Smallest team at unicorn (revenue)",
    who: "Instagram (13 people)",
    theirTime: "2 years",
    alloroTarget: "< 3 years, 3 people",
  },
  {
    record: "Fastest bootstrapped to $1B",
    who: "Zapier ($2.68M raised)",
    theirTime: "10 years",
    alloroTarget: "3 years",
  },
  {
    record: "First AI-agent-operated unicorn",
    who: "Nobody",
    theirTime: "Never done",
    alloroTarget: "First",
  },
];

interface ConfidenceScore {
  label: string;
  value: number;
  color: string;
}

const CONFIDENCE_SCORES: ConfidenceScore[] = [
  { label: "FYM Confidence", value: 71, color: "bg-emerald-500" },
  { label: "Unicorn Confidence", value: 58, color: "bg-[#D56753]" },
  { label: "Rice Cooker (Autonomous Ops)", value: 74, color: "bg-blue-500" },
];

interface Milestone {
  name: string;
  target: string;
  progress: string;
  status: "done" | "in-progress" | "upcoming";
}

function buildMilestones(orgCount: number): Milestone[] {
  const aaeDate = new Date("2026-04-14T00:00:00");
  const now = new Date();
  const daysUntilAAE = Math.max(
    0,
    Math.ceil((aaeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );
  const aaeStatus: Milestone["status"] =
    daysUntilAAE <= 0 ? "done" : "in-progress";

  return [
    {
      name: "AAE Demo",
      target: "April 14, 2026",
      progress: daysUntilAAE <= 0 ? "Complete" : `${daysUntilAAE} days left`,
      status: aaeStatus,
    },
    {
      name: "50 Checkups",
      target: "50 submitted",
      progress: `${Math.min(orgCount, 50)} / 50`,
      status: orgCount >= 50 ? "done" : orgCount > 0 ? "in-progress" : "upcoming",
    },
    {
      name: "$50K MRR",
      target: "$50,000/mo",
      progress: `${orgCount} paying orgs`,
      status: "upcoming",
    },
    {
      name: "100 Clients",
      target: "100 organizations",
      progress: `${orgCount} / 100`,
      status: orgCount >= 100 ? "done" : orgCount > 0 ? "in-progress" : "upcoming",
    },
    {
      name: "First State of Clarity Report",
      target: "At 50 checkups",
      progress: orgCount >= 50 ? "Ready" : "Waiting for 50 checkups",
      status: orgCount >= 50 ? "in-progress" : "upcoming",
    },
    {
      name: "$500K MRR",
      target: "$500,000/mo",
      progress: "Milestone",
      status: "upcoming",
    },
    {
      name: "Anthropic Customer Story",
      target: "At 12 months of results",
      progress: "Upcoming",
      status: "upcoming",
    },
  ];
}

function ScoreboardPanel({ orgs }: { orgs: AdminOrganization[] }) {
  const milestones = buildMilestones(orgs.length);
  // Show only next 3 milestones (first non-done ones)
  const upcomingMilestones = milestones.filter((m) => m.status !== "done").slice(0, 3);

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/40 p-6 shadow-sm">
      {/* Records to Beat: collapsible */}
      <CollapsibleSection title="Records to Beat" icon={Trophy} iconColor="text-amber-600">
        <div className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-2 pr-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Record
                  </th>
                  <th className="pb-2 pr-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Who
                  </th>
                  <th className="pb-2 pr-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Their Time
                  </th>
                  <th className="pb-2 text-[10px] font-bold uppercase tracking-wider text-[#D56753]">
                    Alloro Target
                  </th>
                </tr>
              </thead>
              <tbody>
                {RECORDS_TO_BEAT.map((r) => (
                  <tr key={r.record} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 pr-4 text-xs font-medium text-[#212D40]">
                      {r.record}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">{r.who}</td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">{r.theirTime}</td>
                    <td className="py-2.5 text-xs font-semibold text-[#D56753]">
                      {r.alloroTarget}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleSection>

      {/* Live Confidence Scores: collapsible */}
      <CollapsibleSection title="Live Confidence Scores" icon={Target} iconColor="text-[#D56753]">
        <div className="mb-6">
          <div className="space-y-3">
            {CONFIDENCE_SCORES.map((score) => (
              <div key={score.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-600">
                    {score.label}
                  </span>
                  <span className="text-sm font-bold text-[#212D40]">
                    {score.value}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-gray-100">
                  <div
                    className={`h-2.5 rounded-full ${score.color} transition-all duration-700`}
                    style={{ width: `${score.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <TailorText editKey="hq.visionary.scoreboard.calibrationNote" defaultText="Scores from internal calibration. Updated quarterly." as="p" className="text-[10px] text-gray-400 mt-2 italic" />
        </div>
      </CollapsibleSection>

      {/* Milestone Timeline: compact, next 3 only */}
      <div>
        <TailorText editKey="hq.visionary.scoreboard.milestoneTimeline" defaultText="Next Milestones" as="p" className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#D56753]/40 mb-3" />
        <div className="space-y-2">
          {upcomingMilestones.map((m) => (
            <div
              key={m.name}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                m.status === "done"
                  ? "bg-emerald-50 border-emerald-200"
                  : m.status === "in-progress"
                    ? "bg-white border-amber-200"
                    : "bg-gray-50 border-gray-100"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    m.status === "done"
                      ? "bg-emerald-500"
                      : m.status === "in-progress"
                        ? "bg-amber-400"
                        : "bg-gray-300"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#212D40] truncate">
                    {m.name}
                  </p>
                  <p className="text-[10px] text-gray-400">{m.target}</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-xs font-bold text-[#212D40]">{m.progress}</p>
                <p
                  className={`text-[10px] font-bold uppercase ${
                    m.status === "done"
                      ? "text-emerald-600"
                      : m.status === "in-progress"
                        ? "text-amber-600"
                        : "text-gray-400"
                  }`}
                >
                  {m.status === "done"
                    ? "Complete"
                    : m.status === "in-progress"
                      ? "In Progress"
                      : "Upcoming"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Panel 6: Pipeline Funnel ----------------------------------------------

function PipelineFunnelPanel({
  orgs,
  healthData,
}: {
  orgs: AdminOrganization[];
  healthData: ClientHealthEntry[];
}) {
  const checkupStarted = orgs.filter(
    (o) => !o.subscription_tier && !o.connections?.gbp
  ).length;
  const accountCreated = orgs.filter(
    (o) => !o.subscription_tier && o.connections?.gbp
  ).length;
  const inTrial = orgs.filter(
    (o) => o.subscription_status === "trial"
  ).length;
  const onboarding = orgs.filter(
    (o) =>
      o.subscription_status === "active" &&
      o.subscription_tier &&
      !o.connections?.gbp
  ).length;
  const active = orgs.filter(
    (o) =>
      o.subscription_status === "active" &&
      o.subscription_tier &&
      o.connections?.gbp
  ).length;
  const atRisk = healthData.filter((c) => c.health === "red").length;

  const stages = [
    { label: "Checkup Started", count: checkupStarted, color: "bg-gray-300" },
    { label: "Account Created", count: accountCreated, color: "bg-blue-300" },
    { label: "In Trial", count: inTrial, color: "bg-blue-400" },
    { label: "Onboarding", count: onboarding, color: "bg-amber-400" },
    { label: "Active", count: active, color: "bg-emerald-500" },
    { label: "At Risk", count: atRisk, color: "bg-red-500" },
  ];

  const maxCount = Math.max(1, ...stages.map((s) => s.count));

  return (
    <Panel>
      <PanelHeader icon={Users} label="Pipeline Funnel" iconColor="text-blue-500" />
      <div className="space-y-3">
        {stages.map((stage) => (
          <div key={stage.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">
                {stage.label}
              </span>
              <span className="text-sm font-bold text-[#212D40]">
                {stage.count}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className={`h-2 rounded-full ${stage.color} transition-all`}
                style={{
                  width: `${Math.max(2, (stage.count / maxCount) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---- Panel 7: Portfolio Score ----------------------------------------------

function PortfolioScorePanel({
  healthData,
}: {
  healthData: ClientHealthEntry[];
}) {
  let avgScore = 0;
  if (healthData.length > 0) {
    const hasScores = healthData.some((c) => c.score !== undefined);
    if (hasScores) {
      const total = healthData.reduce((sum, c) => sum + (c.score ?? 50), 0);
      avgScore = Math.round(total / healthData.length);
    } else {
      const total = healthData.reduce((sum, c) => {
        if (c.health === "green") return sum + 90;
        if (c.health === "amber") return sum + 60;
        return sum + 25;
      }, 0);
      avgScore = Math.round(total / healthData.length);
    }
  }

  const scoreColor =
    avgScore >= 80
      ? "text-emerald-600"
      : avgScore >= 60
        ? "text-amber-600"
        : avgScore >= 40
          ? "text-orange-600"
          : "text-red-600";

  const ringColor =
    avgScore >= 80
      ? "stroke-emerald-500"
      : avgScore >= 60
        ? "stroke-amber-500"
        : avgScore >= 40
          ? "stroke-orange-500"
          : "stroke-red-500";

  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (avgScore / 100) * circumference;

  return (
    <Panel className="flex flex-col items-center justify-center">
      <PanelHeader icon={Shield} label="Portfolio Score" iconColor="text-[#212D40]" />

      <div className="relative w-32 h-32 mb-3">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#f3f4f6"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            className={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-3xl font-black ${scoreColor}`}>
            {healthData.length > 0 ? avgScore : "--"}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        {healthData.length > 0
          ? `Across ${healthData.length} client${healthData.length !== 1 ? "s" : ""}`
          : "No client data yet"}
      </p>
    </Panel>
  );
}

// ---- Panel 8: Agent Mission Control (replaces simple footer) ---------------

interface AgentStatusEntry {
  name: string;
  displayName: string;
  tier: "fast" | "standard" | "judgment";
  status: "nominal" | "degraded" | "failed" | "idle";
  lastRun: string | null;
  lastRunDuration?: number;
  lastResult: "success" | "failure" | "skipped" | null;
  nextScheduledRun: string | null;
  circuitState: "closed" | "open" | "half-open";
  weeklyRuns: number;
  weeklyFailures: number;
  tokensUsedThisWeek: number;
  costThisWeek: number;
  team: string;
}

interface MissionControlData {
  agents: AgentStatusEntry[];
  byTeam: Record<string, AgentStatusEntry[]>;
  summary: {
    total: number;
    nominal: number;
    degraded: number;
    failed: number;
    idle: number;
    totalWeeklyCost: number;
    totalWeeklyTokens: number;
  };
}

const STATUS_DOT: Record<string, string> = {
  nominal: "bg-emerald-500",
  degraded: "bg-amber-400",
  failed: "bg-red-500",
  idle: "bg-gray-300",
};

const CIRCUIT_LABEL: Record<string, { text: string; color: string }> = {
  closed: { text: "Healthy", color: "text-emerald-600" },
  "half-open": { text: "Recovering", color: "text-amber-600" },
  open: { text: "Tripped", color: "text-red-600" },
};

function AgentMissionControl() {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const { data: mcData, isLoading } = useQuery<MissionControlData>({
    queryKey: ["mission-control"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/mission-control" });
      return res?.success ? res : null;
    },
    refetchInterval: 30_000,
    retry: false,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <Panel>
        <PanelHeader icon={Activity} label="Agent Mission Control" />
        <div className="h-16 flex items-center justify-center text-xs text-gray-400">Loading agents...</div>
      </Panel>
    );
  }

  if (!mcData) {
    return (
      <Panel>
        <PanelHeader icon={Activity} label="Agent Mission Control" />
        <p className="text-xs text-gray-400">Mission control unavailable.</p>
      </Panel>
    );
  }

  const { byTeam, summary } = mcData;
  const teamNames = Object.keys(byTeam).sort();

  return (
    <Panel>
      <PanelHeader icon={Activity} label="Agent Mission Control" />

      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-[#212D40]">{summary.nominal}</span>
          <span className="text-[10px] text-gray-400">nominal</span>
        </div>
        {summary.degraded > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs font-semibold text-[#212D40]">{summary.degraded}</span>
            <span className="text-[10px] text-gray-400">degraded</span>
          </div>
        )}
        {summary.failed > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-[#212D40]">{summary.failed}</span>
            <span className="text-[10px] text-gray-400">failed</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="text-xs font-semibold text-[#212D40]">{summary.idle}</span>
          <span className="text-[10px] text-gray-400">idle</span>
        </div>
        <span className="text-[10px] text-gray-400 ml-auto">
          {summary.total} total agents
        </span>
      </div>

      {/* Team groups */}
      <div className="space-y-3">
        {teamNames.map((team) => {
          const agents = byTeam[team];
          const isExpanded = expandedTeam === team;
          const teamFailed = agents.filter((a) => a.status === "failed").length;
          const teamDegraded = agents.filter((a) => a.status === "degraded").length;

          return (
            <div key={team} className="rounded-xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => setExpandedTeam(isExpanded ? null : team)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                {/* Status dots grid */}
                <div className="flex items-center gap-1 shrink-0">
                  {agents.map((a) => (
                    <span
                      key={a.name}
                      className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[a.status] || STATUS_DOT.idle}`}
                      title={`${a.displayName}: ${a.status}`}
                    />
                  ))}
                </div>

                <span className="text-xs font-semibold text-[#212D40] flex-1 text-left">{team}</span>

                {teamFailed > 0 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{teamFailed} failed</span>
                )}
                {teamDegraded > 0 && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{teamDegraded} degraded</span>
                )}

                <span className="text-[10px] text-gray-400">{agents.length} agents</span>

                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {agents.map((agent) => {
                    const isAgentExpanded = expandedAgent === agent.name;
                    const circuit = CIRCUIT_LABEL[agent.circuitState] || CIRCUIT_LABEL.closed;

                    return (
                      <div key={agent.name}>
                        <button
                          onClick={() => setExpandedAgent(isAgentExpanded ? null : agent.name)}
                          className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50/50 transition-colors text-left"
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                          <span className="text-xs font-medium text-[#212D40] flex-1 truncate">
                            {agent.displayName}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {agent.lastRun ? timeAgo(agent.lastRun) : "never"}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                            agent.tier === "fast" ? "bg-blue-50 text-blue-600" :
                            agent.tier === "judgment" ? "bg-purple-50 text-purple-600" :
                            "bg-gray-50 text-gray-500"
                          }`}>
                            {agent.tier}
                          </span>
                        </button>

                        {isAgentExpanded && (
                          <div className="px-4 pb-3 pt-1 bg-gray-50/30 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Last Run</p>
                              <p className="text-xs font-medium text-[#212D40]">
                                {agent.lastRun ? timeAgo(agent.lastRun) : "Never"}
                              </p>
                              {agent.lastRunDuration !== undefined && (
                                <p className="text-[10px] text-gray-400">{(agent.lastRunDuration / 1000).toFixed(1)}s</p>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Next Run</p>
                              <p className="text-xs font-medium text-[#212D40]">
                                {agent.nextScheduledRun ? timeAgo(agent.nextScheduledRun) : "Unscheduled"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Circuit</p>
                              <p className={`text-xs font-medium ${circuit.color}`}>
                                {circuit.text}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Weekly Cost</p>
                              <p className="text-xs font-medium text-[#212D40]">
                                ${agent.costThisWeek.toFixed(3)}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {agent.weeklyRuns} runs, {agent.weeklyFailures} failures
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ---- Panel 9: Email Health --------------------------------------------------

interface EmailHealthData {
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
  totalEmails: number;
}

function EmailHealthPanel() {
  const { data: health, isLoading } = useQuery<EmailHealthData>({
    queryKey: ["email-health"],
    queryFn: async () => {
      const res = await apiGet({ path: "/webhooks/mailgun/health" });
      return res?.success ? res : null;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <Panel>
        <PanelHeader icon={Activity} label="Email Health" />
        <div className="h-12 flex items-center justify-center text-xs text-gray-400">Loading...</div>
      </Panel>
    );
  }

  if (!health || health.totalEmails === 0) {
    return (
      <Panel>
        <PanelHeader icon={Activity} label="Email Health" />
        <p className="text-xs text-gray-400">No email data yet. Mailgun webhooks will populate this.</p>
      </Panel>
    );
  }

  const metrics = [
    {
      label: "Delivery Rate",
      value: health.deliveryRate,
      target: 95,
      suffix: "%",
      alert: health.deliveryRate < 95,
    },
    {
      label: "Open Rate",
      value: health.openRate,
      target: 40,
      suffix: "%",
      alert: health.openRate < 20,
    },
    {
      label: "Click Rate",
      value: health.clickRate,
      target: null,
      suffix: "%",
      alert: false,
    },
    {
      label: "Bounce Rate",
      value: health.bounceRate,
      target: 2,
      suffix: "%",
      alert: health.bounceRate > 2,
    },
    {
      label: "Complaints",
      value: health.complaintRate,
      target: 0.1,
      suffix: "%",
      alert: health.complaintRate > 0.1,
    },
  ];

  return (
    <Panel>
      <PanelHeader icon={Activity} label="Email Health" />

      <div className="space-y-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">{m.label}</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${m.alert ? "text-red-600" : "text-[#212D40]"}`}>
                  {m.value}{m.suffix}
                </span>
                {m.target !== null && (
                  <span className="text-[10px] text-gray-400">
                    target: {m.label.includes("Bounce") || m.label.includes("Complaint") ? "<" : ">"}{m.target}{m.suffix}
                  </span>
                )}
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100">
              <div
                className={`h-1.5 rounded-full transition-all ${m.alert ? "bg-red-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, m.value)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-400 mt-3">
        {health.totalEmails.toLocaleString()} emails tracked (last 30 days)
      </p>
    </Panel>
  );
}

// ---- Panel 10: AI Cost This Month -------------------------------------------

interface CostTrendData {
  thisMonth: { byAgent: Record<string, number>; byTier: Record<string, number>; total: number; perClient: number };
  lastMonth: { total: number };
  changePercent: number;
}

function AICostPanel() {
  const { data: costData, isLoading } = useQuery<CostTrendData>({
    queryKey: ["ai-cost-trend"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/mission-control/costs?period=trend" });
      return res?.success ? res : null;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <Panel>
        <PanelHeader icon={DollarSign} label="AI Cost This Month" iconColor="text-purple-500" />
        <div className="h-12 flex items-center justify-center text-xs text-gray-400">Loading...</div>
      </Panel>
    );
  }

  if (!costData) {
    return (
      <Panel>
        <PanelHeader icon={DollarSign} label="AI Cost This Month" iconColor="text-purple-500" />
        <p className="text-xs text-gray-400">No cost data recorded yet. Costs are tracked per agent run.</p>
      </Panel>
    );
  }

  const { thisMonth, changePercent } = costData;
  const tierEntries = Object.entries(thisMonth.byTier).sort((a, b) => b[1] - a[1]);
  const totalTierCost = tierEntries.reduce((sum, [, v]) => sum + v, 0) || 1;

  const TIER_COLORS: Record<string, string> = {
    haiku: "bg-blue-400",
    sonnet: "bg-[#D56753]",
    opus: "bg-purple-500",
  };

  return (
    <Panel>
      <PanelHeader icon={DollarSign} label="AI Cost This Month" iconColor="text-purple-500" />

      <div className="space-y-4">
        {/* Total spend */}
        <div>
          <p className="text-3xl font-black text-[#212D40]">${thisMonth.total.toFixed(2)}</p>
          <div className="flex items-center gap-2 mt-1">
            {changePercent !== 0 && (
              <>
                {changePercent > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
                )}
                <span className={`text-xs font-semibold ${changePercent > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {changePercent > 0 ? "+" : ""}{changePercent}% vs last month
                </span>
              </>
            )}
          </div>
        </div>

        {/* Per-client */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Per-Client Average</p>
          <p className="text-lg font-bold text-[#212D40]">${thisMonth.perClient.toFixed(2)}/mo</p>
        </div>

        {/* Tier breakdown as stacked bar */}
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">By Tier</p>
          <div className="h-3 w-full rounded-full bg-gray-100 flex overflow-hidden">
            {tierEntries.map(([tier, cost]) => (
              <div
                key={tier}
                className={`h-3 ${TIER_COLORS[tier] || "bg-gray-400"} transition-all`}
                style={{ width: `${Math.max(2, (cost / totalTierCost) * 100)}%` }}
                title={`${tier}: $${cost.toFixed(2)}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-4 mt-2">
            {tierEntries.map(([tier, cost]) => (
              <div key={tier} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${TIER_COLORS[tier] || "bg-gray-400"}`} />
                <span className="text-[10px] text-gray-500">{tier}: ${cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ---- Main Component --------------------------------------------------------

export default function VisionaryView() {
  const [founderOpen, setFounderOpen] = useState(false);

  // Fetch personal agent brief (the ONE thing)
  const { data: agentBriefRaw } = useQuery({
    queryKey: ["personal-agent-brief"],
    queryFn: async () => {
      const res = await apiGet({ path: "/personal-agent/brief" });
      return res?.success ? (res.data as PersonalAgentBrief) : null;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
  const agentBrief: PersonalAgentBrief | null = agentBriefRaw ?? null;

  // Fetch organizations
  const { data: orgData } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const orgs: AdminOrganization[] =
    (orgData as any)?.organizations ?? (Array.isArray(orgData) ? orgData : []);

  // Fetch client health
  const { data: healthRaw } = useQuery({
    queryKey: ["admin-client-health-visionary"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/client-health" });
      return res?.success !== false
        ? ((res?.data || res?.clients || res?.entries || []) as ClientHealthEntry[])
        : [];
    },
    retry: false,
    staleTime: 60_000,
  });
  const healthData: ClientHealthEntry[] = healthRaw ?? [];

  // Fetch tasks
  const { data: taskData } = useQuery({
    queryKey: ["dream-team-tasks-visionary"],
    queryFn: () => fetchDreamTeamTasks(),
    retry: false,
    staleTime: 60_000,
  });
  const tasks: DreamTeamTask[] = taskData?.tasks ?? [];

  return (
    <>
      {founderOpen && <FounderMode onClose={() => setFounderOpen(false)} />}

      {/* Kill Switch -- emergency agent stop */}
      <KillSwitchBanner />

      {/* F badge */}
      <button
        onClick={() => setFounderOpen(true)}
        className="fixed top-4 right-4 z-40 w-8 h-8 rounded-lg bg-[#212D40] text-white text-xs font-black flex items-center justify-center hover:bg-[#D56753] transition-colors"
        title="Founder Mode"
      >
        F
      </button>

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* 1. The ONE thing: Personal Agent Headline */}
        <PersonalAgentHeadline brief={agentBrief} />

        {/* 2. Morning Briefing Stats (only non-zero) */}
        <MorningBriefingStats healthData={healthData} />

        {/* 3. Revenue (prominent but not the hero) */}
        <RevenuePanel orgs={orgs} />

        {/* 4. Decisions Needing You */}
        <DecisionPanel tasks={tasks} agentBrief={agentBrief} />

        {/* 5. Route to Unicorn (compact, collapsible timeline) */}
        <RoadmapPanel />

        {/* 6. The Scoreboard (Records + Confidence, collapsible) */}
        <ScoreboardPanel orgs={orgs} />

        {/* 7 + 8: Pipeline + Portfolio Score side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PipelineFunnelPanel orgs={orgs} healthData={healthData} />
          <PortfolioScorePanel healthData={healthData} />
        </div>

        {/* 9. Agent Mission Control */}
        <AgentMissionControl />

        {/* 10 + 11: Email Health + AI Cost side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EmailHealthPanel />
          <AICostPanel />
        </div>
      </div>

      {/* CEO Chat moved to dedicated nav page -- no floating widgets */}
    </>
  );
}
