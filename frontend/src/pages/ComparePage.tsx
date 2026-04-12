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

// ─── Component ──────────────────────────────────────────────────────

function ComparePageInner() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;

  const { data: rankingRaw } = useQuery<any>({
    queryKey: ["compare-ranking", orgId, selectedLocation?.id],
    queryFn: async () => {
      const locParam = selectedLocation?.id ? `?locationId=${selectedLocation.id}` : "";
      const token = getPriorityItem("auth_token") || getPriorityItem("token");
      const res = await fetch(
        `/api/user/ranking/latest${locParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.rankings?.[0] || data?.results?.[0] || null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: ctx } = useQuery<any>({
    queryKey: ["compare-context", orgId, selectedLocation?.id],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const checkupData = ctx?.org?.checkup_data || null;
  const place = checkupData?.place || {};
  // Prefer ranking data (filtered, location-aware) over stale checkup data
  const topCompetitor = rankingRaw?.rawData?.topCompetitor || checkupData?.topCompetitor || null;
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
          <h1 className="text-2xl font-semibold text-[#1A1D23] tracking-tight">How Easily People Find You</h1>
          <p className="text-sm text-gray-400 mt-1">Alloro tracks your ranking against every competitor in your market.</p>
          {competitorName && (
            <p className="text-sm text-gray-500 mt-1">
              Your top competitor: {competitorName}
              {competitorSearchUrl && (
                <a href={competitorSearchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 ml-2 text-xs text-[#D56753] font-semibold hover:underline">
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
                  {clientRating > 0 && topCompetitor?.rating && (
                    <tr>
                      <td className="py-4 px-2 text-[#1A1D23]">Star Rating</td>
                      <td className="py-4 px-2 text-right font-semibold text-[#1A1D23]">{clientRating}</td>
                      <td className="py-4 px-2 text-right text-[#1A1D23]">{topCompetitor.rating}</td>
                    </tr>
                  )}
                  {(clientReviews > 0 || competitorReviews) && competitorReviews && (
                    <tr>
                      <td className="py-4 px-2 text-[#1A1D23]">Reviews</td>
                      <td className="py-4 px-2 text-right font-semibold text-[#1A1D23]">{clientReviews || 0}</td>
                      <td className="py-4 px-2 text-right text-[#1A1D23]">{competitorReviews}</td>
                    </tr>
                  )}
                  {clientPhotos > 0 && topCompetitor?.photosCount && (
                    <tr>
                      <td className="py-4 px-2 text-[#1A1D23]">Photos</td>
                      <td className="py-4 px-2 text-right font-semibold text-[#1A1D23]">{clientPhotos}</td>
                      <td className="py-4 px-2 text-right text-[#1A1D23]">{topCompetitor.photosCount}</td>
                    </tr>
                  )}
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
            <p className="text-xs text-gray-400 mt-4">
              Alloro measures from a fixed point so your trend is always comparable week to week.
            </p>
          </Section>
        )}

        {/* Market Intelligence */}
        <Section title="What This Means" defaultOpen={true}>
          <div className="space-y-5">
            {clientReviews < (competitorReviews || 0) && competitorName && (() => {
              const gap = (competitorReviews || 0) - clientReviews;
              const weeksToClose = Math.ceil(gap / 2);
              const timeframe = weeksToClose <= 4
                ? `${weeksToClose} week${weeksToClose !== 1 ? "s" : ""}`
                : weeksToClose <= 52
                  ? `${Math.ceil(weeksToClose / 4)} months`
                  : `${(weeksToClose / 52).toFixed(1)} years`;
              const clientPct = competitorReviews ? Math.round((clientReviews / competitorReviews) * 100) : 0;
              return (
                <div className="space-y-3">
                  {/* Visual gap bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      <span>Review Volume</span>
                      <span>Gap: {gap}</span>
                    </div>
                    <div className="relative w-full h-3 bg-stone-200/60 rounded-full overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.max(clientPct, 3)}%` }}
                      />
                      <div
                        className="absolute right-0 top-0 h-full bg-[#D56753]/30 rounded-full transition-all"
                        style={{ width: `${Math.max(100 - clientPct, 3)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-600 font-semibold">You: {clientReviews}</span>
                      <span className="text-[#D56753] font-semibold">{competitorName.split(/\s/).slice(0, 2).join(" ")}: {competitorReviews}</span>
                    </div>
                  </div>

                  <p className="text-sm text-[#1A1D23] font-semibold">
                    At 2 reviews per week, you close this gap in {timeframe}.
                  </p>
                  <p className="text-sm text-gray-500">
                    Google weights review volume heavily in local pack rankings and AI-generated answers. This gap is the single largest factor in your competitive position. Every review also adds keywords Google uses to match you with searches in your area.
                  </p>
                </div>
              );
            })()}
            {clientReviews >= (competitorReviews || 0) && competitorName && competitorReviews && (() => {
              const lead = clientReviews - (competitorReviews || 0);
              const leadInterpretation = lead > 500
                ? "That lead is a moat. No competitor can close a gap that size quickly. Your job is to maintain, not sprint."
                : lead > 100
                  ? "That is a significant lead. Consistent effort widens it further. Alloro watches for any shift."
                  : lead > 20
                    ? "A solid lead, but closeable if a competitor gets aggressive. Keep the pace."
                    : lead > 0
                      ? "A narrow lead. One strong month from a competitor could erase it. Stay consistent."
                      : "You are tied. Every new review shifts the balance.";
              return (
                <div>
                  <p className="text-sm font-semibold text-[#1A1D23]">
                    You lead {competitorName} by {lead} reviews.
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {leadInterpretation}
                  </p>
                </div>
              );
            })()}
            {clientPhotos < 10 && clientPhotos >= 0 && (
              <div>
                <p className="text-sm font-semibold text-[#1A1D23]">
                  {clientPhotos} photo{clientPhotos !== 1 ? "s" : ""} on your profile
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Businesses with 10+ photos see measurably more engagement on Google. Photos signal an active, maintained business.
                </p>
              </div>
            )}
            {!competitorName && clientReviews === 0 && clientPhotos === 0 && (
              <div className="text-sm text-gray-500">
                <p className="font-semibold text-[#1A1D23] mb-1">Your competitive picture is building</p>
                <p>Alloro is analyzing your market. Your side-by-side comparison will appear here once competitor data is available.</p>
              </div>
            )}
          </div>
        </Section>

        {/* How People Reach You (GBP Performance) */}
        {(() => {
          const perfData = rankingRaw?.rawData?.client_gbp?.performance;
          if (!perfData) return null;
          const calls = perfData.calls || 0;
          const directions = perfData.directions || 0;
          const clicks = perfData.clicks || 0;
          const total = calls + directions + clicks;
          if (total === 0) return null;
          return (
            <Section title="How People Reach You" defaultOpen={true}>
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  These numbers come from your Google Business Profile. They show how many people took action after finding you.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  {calls > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-[#1A1D23]">{calls}</p>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Calls</p>
                    </div>
                  )}
                  {directions > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-[#1A1D23]">{directions}</p>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Directions</p>
                    </div>
                  )}
                  {clicks > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-[#1A1D23]">{clicks}</p>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Website clicks</p>
                    </div>
                  )}
                </div>
              </div>
            </Section>
          );
        })()}

        {/* Full Competitor Landscape */}
        {(() => {
          const rawData = rankingRaw?.rawData || rankingRaw?.raw_data;
          const rawCompetitors = rawData?.competitors;
          if (!Array.isArray(rawCompetitors) || rawCompetitors.length < 2) return null;
          // Filter out the client's own locations (same brand name prefix)
          const orgNameNorm = (orgName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const allCompetitors = orgNameNorm
            ? rawCompetitors.filter((c: any) => {
                const cName = (c.name || c.displayName?.text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                return !cName.startsWith(orgNameNorm) && !orgNameNorm.startsWith(cName);
              })
            : rawCompetitors;
          if (allCompetitors.length === 0) return null;
          return (
            <Section title={`Your Market (${allCompetitors.length} competitors)`} defaultOpen={true}>
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  Every competitor Alloro found in your market. Sorted by review volume.
                </p>
                <div className="space-y-2">
                  {allCompetitors
                    .sort((a: any, b: any) => (b.userRatingCount || b.reviewCount || 0) - (a.userRatingCount || a.reviewCount || 0))
                    .map((c: any, i: number) => {
                      const name = c.name || c.displayName?.text || "Unknown";
                      const reviews = c.userRatingCount || c.reviewCount || c.totalReviews || 0;
                      const rating = c.rating || c.averageRating || 0;
                      const isTop = i === 0;
                      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(name)}`;
                      return (
                        <div key={i} className={`flex items-center justify-between py-3 px-4 rounded-xl ${isTop ? "bg-[#D56753]/5 border border-[#D56753]/10" : "bg-stone-50/80 border border-stone-200/60"}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-semibold text-gray-400 w-5 shrink-0">{i + 1}</span>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold truncate ${isTop ? "text-[#D56753]" : "text-[#1A1D23]"}`}>
                                {name}
                              </p>
                              {rating > 0 && (
                                <p className="text-xs text-gray-400">{Number(rating).toFixed(1)} stars</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-[#1A1D23]">{reviews}</p>
                              <p className="text-xs text-gray-400">
                                {(c.reviewsLast30d != null && c.reviewsLast30d > 0)
                                  ? `+${c.reviewsLast30d} this month`
                                  : "reviews"
                                }
                              </p>
                            </div>
                            <a href={searchUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[#D56753]/60 hover:text-[#D56753] transition-colors">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {clientReviews > 0 && (
                  <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-emerald-600 w-5">You</span>
                      <p className="text-sm font-semibold text-emerald-700">{orgName || "Your business"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-700">{clientReviews}</p>
                      <p className="text-xs text-emerald-500">reviews</p>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          );
        })()}

        {/* Google Business Profile completeness */}
        <Section title="Google Business Profile" defaultOpen={true}>
          {(() => {
            const gbpFields = [
              { name: "Phone", has: !!(place.hasPhone || place.phone || place.nationalPhoneNumber || place.internationalPhoneNumber) },
              { name: "Hours", has: !!(place.hasHours || place.hours || place.regularOpeningHours) },
              { name: "Website", has: !!(place.hasWebsite || place.websiteUri || place.website) },
              { name: "Photos", has: (place.photosCount || place.photoCount || place.photos?.length || 0) > 0 },
              { name: "Description", has: !!(place.hasEditorialSummary || place.editorialSummary) },
            ];
            const complete = gbpFields.filter(f => f.has).length;
            const missing = gbpFields.filter(f => !f.has).map(f => f.name);
            return (
              <div className="space-y-2">
                <p className="text-sm text-[#1A1D23]">
                  Profile completeness: <span className="font-semibold">{complete}/5</span>
                </p>
                {missing.length > 0 && (
                  <p className="text-sm text-gray-500">Missing: {missing.join(", ")}</p>
                )}
                {missing.length === 0 && (
                  <p className="text-sm text-gray-500">All fields complete.</p>
                )}
                {googleSearchUrl && (
                  <a href={googleSearchUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold hover:underline mt-1">
                    Verify on Google <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            );
          })()}
        </Section>


        {/* PMS Upload Modal */}
      </div>
    </div>
  );
}
