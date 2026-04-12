import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  Mail,
  Shield,
  Lock,
  Activity,
  Link2,
  Unlink,
  ExternalLink,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSettingsScopes, usePmsStatus } from "../../hooks/queries/useSettingsQueries";
import { useOnboardingWizard } from "../../contexts/OnboardingWizardContext";
import { PropertiesTab } from "../../components/settings/PropertiesTab";
import { MissingScopeBanner } from "../../components/settings/MissingScopeBanner";
import { PMSUploadBanner } from "../../components/settings/PMSUploadBanner";
import { GoogleConnectButton } from "../../components/GoogleConnectButton";

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow = ({ icon, label, value }: InfoRowProps) => (
  <div className="flex items-start gap-4 group">
    <div className="p-2.5 bg-alloro-bg text-alloro-navy/40 rounded-xl shrink-0 group-hover:text-alloro-orange group-hover:bg-alloro-orange/5 transition-all duration-500 border border-black/5 shadow-inner-soft group-hover:shadow-premium">
      {icon}
    </div>
    <div className="min-w-0 text-left">
      <div className="text-xs font-semibold text-alloro-textDark/30 uppercase tracking-[0.2em] mb-0.5 leading-none">
        {label}
      </div>
      <div className="text-base font-semibold text-alloro-navy tracking-tight truncate group-hover:translate-x-1 transition-transform">
        {value}
      </div>
    </div>
  </div>
);

