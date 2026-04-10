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
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  PenLine,
  Sparkles,
  MousePointerClick,
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

  // Form submissions
  const { data: formData } = useQuery<{ submissions: any[] }>({
    queryKey: ["form-submissions", orgId],
    queryFn: () => apiGet({ path: "/user/website/form-submissions" }).catch(() => ({ submissions: [] })),
    enabled: !!orgId && !!websiteData?.website,
    staleTime: 120_000,
  });
  const formSubmissions = formData?.submissions || [];

  // CRO insights
  const { data: croData } = useQuery<{ insights: any[] }>({
    queryKey: ["cro-insights", orgId],
    queryFn: () => apiGet({ path: "/user/cro-insights" }),
    enabled: !!orgId,
    staleTime: 120_000,
  });
  const croInsights = croData?.insights || [];

  // SEO/compliance data removed: not vital signs

  const website = websiteData?.website || null;
  const hasWebsite = !!website;
  const websiteUrl = website?.liveUrl || (website?.generated_hostname ? `https://${website.generated_hostname}.sites.getalloro.com` : null);

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] tracking-tight">Your Website</h1>
          <p className="text-sm text-gray-400 mt-1">Alloro built and maintains your website.</p>
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

        {/* Only show additional sections when there's a website with real data */}
        {hasWebsite && (
          <>
            {/* Built to Convert -- only when form submissions exist */}
            {formSubmissions.length > 0 && (
              <Section title="Built to Convert" icon={MousePointerClick} defaultOpen={true}>
                <div className="space-y-3">
                  <div className="rounded-xl bg-[#F0EDE8] p-4">
                    <p className="text-sm font-semibold text-[#1A1D23]">
                      {formSubmissions.length} form submission{formSubmissions.length !== 1 ? "s" : ""} received
                    </p>
                    {formSubmissions[0]?.created_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        Most recent: {new Date(formSubmissions[0].created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* Website Optimizations -- only when CRO insights exist */}
            {croInsights.length > 0 && (
              <Section title="Website Optimizations" icon={Sparkles} defaultOpen={true}>
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
              </Section>
            )}
          </>
        )}

        {/* When no website exists, show a single honest statement instead of 4 empty accordions */}
        {!hasWebsite && (
          <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-6">
            <p className="text-sm font-semibold text-[#1A1D23] mb-2">Website not yet active</p>
            <p className="text-sm text-gray-500">
              Alloro can build and maintain a website for your business. When active, this page shows your site performance, form submissions, and optimization history.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
