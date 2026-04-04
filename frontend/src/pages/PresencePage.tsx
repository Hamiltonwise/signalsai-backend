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
  Search,
  Shield,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";

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
import FocusKeywords from "@/components/dashboard/FocusKeywords";

// ─── Collapsible Section ────────────────────────────────────────────

function Section({ title, icon: Icon, defaultOpen = true, children }: {
  title: string;
  icon?: any;
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

  // Intelligence data (SEO/AEO)
  const { data: seoData } = useQuery<any>({
    queryKey: ["presence-seo", orgId],
    queryFn: () => apiGet({ path: "/intelligence/seo" }).catch(() => null),
    enabled: !!orgId,
    staleTime: 300_000,
  });

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
    { label: "Website", has: !!place.hasWebsite || !!place.website || !!place.websiteUri || hasWebsite },
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
          <h1 className="text-lg font-semibold text-[#1A1D23]">Your Online Presence</h1>
          <p className="text-sm text-gray-500 mt-1">What people see when they search for your business.</p>
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
              <p className="text-sm text-gray-500">
                To make changes, use the chat editor on your website page or ask Alloro's concierge.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Your website is being built from your Google reviews and business data. You will see a preview here when it is ready.
            </p>
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

        {/* Search Presence */}
        <Section title="Search Presence" icon={Search} defaultOpen={false}>
          <FocusKeywords />
        </Section>

        {/* Compliance */}
        <Section title="Compliance Check" icon={Shield} defaultOpen={false}>
          {seoData?.complianceFindings?.length > 0 ? (
            <div className="space-y-2">
              {seoData.complianceFindings.map((f: any, i: number) => (
                <div key={i} className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                  <p className="text-sm text-amber-800">{f.claim || f.title}</p>
                  {f.recommendation && (
                    <p className="text-xs text-amber-600 mt-1">{f.recommendation}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No compliance concerns found on your website. Alloro scans automatically for FTC-risky marketing claims.
            </p>
          )}
        </Section>

      </div>
    </div>
  );
}
