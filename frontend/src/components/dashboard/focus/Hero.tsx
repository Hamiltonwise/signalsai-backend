import React from "react";
import { ArrowRight, Clock, AlertCircle, RotateCw } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import {
  useTopAction,
  type ResolvedTopAction,
  type TopAction,
  type TopActionSupportingMetric,
} from "../../../hooks/queries/useTopAction";
import HighlightedText from "./HighlightedText";
import { getDomainIcon } from "./icons";

/**
 * Hero — top-of-dashboard card surfacing the single highest-priority
 * SUMMARY-authored action for the current month. Reads from `useTopAction`
 * (which filters tasks by `agent_type='SUMMARY'` and picks max
 * `priority_score`). Renders a dark-themed card so the `mark.hl` helper
 * picks the dark variant via the `focus-card-dark` class on the wrapper.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T10)
 * Visual reference: ~/Desktop/another-design/project/cards.jsx Hero (3-72)
 *                   ~/Desktop/another-design/project/Focus Dashboard.html
 */

// =====================================================================
// Helpers
// =====================================================================

function urgencyToTag(urgency: TopAction["urgency"]): string {
  switch (urgency) {
    case "high":
      return "TIME-SENSITIVE";
    case "medium":
      return "COMPOUNDING";
    case "low":
      return "STEADY";
    default:
      return "HIGH ROI";
  }
}

function urgencyPillClasses(urgency: TopAction["urgency"]): string {
  switch (urgency) {
    case "high":
      return "bg-[rgba(179,80,62,0.18)] text-[#F0A98E] border border-[rgba(179,80,62,0.28)]";
    case "medium":
      return "bg-[rgba(214,160,80,0.16)] text-[#E8C792] border border-[rgba(214,160,80,0.24)]";
    case "low":
    default:
      return "bg-white/5 text-[#C5BEB1] border border-white/10";
  }
}

function urgencyLabel(urgency: TopAction["urgency"]): string {
  switch (urgency) {
    case "high":
      return "URGENT";
    case "medium":
      return "MEDIUM PRIORITY";
    case "low":
      return "STEADY";
    default:
      return "PRIORITY";
  }
}

const DOMAIN_LABELS: Record<string, string> = {
  review: "Reviews",
  gbp: "Google Business",
  ranking: "Local Ranking",
  "form-submission": "Form Submissions",
  "pms-data-quality": "PMS Data",
  referral: "Referrals",
};

function formatDue(dueAt?: string, taskDueDate?: string): string {
  const raw = dueAt ?? taskDueDate;
  if (!raw) return "DUE SOON";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return `DUE ${raw}`;
  return `DUE ${format(d, "MMM d, yyyy").toUpperCase()}`;
}

/**
 * Splits the deliverables string at the first " (" so the leading noun
 * phrase can render as a green-bold strong tag. Mirrors the cards.jsx
 * pattern (lines 63-66).
 */
function splitDeliverables(deliverables: string): {
  head: string;
  tail: string;
} {
  const idx = deliverables.indexOf(" (");
  if (idx === -1) return { head: deliverables, tail: "" };
  return {
    head: deliverables.slice(0, idx),
    tail: deliverables.slice(idx),
  };
}

// =====================================================================
// Subcomponents
// =====================================================================

const HeroShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section
    className="focus-card-dark relative overflow-hidden rounded-[14px] border border-[#2A2722] text-[#F5F1EA]"
    style={{
      background:
        "radial-gradient(60% 50% at 88% -10%, rgba(201,118,94,0.18), rgba(201,118,94,0) 60%), radial-gradient(40% 60% at 0% 110%, rgba(201,118,94,0.08), rgba(201,118,94,0) 70%), linear-gradient(180deg, #1A1A18 0%, #0F0F0E 100%)",
    }}
  >
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-px"
      style={{
        background:
          "linear-gradient(90deg, transparent, rgba(201,118,94,0.5), transparent)",
      }}
    />
    {children}
  </section>
);

const StatCell: React.FC<{ stat: TopActionSupportingMetric; index: number }> = ({
  stat,
  index,
}) => {
  const accent = index === 0;
  return (
    <div className="min-w-0">
      <div
        className={`font-display flex items-baseline gap-1 text-[30px] font-medium leading-none tracking-[-0.02em] ${
          accent ? "text-alloro-orange" : "text-[#F5F1EA]"
        }`}
      >
        <span className="truncate">{stat.value}</span>
        {stat.sub && (
          <span
            className={`text-[14px] font-normal ${
              accent ? "text-[rgba(201,118,94,0.5)]" : "text-[#8E8579]"
            }`}
          >
            {stat.sub}
          </span>
        )}
      </div>
      <div className="mt-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#C5BEB1]">
        {stat.label}
      </div>
      <div className="font-mono-display mt-1 text-[8.5px] uppercase tracking-[0.04em] text-[#58544D]">
        {stat.source_field}
      </div>
    </div>
  );
};

// =====================================================================
// States
// =====================================================================

const HeroLoading: React.FC = () => (
  <HeroShell>
    <div className="grid gap-10 px-10 py-9 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-5">
        <div className="flex gap-2">
          <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
          <div className="h-5 w-24 animate-pulse rounded-full bg-white/10" />
          <div className="h-5 w-28 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="space-y-2">
          <div className="h-10 w-11/12 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-9/12 animate-pulse rounded bg-white/10" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-10/12 animate-pulse rounded bg-white/5" />
          <div className="h-3 w-8/12 animate-pulse rounded bg-white/5" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-32 animate-pulse rounded-full bg-white/10" />
          <div className="h-10 w-32 animate-pulse rounded-full bg-white/5" />
        </div>
      </div>
      <aside className="self-start rounded-xl border border-white/10 bg-black/30 p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
        </div>
        <div className="grid grid-cols-3 gap-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-8 w-full animate-pulse rounded bg-white/10" />
              <div className="h-2 w-3/4 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  </HeroShell>
);