export const IntegrationsRoute: React.FC = () => {
  const { userProfile, selectedDomain, hasProperties, hasGoogleConnection, refreshUserProperties } = useAuth();
  const { isWizardActive, restartWizard } = useOnboardingWizard();

  const orgId = userProfile?.organizationId;
  const { data: scopesData, isLoading: scopesLoading, refetch: refetchScopes } = useSettingsScopes();
  const { data: pmsData, isLoading: pmsLoading } = usePmsStatus(orgId ?? undefined);

  const missingScopes = (scopesData?.missingScopes ?? []) as string[];
  const missingScopeCount = scopesData?.missingCount ?? 0;
  const hasPmsData = pmsData?.success && (pmsData?.data?.months?.length ?? 0) > 0 ? true : false;
  const isLoading = scopesLoading || pmsLoading;

  const handleGrantAccessComplete = () => {
    refetchScopes();
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
        <div className="xl:col-span-5 space-y-8">
          <div className="bg-white rounded-[2.5rem] border border-black/5 p-10 shadow-premium animate-pulse">
            <div className="h-4 w-32 bg-slate-100 rounded mb-10" />
            <div className="space-y-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-5">
                  <div className="w-10 h-10 bg-slate-100 rounded-2xl" />
                  <div>
                    <div className="h-3 w-16 bg-slate-100 rounded mb-2" />
                    <div className="h-4 w-32 bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="xl:col-span-7 space-y-8 lg:space-y-10">
          <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-[2.5rem] border border-black/5 p-10 shadow-premium animate-pulse"
              >
                <div className="flex items-center justify-between mb-10">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl" />
                  <div className="h-6 w-16 bg-slate-100 rounded-lg" />
                </div>
                <div className="h-5 w-40 bg-slate-100 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-100 rounded mb-8" />
                <div className="h-4 w-28 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
      {/* Left Column - Practice Identity */}
      <section className="xl:col-span-5 space-y-6">
        <div className="px-1">
          <h2 className="text-lg font-semibold text-alloro-navy tracking-tight mb-1">
            Business Details
          </h2>
          <p className="text-slate-500 text-sm">
            Your business information and contact details
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-black/5 p-6 lg:p-8 shadow-premium space-y-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-alloro-orange/[0.03] rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none group-hover:bg-alloro-orange/[0.06] transition-all duration-700"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-x-8 gap-y-5 relative z-10">
            <InfoRow
              icon={<Globe size={18} />}
              label="Website"
              value={
                selectedDomain?.domain ||
                userProfile?.domainName ||
                "Not configured"
              }
            />
            <InfoRow
              icon={<Mail size={18} />}
              label="Email"
              value={userProfile?.email || "Not configured"}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-alloro-navy rounded-3xl p-6 lg:p-8 text-white relative overflow-hidden shadow-2xl group text-left"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-alloro-orange/5 rounded-full -mr-24 -mt-24 blur-[60px] pointer-events-none group-hover:bg-alloro-orange/10 transition-all duration-700"></div>
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
              <Shield size={22} className="text-white/60" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-snug tracking-tight text-white/90">
                <span className="text-alloro-orange font-semibold">
                  Encrypted & Secure.
                </span>{" "}
                All business data is protected by high-level
                encryption protocols.
              </p>
              <div className="flex items-center gap-4 pt-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white/20 uppercase tracking-[0.2em]">
                  <Lock size={10} /> HIPAA Compliant
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white/20 uppercase tracking-[0.2em]">
                  <Activity size={10} /> Monitored 24/7
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Restart Product Tour */}
        {!isWizardActive && (
          <button
            onClick={restartWizard}
            className="w-full text-left px-4 py-3 rounded-2xl border border-dashed border-slate-200 text-sm font-medium text-slate-400 hover:text-alloro-orange hover:border-alloro-orange/30 transition-all"
          >
            Restart Product Tour
          </button>
        )}
      </section>

      {/* Right Column - Locations & Integrations */}
      <section
        data-wizard-target="settings-integrations"
        className="xl:col-span-7 space-y-6"
      >
        {/* Missing Scopes Banner */}
        {missingScopeCount > 0 && (
          <MissingScopeBanner
            missingCount={missingScopeCount}
            missingScopes={missingScopes}
            onGrantAccess={handleGrantAccessComplete}
          />
        )}

        {/* Connect Google Banner — show when no Google connection */}
        {!hasGoogleConnection && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-alloro-orange/20 rounded-2xl p-6 mb-8"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-alloro-navy text-lg">
                  Connect Google Account
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  Link your Google Business Profile to manage your locations and start tracking performance.
                </p>
              </div>
              <div className="shrink-0">
                <GoogleConnectButton
                  variant="primary"
                  size="sm"
                  onSuccess={async () => {
                    await refreshUserProperties();
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* HubSpot CRM Integration */}
        <HubSpotCard />

        {/* PMS Upload Banner — only show when at least one location is configured */}
        {hasPmsData === false && hasProperties && <PMSUploadBanner />}

        {/* Location-centric properties management */}
        <PropertiesTab />
      </section>
    </div>
  );
};

/**
 * HubSpot CRM integration card.
 * Shows connection status, connect/disconnect button.
 */
function HubSpotCard() {
  const [status, setStatus] = useState<{ connected: boolean; hubDomain?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Check URL params for success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("hubspot") === "connected") {
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    fetch("/api/integrations/hubspot/status")
      .then(r => r.json())
      .then(data => {
        if (data.success) setStatus({ connected: data.connected, hubDomain: data.hubDomain });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    setActing(true);
    try {
      const res = await fetch("/api/integrations/hubspot/connect");
      const data = await res.json();
      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setActing(false);
    }
  };

  const handleDisconnect = async () => {
    setActing(true);
    try {
      await fetch("/api/integrations/hubspot/disconnect", { method: "DELETE" });
      setStatus({ connected: false });
    } catch {
      // ignore
    }
    setActing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="bg-white rounded-2xl border border-black/5 p-6 shadow-premium"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FF7A59]/10 rounded-xl flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M17.5 8.5V5.5C17.5 4.4 16.6 3.5 15.5 3.5H15V2C15 1.45 14.55 1 14 1S13 1.45 13 2V3.5H11V2C11 1.45 10.55 1 10 1S9 1.45 9 2V3.5H8.5C7.4 3.5 6.5 4.4 6.5 5.5V8.5C5.4 8.5 4.5 9.4 4.5 10.5V13.5C4.5 14.6 5.4 15.5 6.5 15.5V18.5C6.5 19.6 7.4 20.5 8.5 20.5H15.5C16.6 20.5 17.5 19.6 17.5 18.5V15.5C18.6 15.5 19.5 14.6 19.5 13.5V10.5C19.5 9.4 18.6 8.5 17.5 8.5ZM15.5 18.5H8.5V15.5H15.5V18.5ZM17.5 13.5H6.5V10.5H17.5V13.5ZM15.5 8.5H8.5V5.5H15.5V8.5Z" fill="#FF7A59"/>
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">HubSpot CRM</h3>
            <p className="text-xs text-gray-400">
              {loading ? "Checking..." : status?.connected ? `Connected to ${status.hubDomain || "HubSpot"}` : "Read-only pipeline sync"}
            </p>
          </div>
        </div>

        {!loading && (
          status?.connected ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected
              </span>
              <button
                onClick={handleDisconnect}
                disabled={acting}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-red-500 border border-gray-200 rounded-lg hover:border-red-200 transition-colors"
              >
                {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={acting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#FF7A59] hover:bg-[#e96b4a] rounded-lg transition-colors disabled:opacity-50"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Connect HubSpot
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-50" />
            </button>
          )
        )}
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        {status?.connected
          ? "Your sales pipeline is synced. Ask The Board to prep you for your next demo."
          : "Connect your HubSpot account to sync your sales pipeline. Read-only access, your CRM data stays in HubSpot."
        }
      </p>
    </motion.div>
  );
}
