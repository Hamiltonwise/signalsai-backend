/**
 * Compare -- "How do I compare?"
 *
 * For the 20% who want to dig. Garrison checking daily.
 * Kargoli tracking referrals. One scrollable page, not 6 tabs.
 *
 * Sections:
 * 1. Score + sub-scores (expandable improvement actions)
 * 2. Position over time (chart)
 * 3. Competitors (named, ranked, tracked)
 * 4. Referral sources (who's sending, who stopped)
 * 5. Score simulator ("what if")
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { getPriorityItem } from "@/hooks/useLocalStorage";

// Import existing components from the parts shelf
import ScoreImprovementPlan from "@/components/dashboard/ScoreImprovementPlan";
import ScoreSimulator from "@/components/dashboard/ScoreSimulator";
import CompetitorComparison from "@/components/dashboard/CompetitorComparison";
import AddCompetitor from "@/components/dashboard/AddCompetitor";
import GrowthChart from "@/components/dashboard/GrowthChart";
import { ReferralMatrices, type ReferralEngineData } from "@/components/PMS/ReferralMatrices";

// ─── Collapsible Section ────────────────────────────────────────────

function Section({ title, defaultOpen = true, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors"
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

// ─── Component ──────────────────────────────────────────────────────

export default function ComparePage() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;

  // Ranking data
  const { data: rankingRaw } = useQuery<any>({
    queryKey: ["compare-ranking", orgId, selectedLocation?.id],
    queryFn: async () => {
      const locParam = selectedLocation?.id ? `&locationId=${selectedLocation.id}` : "";
      const token = getPriorityItem("auth_token") || getPriorityItem("token");
      const res = await fetch(
        `/api/practice-ranking/latest?googleAccountId=${userProfile?.googleAccountId || ""}${locParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.rankings?.[0] || data?.results?.[0] || null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // Tracked competitors
  const { data: competitors, refetch: refetchCompetitors } = useQuery<any>({
    queryKey: ["compare-competitors", orgId],
    queryFn: () => apiGet({ path: "/user/competitors" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // Referral data
  const { data: referralData } = useQuery<any>({
    queryKey: ["compare-referrals", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: `/agents/getLatestReferralEngineOutput/${orgId}` });
      return res?.output || null;
    },
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Dashboard context for checkup data
  const { data: ctx } = useQuery<any>({
    queryKey: ["compare-context", orgId],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const checkupData = ctx?.org?.checkup_data || null;
  const score = ctx?.org?.checkup_score || rankingRaw?.rankScore || null;
  const position = rankingRaw?.rankPosition || null;
  const city = rankingRaw?.location?.split(",")[0]?.trim() || null;
  const topCompetitor = rankingRaw?.rawData?.topCompetitor || null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-lg font-semibold text-[#1A1D23]">How You Compare</h1>
          {position && city && (
            <p className="text-sm text-gray-500 mt-1">
              #{position} in {city}{topCompetitor ? ` -- ${topCompetitor.name} leads with ${topCompetitor.reviewCount} reviews` : ""}
            </p>
          )}
        </motion.div>

        {/* Score + Sub-scores */}
        <Section title="Your Score" defaultOpen={true}>
          {score ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-semibold text-[#1A1D23]">{score}</span>
                <span className="text-sm text-gray-400">/100</span>
              </div>
              <ScoreImprovementPlan />
            </div>
          ) : (
            <p className="text-sm text-gray-500">Your score is being calculated. Check back after your first Monday email.</p>
          )}
        </Section>

        {/* Position Over Time */}
        <Section title="Position Over Time" defaultOpen={true}>
          {rankingRaw?.rawData?.positionHistory ? (
            <GrowthChart
              data={rankingRaw.rawData.positionHistory}
              competitor_data={rankingRaw.rawData.competitorHistory}
              practice_name={ctx?.org?.name || "Your Business"}
            />
          ) : (
            <p className="text-sm text-gray-500">
              Position tracking begins after your first Monday email. Check back next week.
            </p>
          )}
        </Section>

        {/* Competitors */}
        <Section title="Competitors" defaultOpen={true}>
          <div className="space-y-3">
            {competitors?.competitors?.map((comp: any) => (
              <CompetitorComparison
                key={comp.id || comp.placeId}
                competitor={comp}
                clientRating={rankingRaw?.rawData?.clientRating || checkupData?.place?.rating || 0}
                clientReviews={rankingRaw?.rawData?.clientReviews || checkupData?.place?.reviewCount || 0}
                clientPhotos={rankingRaw?.rawData?.clientPhotos || checkupData?.place?.photos?.length || 0}
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

        {/* Referral Sources */}
        {referralData && (
          <Section title="Referral Sources" defaultOpen={false}>
            <ReferralMatrices data={referralData as ReferralEngineData} />
          </Section>
        )}

        {/* Score Simulator */}
        <Section title="What If?" defaultOpen={false}>
          <ScoreSimulator />
        </Section>

      </div>
    </div>
  );
}