const HeroEmpty: React.FC = () => (
  <HeroShell>
    <div className="flex min-h-[280px] items-center justify-center px-10 py-16">
      <p className="font-display max-w-md text-center text-[20px] font-medium leading-snug text-[#C5BEB1]">
        Your first monthly priority will appear once your data finishes
        processing.
      </p>
    </div>
  </HeroShell>
);

const HeroError: React.FC<{ message: string; onRetry: () => void }> = ({
  message,
  onRetry,
}) => (
  <HeroShell>
    <div className="flex flex-col items-center justify-center gap-4 px-10 py-16 text-center">
      <div className="flex items-center gap-2 text-[#F0A98E]">
        <AlertCircle size={16} />
        <span className="text-sm font-medium">
          {message || "Failed to load your top action."}
        </span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#F5F1EA] transition-colors hover:bg-white/10"
      >
        <RotateCw size={12} />
        Retry
      </button>
    </div>
  </HeroShell>
);

// =====================================================================
// Main render
// =====================================================================

interface HeroBodyProps {
  topAction: ResolvedTopAction;
}

const HeroBody: React.FC<HeroBodyProps> = ({ topAction }) => {
  const { Comp: DomainIcon } = getDomainIcon(topAction.domain);
  const domainLabel =
    DOMAIN_LABELS[topAction.domain] ?? topAction.domain.toUpperCase();
  const dueLabel = formatDue(topAction.due_at, topAction.dueDate);
  const { head, tail } = splitDeliverables(topAction.outcome.deliverables);

  const handlePrimary = () => {
    const url = topAction.cta?.primary?.action_url;
    if (url) {
      // Internal vs external — internal links route via window location to
      // keep the implementation framework-agnostic at this layer.
      if (url.startsWith("http")) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        window.location.assign(url);
      }
    }
  };

  return (
    <HeroShell>
      <div className="grid gap-10 px-10 py-9 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* LEFT */}
        <div className="min-w-0">
          {/* Pills row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(201,118,94,0.18)] px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#F0A98E]">
              <span className="h-[5px] w-[5px] rounded-full bg-[#F0A98E]" />
              This month · 1 thing that matters
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] ${urgencyPillClasses(
                topAction.urgency
              )}`}
            >
              {urgencyLabel(topAction.urgency)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#D6CFC2]">
              <DomainIcon size={11} className="text-[#D6CFC2]" />
              {domainLabel}
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display mt-[22px] mb-[22px] max-w-[620px] text-[40px] font-medium leading-[1.04] tracking-[-0.02em] text-[#F5F1EA] lg:text-[44px]">
            <HighlightedText
              text={topAction.title}
              highlights={topAction.highlights}
            />
          </h1>

          {/* Rationale */}
          <p className="mb-7 max-w-[580px] text-[14.5px] leading-[1.65] text-[#C5BEB1]">
            <HighlightedText
              text={topAction.rationale}
              highlights={topAction.highlights}
            />
          </p>

          {/* CTA row */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrimary}
              className="inline-flex items-center gap-2 rounded-full bg-alloro-orange px-5 py-[11px] text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_16px_rgba(201,118,94,0.35)] transition-all hover:-translate-y-px hover:bg-[#B86650] hover:shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_8px_22px_rgba(201,118,94,0.45)]"
            >
              {topAction.cta?.primary?.label ?? "Open task"}
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-white/20 bg-transparent px-5 py-[11px] text-[13px] font-semibold text-[#F5F1EA] transition-colors hover:border-white/30 hover:bg-white/5"
            >
              Assign to team
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-full bg-transparent px-3 py-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8E8579] transition-colors hover:text-[#C5BEB1]"
            >
              Not now
            </button>
          </div>

          {/* Due footer */}
          <div className="mt-[22px] flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8E8579]">
            <Clock size={11} className="text-[#8E8579]" />
            {dueLabel}
          </div>
        </div>

        {/* RIGHT — Why panel */}
        <aside className="self-start rounded-xl border border-white/10 bg-black/30 p-[22px]">
          <div className="mb-[18px] flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8579]">
              Why this first
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-orange">
              {urgencyToTag(topAction.urgency)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3.5">
            {topAction.supporting_metrics.slice(0, 3).map((stat, i) => (
              <StatCell key={i} stat={stat} index={i} />
            ))}
          </div>

          <div className="my-[18px] border-t border-white/10" />

          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8579]">
              What this does
            </span>
          </div>
          <p className="text-[13px] leading-[1.6] text-[#E5DFD3]">
            <strong className="font-semibold text-[#B5D89C]">{head}</strong>
            {tail}
          </p>
          <p className="mt-2.5 text-[12px] leading-[1.55] text-[#8E8579]">
            {topAction.outcome.mechanism}
          </p>
        </aside>
      </div>
    </HeroShell>
  );
};

export function Hero() {
  const { userProfile } = useAuth();
  const organizationId = userProfile?.organizationId ?? null;
  const { selectedLocation } = useLocationContext();
  const locationId = selectedLocation?.id ?? null;

  const { topAction, isLoading, error, refetch } = useTopAction(
    organizationId,
    locationId
  );

  if (isLoading) return <HeroLoading />;
  if (error) {
    return <HeroError message={error.message} onRetry={refetch} />;
  }
  if (!topAction) return <HeroEmpty />;
  return <HeroBody topAction={topAction} />;
}

export default Hero;
