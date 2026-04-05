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

import { useState, Component, type ReactNode } from "react";
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
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-stone-100/50 transition-colors"
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

function ComparePageInner() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;

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
          <h1 className="text-2xl font-semibold text-[#1A1D23]">How You Compare</h1>
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
                <p className="font-semibold text-[#1A1D23] mb-1">Track a competitor to unlock this section</p>
                <p>When you add a competitor below, Alloro compares your Google reviews, star rating, and photos side by side so you can see exactly where you lead and where to close the gap.</p>
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

        {/* Referral Sources */}
        {referralData && (
          <Section title="Referral Sources" defaultOpen={false}>
            <ReferralMatrices referralData={referralData as ReferralEngineData} />
          </Section>
        )}

      </div>
    </div>
  );
}
