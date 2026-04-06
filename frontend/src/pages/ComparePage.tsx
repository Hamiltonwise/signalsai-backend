/**
 * Compare -- "How do I compare?"
 *
 * For the 20% who want to dig. Your numbers vs your competitor's numbers.
 * Side by side. Raw. Named. Every number links to verification.
 *
 * Sections:
 * 1. Your readings vs competitor's readings
 * 2. Competitors (named, tracked)
 * 3. Referral sources (who's sending, who stopped)
 * 4. Improvement actions (what to do, no point values)
 */

import { useState, useMemo, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { getPriorityItem } from "@/hooks/useLocalStorage";

import CompetitorComparison from "@/components/dashboard/CompetitorComparison";
import AddCompetitor from "@/components/dashboard/AddCompetitor";
import { ReferralMatrices, type ReferralEngineData } from "@/components/PMS/ReferralMatrices";
import { TopReferralSources } from "@/components/PMS/TopReferralSources";
import { PMSUploadWizardModal } from "@/components/PMS/PMSUploadWizardModal";

// ─── Collapsible Section ────────────────────────────────────────────

function Section({ title, defaultOpen = true, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-stone-50/50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">{title}</h2>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400" />
          : <ChevronRight className="w-4 h-4 text-gray-400" />
        }
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// ─── Error Boundary ────────────────────────────────────────────────

class CompareErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("[ComparePage] Render error:", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="text-base font-semibold text-[#1A1D23] mb-2">Comparison loading</p>
            <p className="text-sm text-gray-500">Your competitive data is being prepared. Try refreshing in a moment.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Component ──────────────────────────────────────────────────────

export default function ComparePage() {
  return (
    <CompareErrorBoundary>
      <ComparePageInner />
    </CompareErrorBoundary>
  );
}

// ─── Referral Category Tabs ────────────────────────────────────────

type ReferralCategory = "all" | "active" | "new" | "declining" | "dormant";

const CATEGORY_LABELS: { key: ReferralCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "declining", label: "Declining" },
  { key: "dormant", label: "Dormant" },
];

/** Maps trend_label from referral engine to our UI categories */
function trendToCategory(trend?: string): ReferralCategory {
  switch (trend) {
    case "increasing":
    case "stable":
      return "active";
    case "new":
      return "new";
    case "decreasing":
      return "declining";
    case "dormant":
      return "dormant";
    default:
      return "active"; // default to active if no trend
  }
}

function filterReferralData(
  data: ReferralEngineData,
  category: ReferralCategory
): ReferralEngineData {
  if (category === "all") return data;

  const filterByTrend = <T extends { trend_label?: string }>(items?: T[]): T[] => {
    if (!items) return [];
    return items.filter((item) => trendToCategory(item.trend_label) === category);
  };

  return {
    ...data,
    doctor_referral_matrix: filterByTrend(data.doctor_referral_matrix),
    non_doctor_referral_matrix: filterByTrend(data.non_doctor_referral_matrix),
  };
}

function countByCategory(data: ReferralEngineData): Record<ReferralCategory, number> {
  const counts: Record<ReferralCategory, number> = { all: 0, active: 0, new: 0, declining: 0, dormant: 0 };
  const allItems = [
    ...(data.doctor_referral_matrix || []),
    ...(data.non_doctor_referral_matrix || []),
  ];
  counts.all = allItems.length;
  for (const item of allItems) {
    const cat = trendToCategory(item.trend_label);
    counts[cat]++;
  }
  return counts;
}

function ReferralSourcesContent({
  referralData,
  referralSources,
  hasReferralData,
  onUploadClick,
}: {
  referralData: any;
  referralSources: any;
  hasReferralData: boolean;
  onUploadClick: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<ReferralCategory>("all");

  // Check if referral engine data has trend labels (enables categorization)
  const hasTrendData = useMemo(() => {
    if (!referralData) return false;
    const allItems = [
      ...(referralData.doctor_referral_matrix || []),
      ...(referralData.non_doctor_referral_matrix || []),
    ];
    return allItems.some((item: any) => item.trend_label);
  }, [referralData]);

  const categoryCounts = useMemo(() => {
    if (!referralData || !hasTrendData) return null;
    return countByCategory(referralData as ReferralEngineData);
  }, [referralData, hasTrendData]);

  const filteredReferralData = useMemo(() => {
    if (!referralData) return null;
    if (!hasTrendData || activeCategory === "all") return referralData;
    return filterReferralData(referralData as ReferralEngineData, activeCategory);
  }, [referralData, activeCategory, hasTrendData]);

  if (referralData) {
    return (
      <div className="space-y-4">
        {/* Category tabs -- only when trend data exists */}
        {hasTrendData && (
          <div className="flex flex-wrap gap-2">
            {CATEGORY_LABELS.map(({ key, label }) => {
              const count = categoryCounts?.[key] ?? 0;
              const isActive = activeCategory === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    isActive
                      ? "bg-[#D56753]/10 text-[#D56753]"
                      : "text-gray-500 hover:text-[#1A1D23] hover:bg-stone-100/80"
                  }`}
                >
                  {label}
                  {key !== "all" && count > 0 && (
                    <span className="ml-1.5 text-xs opacity-60">({count})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <ReferralMatrices referralData={filteredReferralData as ReferralEngineData} />
      </div>
    );
  }

  if (hasReferralData && referralSources?.referral_sources?.length > 0) {
    return <TopReferralSources data={referralSources.referral_sources} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#1A1D23]/60">
        Referral tracking shows who sends you business, who's going quiet, and where to focus your relationship-building.
      </p>
      <p className="text-sm text-[#1A1D23]/40">
        Upload your business data to see referral sources here.
      </p>
      <button
        onClick={onUploadClick}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-medium hover:brightness-105 transition-all"
      >
        Upload business data
      </button>
    </div>
  );
}

function ComparePageInner() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: rankingRaw } = useQuery<any>({
    queryKey: ["compare-ranking", orgId, selectedLocation?.id],
    queryFn: async () => {
      const locParam = selectedLocation?.id ? `&locationId=${selectedLocation.id}` : "";
      const token = getPriorityItem("auth_token") || getPriorityItem("token");
      const res = await fetch(
        `/api/practice-ranking/latest?googleAccountId=${orgId || ""}${locParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.rankings?.[0] || data?.results?.[0] || null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: competitors, refetch: refetchCompetitors } = useQuery<any>({
    queryKey: ["compare-competitors", orgId],
    queryFn: () => apiGet({ path: "/user/competitors" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: referralData } = useQuery<any>({
    queryKey: ["compare-referrals", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: `/agents/getLatestReferralEngineOutput/${orgId}` });
      return res?.output || null;
    },
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Direct referral sources from PMS upload
  const { data: referralSources } = useQuery<any>({
    queryKey: ["compare-referral-sources", orgId],
    queryFn: () => apiGet({ path: "/user/export" }).catch(() => null),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  const { data: ctx } = useQuery<any>({
    queryKey: ["compare-context", orgId],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const checkupData = ctx?.org?.checkup_data || null;
  const place = checkupData?.place || {};
  const topCompetitor = checkupData?.topCompetitor || rankingRaw?.rawData?.topCompetitor || null;
  const competitorName = typeof topCompetitor === "string" ? topCompetitor : topCompetitor?.name || null;
  const competitorReviews = typeof topCompetitor === "object" ? topCompetitor?.reviewCount : null;
  const orgName = ctx?.org?.name || "";
  // city available from checkupData?.market?.city for future market context

  const clientRating = place.rating || rankingRaw?.rawData?.clientRating || 0;
  const clientReviews = place.reviewCount || rankingRaw?.rawData?.clientReviews || 0;
  const clientPhotos = place.photosCount || place.photos?.length || rankingRaw?.rawData?.clientPhotos || 0;

  const googleSearchUrl = orgName ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}` : null;
  const competitorSearchUrl = competitorName ? `https://www.google.com/search?q=${encodeURIComponent(competitorName)}` : null;

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] tracking-tight">How You Compare</h1>
          {competitorName && (
            <p className="text-sm text-gray-500 mt-1">
              Your top competitor: {competitorName}
              {competitorSearchUrl && (
                <a href={competitorSearchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 ml-2 text-[#D56753] hover:underline">
                  Verify <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </p>
          )}
        </motion.div>

        {/* Side-by-Side Comparison */}
        {competitorName && (
          <Section title="You vs Your Top Competitor" defaultOpen={true}>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="text-left py-4 px-2 text-gray-400 font-semibold text-xs uppercase tracking-wider">Reading</th>
                    <th className="text-right py-4 px-2 text-gray-400 font-semibold text-xs uppercase tracking-wider">You</th>
                    <th className="text-right py-4 px-2 text-gray-400 font-semibold text-xs uppercase tracking-wider">{competitorName.split(/\s/).slice(0, 2).join(" ")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <tr>
                    <td className="py-4 px-2 text-[#1A1D23]">Star Rating</td>
                    <td className="py-4 px-2 text-right font-semibold text-[#1A1D23]">{clientRating || "N/A"}</td>
                    <td className="py-4 px-2 text-right text-gray-500">{topCompetitor?.rating || "N/A"}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-2 text-[#1A1D23]">Reviews</td>
                    <td className={`py-4 px-2 text-right font-semibold ${clientReviews >= (competitorReviews || 0) ? "text-emerald-600" : "text-red-500"}`}>
                      {clientReviews || 0}
                    </td>
                    <td className="py-4 px-2 text-right text-gray-500">{competitorReviews || "N/A"}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-2 text-[#1A1D23]">Photos</td>
                    <td className={`py-4 px-2 text-right font-semibold ${clientPhotos >= (topCompetitor?.photosCount || 0) ? "text-emerald-600" : "text-amber-500"}`}>
                      {clientPhotos || 0}
                    </td>
                    <td className="py-4 px-2 text-right text-gray-500">{topCompetitor?.photosCount || "N/A"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-4">
              {googleSearchUrl && (
                <a href={googleSearchUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold hover:underline">
                  Verify your data <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {competitorSearchUrl && (
                <a href={competitorSearchUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold hover:underline">
                  Verify competitor <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <p className="text-xs text-[#1A1D23]/30 mt-4">
              Alloro measures from a fixed point so your trend is always comparable week to week.
            </p>
          </Section>
        )}

        {/* What to Do */}
        <Section title="What to Focus On" defaultOpen={true}>
          <div className="space-y-6">
            {clientReviews < (competitorReviews || 0) && (
              <div className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-red-500 mt-2.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#1A1D23]">Close the review gap</p>
                  <p className="text-sm text-gray-500 mt-1">
                    You have {clientReviews} reviews. {competitorName} has {competitorReviews}.
                    Ask your 3 most recent clients for a review this week.
                  </p>
                </div>
              </div>
            )}
            {clientPhotos < 10 && (
              <div className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 mt-2.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#1A1D23]">Add photos to your profile</p>
                  <p className="text-sm text-gray-500 mt-1">
                    You have {clientPhotos} photos. Businesses with 10+ photos get significantly more engagement.
                  </p>
                </div>
              </div>
            )}
            {clientReviews >= (competitorReviews || 0) && clientPhotos >= 10 && (
              <p className="text-sm text-gray-500">
                You're ahead on all comparable readings. Keep the momentum.
              </p>
            )}
            {!competitorName && clientReviews === 0 && clientPhotos === 0 && (
              <div className="text-sm text-gray-500">
                <p className="font-semibold text-[#1A1D23] mb-1">Your competitive picture is building</p>
                <p>Alloro is analyzing your market. Add a competitor below to see a side-by-side comparison of reviews, star rating, and photos. You will see exactly where you lead and where to close the gap.</p>
              </div>
            )}
          </div>
        </Section>

        {/* Competitors */}
        <Section title="Tracked Competitors" defaultOpen={true}>
          <div className="space-y-3">
            {competitors?.competitors?.map((comp: any) => (
              <CompetitorComparison
                key={comp.id || comp.placeId}
                competitor={comp}
                clientRating={clientRating}
                clientReviews={clientReviews}
                clientPhotos={clientPhotos}
                clientLastReviewDays={null}
              />
            ))}
            <AddCompetitor
              currentCount={competitors?.competitors?.length || 0}
              maxCount={3}
              onAdded={() => refetchCompetitors()}
            />
          </div>
        </Section>

        {/* Referral Sources -- per constitution, Compare includes referrals */}
        <Section title="Referral Sources" defaultOpen={!!(referralData || ctx?.hasReferralData)}>
          <ReferralSourcesContent
            referralData={referralData}
            referralSources={referralSources}
            hasReferralData={ctx?.hasReferralData}
            onUploadClick={() => setUploadOpen(true)}
          />
        </Section>

        {/* PMS Upload Modal */}
        <PMSUploadWizardModal
          isOpen={uploadOpen}
          onClose={() => setUploadOpen(false)}
          clientId={String(orgId || "")}
          locationId={selectedLocation?.id || null}
          onSuccess={() => setUploadOpen(false)}
        />

      </div>
    </div>
  );
}
