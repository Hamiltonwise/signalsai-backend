import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../../api";
import { useFormSubmissionsTimeseries } from "../../../hooks/queries/useFormSubmissionsTimeseries";
import type { TimeseriesPoint } from "../../../api/formSubmissionsTimeseries";
import Sparkline from "./Sparkline";

/**
 * WebsiteCard — Form submissions card for the Focus dashboard.
 *
 * Reads:
 *   - useFormSubmissionsTimeseries('12m') for the 12-month sparkline series.
 *   - useFormSubmissionsStats (defined inline below) for the headline counts.
 *     Wraps the existing /user/website/form-submissions/stats endpoint that
 *     DashboardOverview.tsx:402 already calls. Kept inline per spec note.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T14)
 *
 * Visual reference:
 *   - ~/Desktop/another-design/project/cards.jsx :: WebsiteCard
 *   - ~/Desktop/another-design/project/Focus Dashboard.html lines 556-712
 */

interface FormSubmissionsStats {
  unreadCount: number;
  flaggedCount: number;
  verifiedCount: number;
}

interface FormSubmissionsStatsResponse {
  success: boolean;
  unreadCount?: number;
  flaggedCount?: number;
  verifiedCount?: number;
  errorMessage?: string;
}

async function fetchFormSubmissionsStats(): Promise<FormSubmissionsStats> {
  const result = (await apiGet({
    path: "/user/website/form-submissions/stats",
  })) as FormSubmissionsStatsResponse;

  if (!result?.success) {
    throw new Error(
      result?.errorMessage || "Failed to load form submission stats",
    );
  }
  return {
    unreadCount: result.unreadCount ?? 0,
    flaggedCount: result.flaggedCount ?? 0,
    verifiedCount: result.verifiedCount ?? 0,
  };
}

function useFormSubmissionsStats() {
  return useQuery<FormSubmissionsStats>({
    queryKey: ["formSubmissionsStats"],
    queryFn: fetchFormSubmissionsStats,
    staleTime: 5 * 60 * 1000,
  });
}

const CARD_BG = "#FDFDFD";
const CARD_BORDER = "#E8E4DD";
const BRAND_ORANGE = "#D66853";
const MUTED = "#8E8579";
const INK = "#1F1B16";

const FRAUNCES =
  "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', serif";

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col"
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: "24px 24px 22px",
      }}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2.5 flex items-center gap-2 font-bold uppercase"
      style={{ color: MUTED, fontSize: 10, letterSpacing: "0.16em" }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: INK }}
      />
      {children}
    </div>
  );
}

function SkeletonShell() {
  return (
    <CardShell>
      <Eyebrow>Website · Form submissions</Eyebrow>
      <div className="space-y-3">
        <div className="h-9 w-40 animate-pulse rounded-md bg-neutral-100" />
        <div className="h-3 w-56 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="mt-5 h-16 w-full animate-pulse rounded-md bg-neutral-100" />
      <div className="mt-4 h-12 w-full animate-pulse rounded-md bg-orange-50" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-16 animate-pulse rounded bg-neutral-100" />
      </div>
    </CardShell>
  );
}

interface ErrorShellProps {
  onRetry: () => void;
  message: string;
}

function ErrorShell({ onRetry, message }: ErrorShellProps) {
  return (
    <CardShell>
      <Eyebrow>Website · Form submissions</Eyebrow>
      <div
        className="rounded-md border px-3 py-2 text-xs"
        style={{
          borderColor: "#F3D6C4",
          background: "#FFF7F2",
          color: "#8A4A36",
        }}
      >
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md px-2.5 py-1 text-xs font-semibold"
        style={{ color: BRAND_ORANGE }}
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </CardShell>
  );
}

function EmptyShell() {
  return (
    <CardShell>
      <Eyebrow>Website · Form submissions</Eyebrow>
      <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
        No form submissions yet. Once leads start coming in through your
        website, they will show up here with verified counts and trend.
      </p>
    </CardShell>
  );
}

