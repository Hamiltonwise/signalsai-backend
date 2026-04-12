/**
 * Monday Preview -- The product, rendered.
 *
 * This is not a feature. This is THE product shown before the email fires.
 * Dr. Pawlak just paid $1,500. She hasn't received a Monday email yet.
 * This card shows her exactly what it will look like, using her real data.
 *
 * The moment she sees her competitor's name, her specific finding, and
 * "Monday at 7:15 AM" with her data in it, the product becomes real.
 * That's the screenshot she sends to a colleague.
 *
 * Design: Apple Health single-card pattern. One story. Calm typography.
 * Mercury light-weight numbers. Linear color restraint.
 */

import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";

interface MondayData {
  finding: string | null;
  competitorName: string | null;
  action: string | null;
  score: number | null;
  rankPosition: number | null;
  location: string | null;
  reviewCount: number | null;
  competitorReviewCount: number | null;
  ozHook: string | null;
}

function buildPreview(data: MondayData, _practiceName: string, _firstName: string | null): {
  subject: string;
  body: string;
  action: string;
} {

  // Subject line: named, specific, never generic
  let subject: string;
  if (data.ozHook) {
    // Best case: Oz moment hook is the subject
    subject = data.ozHook.length > 60 ? data.ozHook.slice(0, 57) + "..." : data.ozHook;
  } else if (data.competitorName && data.competitorReviewCount && data.reviewCount) {
    const gap = data.competitorReviewCount - data.reviewCount;
    if (gap > 0) {
      subject = `${data.competitorName} has ${gap} more reviews than you`;
    } else {
      subject = `You lead ${data.competitorName} by ${Math.abs(gap)} reviews`;
    }
  } else if (data.location) {
    subject = `Your market in ${data.location} moved this week`;
  } else {
    subject = `Your market moved this week`;
  }

  // Body: one finding, plain English, specific
  let body: string;
  if (data.finding) {
    body = data.finding;
  } else if (data.competitorName && data.competitorReviewCount && data.reviewCount) {
    const gap = data.competitorReviewCount - data.reviewCount;
    if (gap > 0) {
      body = `${data.competitorName} has ${data.competitorReviewCount} reviews. You have ${data.reviewCount}. That gap of ${gap} reviews affects which business people click first when they search in ${data.location || "your market"}.`;
    } else {
      body = `You have ${data.reviewCount} reviews. ${data.competitorName} has ${data.competitorReviewCount}. You're ahead, and every new review compounds that lead.`;
    }
  } else if (data.score) {
    body = `Your Google Health Check shows ${data.reviewCount || "your"} reviews. This reflects how your online presence looks to someone searching for you right now.`;
  } else {
    body = `Alloro scanned your market this week. Your full report is in your dashboard.`;
  }

  // Action: one thing, verb-first, doable today
  let action: string;
  if (data.action) {
    action = data.action;
  } else if (data.competitorName && data.competitorReviewCount && data.reviewCount && data.competitorReviewCount > data.reviewCount) {
    action = "Ask your 3 most recent happy clients for a Google review this week.";
  } else {
    action = "Check your dashboard for your full market report.";
  }

  return { subject, body, action };
}

