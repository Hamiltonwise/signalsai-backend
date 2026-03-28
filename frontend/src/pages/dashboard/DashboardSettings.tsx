/**
 * Dashboard Settings — /dashboard/settings
 *
 * Practice info, NPI verification, notifications, billing.
 */

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Loader2,
  Settings as SettingsIcon,
  Shield,
  Bell,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPatch, apiPost } from "@/api/index";

export default function DashboardSettings() {
  const { userProfile, billingStatus } = useAuth();
  const practiceName = userProfile?.practiceName || "Your Practice";

  // NPI state
  const [npi, setNpi] = useState("");
  const [npiVerified, setNpiVerified] = useState(false);
  const [npiVerifying, setNpiVerifying] = useState(false);
  const [npiError, setNpiError] = useState("");

  // Notification prefs
  const [mondayEmail, setMondayEmail] = useState(true);
  const [competitorAlerts, setCompetitorAlerts] = useState(true);
  const [milestones, setMilestones] = useState(true);
  const [_prefsSaving, setPrefsSaving] = useState(false);

  // Load existing prefs
  useEffect(() => {
    apiGet({ path: "/user/notification-preferences" })
      .then((res: any) => {
        if (res?.success) {
          setMondayEmail(res.monday_email ?? true);
          setCompetitorAlerts(res.competitor_alerts ?? true);
          setMilestones(res.milestones ?? true);
        }
      })
      .catch(() => {});
  }, []);

  const handleNpiVerify = async () => {
    if (npi.length !== 10 || !/^\d{10}$/.test(npi)) {
      setNpiError("NPI must be exactly 10 digits");
      return;
    }
    setNpiError("");
    setNpiVerifying(true);
    try {
      const res = await apiPost({ path: "/user/npi-verify", passedData: { npi } });
      if (res?.success && res?.verified) {
        setNpiVerified(true);
      } else {
        setNpiError(res?.error || "NPI could not be verified");
      }
    } catch {
      setNpiError("Verification failed. Try again.");
    } finally {
      setNpiVerifying(false);
    }
  };

  const saveNotificationPrefs = async (key: string, value: boolean) => {
    setPrefsSaving(true);
    try {
      await apiPatch({
        path: "/user/notification-preferences",
        passedData: { [key]: value },
      });
    } catch { /* silent */ }
    finally { setPrefsSaving(false); }
  };

  const isActive = billingStatus?.hasStripeSubscription || billingStatus?.isAdminGranted;
  const isTrial = billingStatus?.subscriptionStatus === "trial";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#212D40]">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your practice profile and preferences.</p>
      </div>

      {/* Section 1: Practice Info */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-sm font-bold text-[#212D40]">Practice info</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Practice name</label>
            <p className="text-sm font-semibold text-[#212D40] mt-0.5">{practiceName}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Email</label>
            <p className="text-sm text-[#212D40] mt-0.5">{userProfile?.email || "Not set"}</p>
          </div>
        </div>
      </div>

      {/* Section 2: NPI */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-blue-500" />
          <h2 className="text-sm font-bold text-[#212D40]">NPI Verification</h2>
        </div>
        {npiVerified ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <p className="text-sm font-medium">NPI verified. Your PatientPath website will include medical schema markup.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">10-digit National Provider Identifier</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={npi}
                onChange={(e) => { setNpi(e.target.value.replace(/\D/g, "").slice(0, 10)); setNpiError(""); }}
                placeholder="1234567890"
                maxLength={10}
                className={`flex-1 h-10 px-3 rounded-lg bg-gray-50 border text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                  npiError ? "border-red-400 focus:ring-red-400/10" : "border-gray-200 focus:border-[#D56753] focus:ring-[#D56753]/10"
                }`}
              />
              <button
                onClick={handleNpiVerify}
                disabled={npi.length !== 10 || npiVerifying}
                className="h-10 px-4 rounded-lg bg-[#212D40] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#212D40]/90 transition-colors disabled:opacity-50"
              >
                {npiVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify NPI"}
              </button>
            </div>
            {npiError && <p className="text-xs text-red-500">{npiError}</p>}
          </div>
        )}
      </div>

      {/* Section 3: Notifications */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-amber-500" />
          <h2 className="text-sm font-bold text-[#212D40]">Notifications</h2>
        </div>
        <div className="space-y-3">
          {[
            { key: "monday_email", label: "Monday morning email", value: mondayEmail, set: setMondayEmail },
            { key: "competitor_alerts", label: "Competitor alerts", value: competitorAlerts, set: setCompetitorAlerts },
            { key: "milestones", label: "Milestone celebrations", value: milestones, set: setMilestones },
          ].map((pref) => (
            <div key={pref.key} className="flex items-center justify-between">
              <span className="text-sm text-[#212D40]">{pref.label}</span>
              <button
                onClick={() => {
                  const next = !pref.value;
                  pref.set(next);
                  saveNotificationPrefs(pref.key, next);
                }}
                className={`relative w-10 h-6 rounded-full transition-colors ${pref.value ? "bg-[#D56753]" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${pref.value ? "translate-x-4" : ""}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Billing */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-emerald-600" />
          <h2 className="text-sm font-bold text-[#212D40]">Billing</h2>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-[#212D40]">Practice Intelligence</p>
            <p className="text-xs text-gray-500">$2,000/month</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            isActive ? "bg-emerald-50 text-emerald-700" : isTrial ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
          }`}>
            {isActive ? "Active" : isTrial ? "Trial" : "Inactive"}
          </span>
        </div>
        {isTrial && (
          <p className="text-xs text-amber-600 mb-3">Your trial is active. Subscribe to keep access after it ends.</p>
        )}
        <a
          href="/settings/billing"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#D56753] hover:underline"
        >
          Manage billing
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
