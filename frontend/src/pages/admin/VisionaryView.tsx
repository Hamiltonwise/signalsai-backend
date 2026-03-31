/**
 * Visionary View -- Corey's CEO War Room
 *
 * Open it, see everything in 60 seconds, close it. Seven panels:
 * 1. Morning Briefing (top, full width)
 * 2. The Scoreboard (CEO north star tracking, full width)
 * 3. Revenue (left column)
 * 4. Pipeline Funnel (right column)
 * 5. Needs Your Decision (full width, red accent)
 * 6. Agent Health (bottom left)
 * 7. Portfolio Score (bottom right)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import CEOIntelligenceChat from "@/components/Admin/CEOIntelligenceChat";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  Activity,
  Shield,
  Sun,
  Trophy,
  Map,
  Navigation,
  CheckCircle2,
  Circle,
  Target,
} from "lucide-react";
import FounderMode from "./FounderMode";
import {} from "react-router-dom";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import { fetchSchedules, type Schedule } from "@/api/schedules";
import {
  fetchDreamTeamTasks,
  type DreamTeamTask,
} from "@/api/dream-team";
import { apiGet } from "@/api/index";

// ---- Helpers ---------------------------------------------------------------

const TIER_PRICING: Record<string, number> = {
  DWY: 997,
  DFY: 2497,
};

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
      className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  label,
  iconColor = "text-gray-400",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
        {label}
      </p>
    </div>
  );
}

// Panel 1: Morning Briefing
function MorningBriefingPanel({
  healthData,
}: {
  healthData: ClientHealthEntry[];
}) {
  const { data: briefingRaw, isLoading } = useQuery({
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

  const headline =
    briefing?.topEvent || briefing?.headline || briefing?.summary || null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-8 shadow-sm">
      <PanelHeader icon={Sun} label="Morning Briefing" iconColor="text-amber-500" />

      {isLoading ? (
        <div className="h-8 w-2/3 animate-pulse rounded bg-gray-200" />
      ) : headline ? (
        <p className="text-xl font-semibold text-[#212D40] leading-relaxed mb-6">
          {headline}
        </p>
      ) : (
        <p className="text-lg text-gray-400 mb-6">
          Briefing generates at 6:30am ET
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-[#212D40]">
            {briefing?.signups ?? 0}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            New Signups
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-[#212D40]">
            {briefing?.competitor_moves ?? 0}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            Competitor Moves
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-[#212D40]">
            {briefing?.reviews_received ?? 0}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            Reviews
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-bold text-[#212D40]">{greenCount}</span>
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-sm font-bold text-[#212D40]">{amberCount}</span>
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm font-bold text-[#212D40]">{redCount}</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            Client Health
          </p>
        </div>
      </div>
    </div>
  );
}

// Panel 2: Revenue
function RevenuePanel({ orgs }: { orgs: AdminOrganization[] }) {
  const activeOrgs = orgs.filter(
    (o) => o.subscription_status === "active" || o.subscription_tier
  );

  const mrr = activeOrgs.reduce((sum, o) => {
    const tier = o.subscription_tier || "DWY";
    return sum + (TIER_PRICING[tier] ?? 0);
  }, 0);

  // Simple month-over-month proxy: compare created_at this month vs last month
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
          <p className="text-xs text-gray-400 mt-1">
            Monthly Recurring Revenue
          </p>
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
          <p className="text-xs text-gray-400 mb-1">
            Runway (${MONTHLY_BURN.toLocaleString()} burn)
          </p>
          {isProfitable ? (
            <p className="text-lg font-bold text-emerald-600">
              Profitable. +${monthlyDelta.toLocaleString()}/mo
            </p>
          ) : mrr === 0 ? (
            <p className="text-lg font-bold text-gray-400">
              Pre-revenue
            </p>
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

// Panel 3: Pipeline Funnel
function PipelineFunnelPanel({
  orgs,
  healthData,
}: {
  orgs: AdminOrganization[];
  healthData: ClientHealthEntry[];
}) {
  // Count orgs at each stage
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

// Panel 4: Needs Your Decision
function DecisionPanel({ tasks }: { tasks: DreamTeamTask[] }) {
  const urgent = tasks.filter(
    (t) =>
      (t.priority === "urgent" || t.priority === "high") &&
      t.status === "open"
  );

  const hasItems = urgent.length > 0;

  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        hasItems
          ? "border-red-300 bg-red-50/50"
          : "border-gray-200 bg-white"
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
          Needs Your Decision
          {hasItems && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {urgent.length}
            </span>
          )}
        </p>
      </div>

      {!hasItems ? (
        <p className="text-sm text-gray-400">
          Nothing needs your decision right now. Focus time.
        </p>
      ) : (
        <div className="space-y-2">
          {urgent.map((t) => (
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

// Panel 5: Agent Health
function AgentHealthPanel({ schedules }: { schedules: Schedule[] }) {
  const total = schedules.length;
  const running = schedules.filter(
    (s) => s.latest_run?.status === "running"
  ).length;
  const failed = schedules.filter(
    (s) => s.latest_run?.status === "failed"
  );
  const neverRun = schedules.filter((s) => !s.latest_run);
  const nominal = total - failed.length - neverRun.length;

  return (
    <Panel>
      <PanelHeader icon={Activity} label="Agent Health" iconColor="text-[#D56753]" />

      <p className="text-sm text-[#212D40] font-medium mb-3">
        {nominal}/{total} agents nominal.{" "}
        {failed.length > 0
          ? `${failed.length} failed.`
          : ""}{" "}
        {neverRun.length > 0
          ? `${neverRun.length} never run.`
          : ""}
        {running > 0 ? ` ${running} running now.` : ""}
      </p>

      {failed.length > 0 && (
        <div className="space-y-1.5">
          {failed.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span className="text-xs font-medium text-red-700 truncate">
                {s.display_name}
              </span>
              <span className="text-[10px] text-red-400 ml-auto shrink-0">
                {timeAgo(s.last_run_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {failed.length === 0 && neverRun.length === 0 && (
        <p className="text-xs text-emerald-600 font-medium">All systems green.</p>
      )}
    </Panel>
  );
}

// Panel 6: Portfolio Score
function PortfolioScorePanel({
  healthData,
}: {
  healthData: ClientHealthEntry[];
}) {
  // Average score from client health data, or derive from green/amber/red
  let avgScore = 0;
  if (healthData.length > 0) {
    const hasScores = healthData.some((c) => c.score !== undefined);
    if (hasScores) {
      const total = healthData.reduce((sum, c) => sum + (c.score ?? 50), 0);
      avgScore = Math.round(total / healthData.length);
    } else {
      // Derive from health status: green=90, amber=60, red=25
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

// Panel 7: The Scoreboard (CEO North Star Tracking)

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

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/40 p-8 shadow-sm">
      <PanelHeader icon={Trophy} label="The Scoreboard" iconColor="text-amber-600" />

      {/* Records to Beat */}
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
          Records to Beat
        </p>
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

      {/* Live Confidence Scores */}
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
          Live Confidence Scores
        </p>
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
        <p className="text-[10px] text-gray-400 mt-2 italic">
          Scores from internal calibration. Updated quarterly.
        </p>
      </div>

      {/* Milestone Timeline */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
          Milestone Timeline
        </p>
        <div className="space-y-2">
          {milestones.map((m) => (
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

// Panel 8: Live Roadmap (Google Maps for Alloro)

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
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30 p-8 shadow-sm">
        <PanelHeader icon={Map} label="Route to Unicorn" iconColor="text-blue-600" />
        <div className="space-y-4">
          <div className="h-6 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
          <div className="h-32 w-full animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <PanelHeader icon={Map} label="Route to Unicorn" iconColor="text-blue-600" />
        <p className="text-sm text-gray-400">Roadmap data unavailable. Check backend connection.</p>
      </div>
    );
  }

  const milestoneProgress =
    roadmap.nextMilestone.target > 0
      ? Math.min(100, Math.round((roadmap.nextMilestone.current / roadmap.nextMilestone.target) * 100))
      : 0;

  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30 p-8 shadow-sm">
      <PanelHeader icon={Map} label="Route to Unicorn" iconColor="text-blue-600" />

      {/* Current Position */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Navigation className="h-4 w-4 text-[#D56753]" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Current Position
          </p>
        </div>
        <p className="text-xl font-semibold text-[#212D40]">
          {roadmap.currentPhase}. ${roadmap.currentMRR.toLocaleString()} MRR. {roadmap.currentClients} client{roadmap.currentClients !== 1 ? "s" : ""}.
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {roadmap.phaseDescription}
        </p>
      </div>

      {/* Next Turn */}
      <div className="mb-6 rounded-xl bg-white border border-blue-100 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-blue-500" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Next Turn
          </p>
        </div>
        <p className="text-sm font-medium text-[#212D40] mb-2">
          {roadmap.nextMilestone.name}
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-2.5 w-full rounded-full bg-gray-100">
              <div
                className="h-2.5 rounded-full bg-blue-500 transition-all duration-700"
                style={{ width: `${Math.max(2, milestoneProgress)}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-bold text-[#212D40] shrink-0">
            {milestoneProgress}%
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          ETA: {roadmap.nextMilestone.estimatedDate}
        </p>
      </div>

      {/* Phase Timeline */}
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
          Route Timeline
        </p>
        <div className="relative">
          {/* Vertical line */}
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
      </div>

      {/* ETA to Unicorn */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-[#212D40] to-[#2d3d54] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
          ETA to Unicorn
        </p>
        <p className="text-sm text-white leading-relaxed">
          {roadmap.etaToUnicorn}
        </p>
      </div>

      {/* Course Correction */}
      {roadmap.courseCorrection && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
              Course Correction
            </p>
          </div>
          <p className="text-sm text-amber-800 leading-relaxed">
            {roadmap.courseCorrection}
          </p>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
        <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
          <p className="text-lg font-black text-[#212D40]">
            ${roadmap.currentMRR.toLocaleString()}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5">
            MRR
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
          <p className="text-lg font-black text-[#212D40]">
            {roadmap.currentClients}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5">
            Clients
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
          <p className="text-lg font-black text-[#212D40]">
            {roadmap.checkupsCompleted}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5">
            Checkups
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
          <p className="text-lg font-black text-[#212D40]">
            {roadmap.trialConversionRate > 0 ? `${roadmap.trialConversionRate}%` : "--"}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5">
            Trial Conv.
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
          <p className="text-lg font-black text-[#212D40]">
            {roadmap.referralRate > 0 ? `${roadmap.referralRate}%` : "--"}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-0.5">
            Referral Rate
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- Main Component --------------------------------------------------------

export default function VisionaryView() {
  const [founderOpen, setFounderOpen] = useState(false);

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

  // Fetch schedules
  const { data: scheduleData } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: fetchSchedules,
  });
  const schedules: Schedule[] = Array.isArray(scheduleData)
    ? scheduleData
    : [];

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

      {/* F badge */}
      <button
        onClick={() => setFounderOpen(true)}
        className="fixed top-4 right-4 z-40 w-8 h-8 rounded-lg bg-[#212D40] text-white text-xs font-black flex items-center justify-center hover:bg-[#D56753] transition-colors"
        title="Founder Mode"
      >
        F
      </button>

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Panel 1: Morning Briefing -- full width */}
        <MorningBriefingPanel healthData={healthData} />

        {/* Panel 2: Live Roadmap -- full width */}
        <RoadmapPanel />

        {/* Panel 3: The Scoreboard -- full width */}
        <ScoreboardPanel orgs={orgs} />

        {/* Panels 4 + 5: Revenue | Pipeline -- side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RevenuePanel orgs={orgs} />
          <PipelineFunnelPanel orgs={orgs} healthData={healthData} />
        </div>

        {/* Panel 4: Needs Your Decision -- full width */}
        <DecisionPanel tasks={tasks} />

        {/* Panels 5 + 6: Agent Health | Portfolio Score -- side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AgentHealthPanel schedules={schedules} />
          <PortfolioScorePanel healthData={healthData} />
        </div>
      </div>

      {/* The Conversation -- CEO Intelligence Chat */}
      <CEOIntelligenceChat />
    </>
  );
}
