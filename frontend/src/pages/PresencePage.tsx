/**
 * Presence -- "What does my online presence look like?"
 *
 * The mirror. What a customer sees when they Google you.
 *
 * Sections:
 * 1. Your website (preview + natural language editor)
 * 2. Your GBP profile (completeness, performance: calls/directions/clicks)
 * 3. Search presence (focus keywords, positions, SEO score)
 * 4. Compliance check (FTC-risky claims flagged)
 */

import { useState, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Globe,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  PenLine,
  Sparkles,
  Clock,
} from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

// Import existing components from parts shelf
import GBPConnectCard from "@/components/dashboard/GBPConnectCard";

// Error boundary to prevent page crash from taking out the entire layout
class PresenceErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("[PresencePage] Render error:", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
          <div className="text-center max-w-sm">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Your presence data is loading. Try refreshing in a moment.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
// FocusKeywords removed: not a vital sign per constitution

// ─── Collapsible Section ────────────────────────────────────────────

function Section({ title, icon: Icon, defaultOpen = true, children }: {
  title: string;
  icon?: any;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">{title}</h2>
        </div>
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

export default function PresencePage() {
  return (
    <PresenceErrorBoundary>
      <PresencePageInner />
    </PresenceErrorBoundary>
  );
}

function PresencePageInner() {
  const navigate = useNavigate();
  const { userProfile, hasGoogleConnection } = useAuth();
  const orgId = userProfile?.organizationId || null;

  // Website data
  const { data: websiteData } = useQuery<any>({
    queryKey: ["presence-website", orgId],
    queryFn: () => apiGet({ path: "/user/website" }).catch(() => null),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Dashboard context for checkup/GBP data
  const { data: ctx } = useQuery<any>({
    queryKey: ["presence-context", orgId],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // CRO insights
  const { data: croData } = useQuery<{ insights: any[] }>({
    queryKey: ["cro-insights", orgId],
    queryFn: () => apiGet({ path: "/user/cro-insights" }),
    enabled: !!orgId,
    staleTime: 120_000,
  });
  const croInsights = croData?.insights || [];

  // SEO/compliance data removed: not vital signs

  let checkupData = ctx?.org?.checkup_data || null;
  if (typeof checkupData === "string") {
    try { checkupData = JSON.parse(checkupData); } catch { checkupData = null; }
  }

  const place = checkupData?.place || {};
  const website = websiteData?.website || null;
  const hasWebsite = !!website;
  const websiteUrl = website?.liveUrl || (website?.generated_hostname ? `https://${website.generated_hostname}.sites.getalloro.com` : null);

  // GBP profile completeness
  // checkup_data stores boolean flags (hasPhone, hasHours, etc.)
  // Places API returns raw fields (nationalPhoneNumber, regularOpeningHours, etc.)
  // Check both formats
  const profileItems = [
    { label: "Phone", has: !!place.hasPhone || !!place.phone || !!place.nationalPhoneNumber || !!place.internationalPhoneNumber },
    { label: "Website", has: !!place.hasWebsite || !!place.website || !!place.websiteUri },
    { label: "Hours", has: !!place.hasHours || !!place.regularOpeningHours },
    { label: "Photos", has: (place.photosCount || place.photoCount || place.photos?.length || 0) > 0 },
    { label: "Description", has: !!place.hasEditorialSummary || !!place.editorialSummary },
  ];
  const profileComplete = profileItems.filter(i => i.has).length;

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] tracking-tight">Your Website</h1>
          <p className="text-sm text-gray-400 mt-1">Alloro built and maintains your patient-facing website.</p>
        </motion.div>

        {/* GBP Connection (if not connected) */}
        {!hasGoogleConnection && (
          <GBPConnectCard gbpConnected={!!hasGoogleConnection} orgId={orgId} />
        )}

        {/* Website */}
        <Section title="Your Website" icon={Globe} defaultOpen={true}>
          {hasWebsite ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-gray-50 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#1A1D23]">{website.generated_hostname}</p>
                  <p className="text-xs text-gray-400 capitalize">{website.status}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate("/dfy/website")}
                    className="flex items-center gap-1 text-sm font-semibold text-alloro-orange hover:text-alloro-navy transition-colors"
                  >
                    Edit your website <PenLine className="w-3.5 h-3.5" />
                  </button>
                  {websiteUrl && (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm font-semibold text-alloro-orange hover:text-alloro-navy transition-colors"
                    >
                      View site <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-[#F0EDE8] p-4 animate-pulse">
                <div className="h-4 w-48 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-32 bg-gray-200 rounded" />
              </div>
              <p className="text-sm text-gray-500">
                Alloro builds your website from your Google reviews and business data. A preview will appear here when it is ready.
              </p>
            </div>
          )}
        </Section>

        {/* GBP Profile */}
        {hasGoogleConnection && (
          <Section title="Google Business Profile" icon={MapPin} defaultOpen={true}>
            <div className="space-y-4">
              {/* Completeness meter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-600">Profile completeness</p>
                  <p className="text-sm font-semibold text-[#1A1D23]">{profileComplete}/{profileItems.length}</p>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${(profileComplete / profileItems.length) * 100}%` }}
                  />
                </div>
                {profileComplete < profileItems.length && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profileItems.filter(i => !i.has).map(i => (
                      <span key={i.label} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                        Missing: {i.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick facts */}
              <div className="grid grid-cols-3 gap-3">
                {place.phone && (
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Phone</p>
                    <p className="text-sm font-medium text-[#1A1D23]">{place.phone}</p>
                  </div>
                )}
                {place.rating && (
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Rating</p>
                    <p className="text-sm font-medium text-[#1A1D23]">{place.rating} stars</p>
                  </div>
                )}
                {place.reviewCount > 0 && (
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Reviews</p>
                    <p className="text-sm font-medium text-[#1A1D23]">{place.reviewCount}</p>
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* Website Optimizations (CRO Insights) */}
        <Section title="Website Optimizations" icon={Sparkles} defaultOpen={true}>
          {croInsights.length > 0 ? (
            <div className="space-y-3">
              {croInsights.slice(0, 8).map((insight, i) => {
                const changeLabels: Record<string, string> = {
                  title: "Page title",
                  meta_description: "Meta description",
                  content_section: "Content",
                  cta: "Call to action",
                  new_page: "New page",
                };
                return (
                  <div key={i} className="rounded-xl bg-[#F0EDE8] p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                        {changeLabels[insight.changeType] || insight.changeType}
                      </span>
                      {insight.date && (
                        <span className="text-xs text-gray-400">
                          {new Date(insight.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {insight.rationale && (
                      <p className="text-sm text-[#1A1D23] mb-2">{insight.rationale}</p>
                    )}
                    {insight.recommendedValue && (
                      <p className="text-xs text-[#1A1D23]/60">
                        Recommendation: {insight.recommendedValue}
                      </p>
                    )}
                    {insight.pageUrl && insight.pageUrl !== "/" && (
                      <p className="text-xs text-gray-400 mt-1">{insight.pageUrl}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-start gap-3 py-2">
              <Clock className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-500">
                Website optimization runs weekly. Insights will appear here after your first scan.
              </p>
            </div>
          )}
        </Section>

        {/* Focus Keywords and Compliance Check removed: not vital signs.
            The owner at 10pm doesn't check keywords or FTC compliance.
            These were features built because they could be, not because the
            owner needed them. */}

      </div>
    </div>
  );
}