export default function MondayPreview() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;
  const locationId = selectedLocation?.id ?? null;
  const practiceName = selectedLocation?.name || userProfile?.practiceName || "Your Business";
  const firstName = userProfile?.firstName || null;

  // Pull data from existing endpoints
  const { data: dashCtx } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/dashboard-context" });
      return res?.success ? res : null;
    },
    staleTime: 30 * 60_000,
  });

  const { data: rankingData } = useQuery({
    queryKey: ["client-ranking", orgId, locationId],
    queryFn: async () => {
      if (!orgId) return null;
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/practice-ranking/latest?googleAccountId=${orgId}${locationId ? `&locationId=${locationId}` : ""}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.success || !json.rankings?.length) return null;
      const latest = json.rankings[0];
      const raw = latest.rawData ?? latest.raw_data ?? null;
      const competitors = raw?.competitors ?? [];
      const topComp = competitors.length > 0 ? competitors[0] : null;
      return {
        rankPosition: latest.rank_position ?? latest.rankPosition ?? null,
        location: latest.location || null,
        rankScore: latest.rank_score ?? latest.rankScore ?? null,
        topCompetitor: topComp ? { name: topComp.name, reviewCount: topComp.totalReviews ?? topComp.reviewCount ?? 0 } : null,
        clientReviews: raw?.client_gbp?.totalReviewCount ?? null,
      };
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const { data: agentData } = useQuery({
    queryKey: ["client-agent-data", orgId, locationId],
    queryFn: async () => {
      const res = await apiGet({ path: `/agents/data/latest?orgId=${orgId}${locationId ? `&locationId=${locationId}` : ""}` });
      return res?.success ? res : null;
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  // Extract the best finding from agent data or checkup context
  const checkupCtx = dashCtx?.checkup_context ?? null;
  let topFinding: string | null = null;
  let ozHook: string | null = null;

  // Try agent proofline first
  if (agentData?.agents?.proofline?.results) {
    try {
      const parsed = typeof agentData.agents.proofline.results === "string"
        ? JSON.parse(agentData.agents.proofline.results)
        : agentData.agents.proofline.results;
      const findings = parsed?.findings || parsed?.items;
      if (Array.isArray(findings) && findings.length > 0) {
        topFinding = findings[0].detail || findings[0].title || null;
      }
    } catch { /* ignore */ }
  }

  // Try checkup Oz moments
  if (!topFinding && checkupCtx?.data?.ozMoments) {
    const oz = checkupCtx.data.ozMoments;
    if (Array.isArray(oz) && oz.length > 0) {
      ozHook = oz[0].hook || null;
      topFinding = oz[0].implication || oz[0].hook || null;
    }
  }

  // Try checkup findings
  if (!topFinding && checkupCtx?.data?.findings) {
    const f = checkupCtx.data.findings;
    if (Array.isArray(f) && f.length > 0) {
      topFinding = f[0].detail || f[0].title || null;
    }
  }

  const mondayData: MondayData = {
    finding: topFinding,
    competitorName: rankingData?.topCompetitor?.name || checkupCtx?.data?.topCompetitor?.name || null,
    action: null,
    score: rankingData?.rankScore || checkupCtx?.score || null,
    rankPosition: rankingData?.rankPosition || checkupCtx?.data?.market?.rank || null,
    location: rankingData?.location || checkupCtx?.data?.market?.city || null,
    reviewCount: rankingData?.clientReviews || null,
    competitorReviewCount: rankingData?.topCompetitor?.reviewCount || checkupCtx?.data?.topCompetitor?.reviewCount || null,
    ozHook,
  };

  // Don't show if we have zero data
  const hasData = mondayData.finding || mondayData.competitorName || mondayData.score;
  if (!hasData) return null;

  const preview = buildPreview(mondayData, practiceName, firstName);

  // Get next Monday date
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  const mondayStr = nextMonday.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="card-supporting overflow-hidden">
      {/* Email header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-[#1A1D23]/5 flex items-center justify-center">
          <Mail className="w-4 h-4 text-[#1A1D23]/40" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-400">Your Monday briefing preview</p>
          <p className="text-xs text-gray-400">{mondayStr}, 7:15 AM</p>
        </div>
      </div>

      {/* Email preview */}
      <div className="rounded-xl border border-stone-200/60 bg-stone-50/80 p-5">
        {/* Subject */}
        <p className="text-base font-semibold text-[#1A1D23] leading-snug">
          {preview.subject}
        </p>

        {/* Body */}
        <p className="text-sm text-gray-500 leading-relaxed mt-3">
          {preview.body}
        </p>

        {/* Action */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-[0.05em] mb-1.5">One action</p>
          <p className="text-sm font-medium text-[#1A1D23]">
            {preview.action}
          </p>
        </div>

        {/* Sign-off */}
        <p className="text-xs text-gray-400 mt-4 italic">
          See you next Monday. -- Corey
        </p>
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400 mt-3 text-center">
        This arrives in your inbox every Monday. No action needed.
      </p>
    </div>
  );
}
