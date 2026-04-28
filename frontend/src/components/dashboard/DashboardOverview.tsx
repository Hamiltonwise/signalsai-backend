/**
 * DashboardOverview — Focus tab content (Plan 2 redesign).
 *
 * Thin composition of the new card components under
 * `frontend/src/components/dashboard/focus/`. The legacy 1700-line file
 * was replaced wholesale; the new file is intentionally minimal and
 * delegates all heavy lifting to the child components, each of which
 * fetches its own data via React Query hooks.
 *
 * Plan: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T20)
 *
 * Layout:
 *   <SetupProgressBanner />          (only when org incomplete)
 *   <FocusHeader />                  (small "Focus — {Month YYYY}" eyebrow)
 *   <Hero />                         (top_actions[0] from Summary v2)
 *   <Trajectory /> | <ActionQueue /> (2/1 grid)
 *   <WebsiteCard /> <LocalRankingCard /> <PMSCard />  (3-col grid)
 *
 * Data sources are the new endpoints from Plan 1 (backend):
 *   GET /api/dashboard/metrics
 *   GET /api/user/website/form-submissions/timeseries
 *   GET /api/practice-ranking/history
 * Plus existing endpoints for tasks (Hero/Queue), agents/latest (Trajectory),
 * pms/keyData (PMS card), practice-ranking/latest (Ranking card).
 */

import { Hero } from "./focus/Hero";
import { Trajectory } from "./focus/Trajectory";
import { ActionQueue } from "./focus/ActionQueue";
import WebsiteCard from "./focus/WebsiteCard";
import LocalRankingCard from "./focus/LocalRankingCard";
import PMSCard from "./focus/PMSCard";
import { SetupProgressBanner } from "./focus/SetupProgressBanner";

interface DashboardOverviewProps {
  // Legacy props — kept for backward compatibility with Dashboard.tsx tab
  // dispatch. The new card components self-fetch via useAuth + useLocationContext
  // and do not require these to be threaded down.
  organizationId?: number | null;
  locationId?: number | null;
}

function FocusHeader() {
  const now = new Date();
  const monthYear = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodLabel = `${periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className="flex items-end justify-between gap-6 mb-6">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B7280] mb-2">
          The month at a glance
        </div>
        <h2 className="font-display text-[28px] font-normal tracking-tight text-[#1A1A1A]">
          Focus — {monthYear}
        </h2>
        <p className="mt-1.5 text-[13px] text-[#6B7280] max-w-[540px] leading-relaxed">
          One priority. Everything else, in order.
        </p>
      </div>
      <div className="hidden md:flex items-center gap-3.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">
        <span>Period</span>
        <span className="font-display text-[22px] font-medium text-[#1A1A1A] tracking-tight">
          {periodLabel}
        </span>
      </div>
    </div>
  );
}

export function DashboardOverview(_props: DashboardOverviewProps) {
  return (
    <div className="max-w-[1320px] mx-auto px-4 lg:px-8 py-6 pb-16 space-y-6">
      <SetupProgressBanner />
      <FocusHeader />

      <Hero />

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Trajectory />
        <ActionQueue />
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <WebsiteCard />
        <LocalRankingCard />
        <PMSCard />
      </div>
    </div>
  );
}