function pctDelta(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

function lastVsPrior(points: TimeseriesPoint[]): {
  current: number;
  prior: number;
} {
  if (points.length === 0) return { current: 0, prior: 0 };
  if (points.length === 1) return { current: points[0].verified, prior: 0 };
  const current = points[points.length - 1].verified;
  const prior = points[points.length - 2].verified;
  return { current, prior };
}

function monthLabel(month: string | undefined): string {
  if (!month) return "";
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  const monthIndex = parseInt(m[2], 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return month;
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return names[monthIndex];
}

function TrendPill({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <span
      className="ml-auto font-bold"
      style={{ fontSize: 11, color: up ? "#4F8A5B" : "#B3503E" }}
    >
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {delta}%
    </span>
  );
}

const WebsiteCard: React.FC = () => {
  const navigate = useNavigate();
  const stats = useFormSubmissionsStats();
  const series = useFormSubmissionsTimeseries("12m");

  const isLoading = stats.isLoading || series.isLoading;
  const isError = stats.isError || series.isError;

  const retry = () => {
    stats.refetch();
    series.refetch();
  };

  if (isLoading) return <SkeletonShell />;

  if (isError) {
    const msg =
      (stats.error as Error)?.message ||
      (series.error as Error)?.message ||
      "Could not load website data.";
    return <ErrorShell onRetry={retry} message={msg} />;
  }

  const points = series.data ?? [];
  const verifiedCount = stats.data?.verifiedCount ?? 0;
  const unread = stats.data?.unreadCount ?? 0;
  const flagged = stats.data?.flaggedCount ?? 0;

  if (points.length === 0 && verifiedCount === 0) {
    return <EmptyShell />;
  }

  const { current, prior } = lastVsPrior(points);
  const delta = pctDelta(current, prior);

  const sparkData = points.map((p) => p.verified);
  const firstLabel = monthLabel(points[0]?.month);
  const middleLabel = monthLabel(
    points[Math.floor(points.length / 2)]?.month,
  );
  const lastLabel = monthLabel(points[points.length - 1]?.month);

  return (
    <CardShell>
      <Eyebrow>Website · Form submissions</Eyebrow>

      <div className="flex flex-wrap items-baseline gap-2">
        <span
          style={{
            fontFamily: FRAUNCES,
            fontWeight: 500,
            fontSize: 32,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: INK,
          }}
        >
          {verifiedCount}
        </span>
        <span className="font-medium" style={{ fontSize: 12, color: MUTED }}>
          verified leads
        </span>
        <TrendPill delta={delta} />
      </div>

      <div
        className="mt-1.5 leading-relaxed"
        style={{ fontSize: 12, color: MUTED }}
      >
        {unread} unread · {flagged} flagged · vs last 30 days
      </div>

      <div className="mt-4">
        <Sparkline data={sparkData} color={BRAND_ORANGE} fillId="ws-grad" />
        <div
          className="mt-1 grid font-semibold uppercase"
          style={{
            gridTemplateColumns: "1fr 1fr 1fr",
            fontSize: 9.5,
            letterSpacing: "0.1em",
            color: MUTED,
          }}
        >
          <span>{firstLabel}</span>
          <span style={{ textAlign: "center" }}>{middleLabel}</span>
          <span style={{ textAlign: "right" }}>{lastLabel}</span>
        </div>
      </div>

      <div
        className="mt-3.5 rounded-[10px] border px-3 py-2.5 leading-relaxed"
        style={{
          background: "#FFF7F2",
          borderColor: "#F3D6C4",
          color: "#8A4A36",
          fontSize: 12,
        }}
      >
        <strong style={{ color: BRAND_ORANGE, fontWeight: 700 }}>
          Coming soon:
        </strong>{" "}
        sessions, bounce rate, avg session duration via Rybbit.
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/dfy/website?view=submissions")}
          className="inline-flex items-center gap-1.5 bg-transparent font-semibold"
          style={{ color: BRAND_ORANGE, fontSize: 12 }}
        >
          View submissions
          <ArrowRight size={11} />
        </button>
        <span style={{ fontSize: 11, color: MUTED }}>Last 12 mo</span>
      </div>
    </CardShell>
  );
};

export default WebsiteCard;
