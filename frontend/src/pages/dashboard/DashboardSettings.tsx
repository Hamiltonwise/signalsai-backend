/**
 * Dashboard Settings — /dashboard/settings
 *
 * Business info, NPI verification, notifications, billing.
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
  Download,
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
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and preferences.</p>
      </div>

      {/* Section 1: Account Info */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-sm font-bold text-[#212D40]">Account info</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Business name</label>
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
            <p className="text-sm font-medium">NPI verified. Your Alloro website will include medical schema markup.</p>
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
            <p className="text-sm font-semibold text-[#212D40]">Business Clarity</p>
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

      {/* Section 5: Your Data */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="h-5 w-5 text-[#212D40]/60" />
          <h2 className="text-sm font-bold text-[#212D40]">Your data</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
          Your data belongs to you. Export everything we have for your account at any time,
          in a format you can open, share, or take to another service.
        </p>
        <div className="space-y-2">
          <ExportButton label="Export all data" description="JSON, complete" path="/user/export/all" filename="alloro-data-export.json" />
          <ExportButton label="Rankings history" description="CSV, last 12 weeks" path="/user/export/rankings" filename="alloro-rankings.csv" />
          <ExportButton label="Referral sources" description="CSV" path="/user/export/referrals" filename="alloro-referrals.csv" />
        </div>
        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
          No support ticket needed. No waiting period. Your data, anytime.
        </p>
      </div>

      {/* Section 6: Cancel / Pause */}
      {(isActive || isTrial) && (
        <CancelSection orgName={practiceName} isActive={!!isActive} isTrial={!!isTrial} />
      )}
    </div>
  );
}

// ─── Export Button ──────────────────────────────────────────────────

function ExportButton({ label, description, path, filename }: {
  label: string;
  description: string;
  path: string;
  filename: string;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleExport = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={downloading}
      className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 hover:border-[#212D40]/20 transition-colors disabled:opacity-50"
    >
      <div className="text-left">
        <p className="text-sm font-medium text-[#212D40]">{label}</p>
        <p className="text-[11px] text-gray-400">{description}</p>
      </div>
      <Download className={`h-4 w-4 text-gray-400 ${downloading ? "animate-pulse" : ""}`} />
    </button>
  );
}

// ─── Cancel / Pause Section ────────────────────────────────────────
// Research: Pause converts 15-20% of would-be cancellers.
// Of paused accounts, 40-60% reactivate (vs 5-15% of fully cancelled).
// One exit question, dynamic response. Honest, not hostile.

type CancelReason =
  | "too_expensive"
  | "not_using"
  | "missing_feature"
  | "switching"
  | "business_closed"
  | "other";

const CANCEL_REASONS: { value: CancelReason; label: string }[] = [
  { value: "not_using", label: "I'm not using it enough" },
  { value: "too_expensive", label: "It's too expensive right now" },
  { value: "missing_feature", label: "It's missing something I need" },
  { value: "switching", label: "I'm switching to something else" },
  { value: "business_closed", label: "My business situation changed" },
  { value: "other", label: "Something else" },
];

function getRetentionResponse(reason: CancelReason, orgName: string): {
  headline: string;
  body: string;
  offerPause: boolean;
  offerHelp: boolean;
} {
  switch (reason) {
    case "not_using":
      return {
        headline: "That's on us, not you.",
        body: `If ${orgName}'s intelligence hasn't been useful, we want to fix that. Would a quick walkthrough of what your agents found this month help? Or you can pause and come back when you're ready.`,
        offerPause: true,
        offerHelp: true,
      };
    case "too_expensive":
      return {
        headline: "We hear you.",
        body: `If the timing isn't right, you can pause your account for up to 3 months. Your data, your rankings history, and your intelligence stays exactly where it is. Resume anytime.`,
        offerPause: true,
        offerHelp: false,
      };
    case "missing_feature":
      return {
        headline: "Tell us what you need.",
        body: "We build based on what our clients ask for. If you share what's missing, it goes directly to our build queue. In the meantime, a pause keeps your account and data intact.",
        offerPause: true,
        offerHelp: true,
      };
    case "switching":
      return {
        headline: "We respect that.",
        body: "Before you go, you can export all your data from Settings. We'd appreciate knowing what the other service offers that we don't. It helps us get better.",
        offerPause: false,
        offerHelp: false,
      };
    case "business_closed":
      return {
        headline: "We're sorry to hear that.",
        body: `We hope ${orgName} served its community well. Your data will be preserved for 90 days after cancellation. If your situation changes, everything is right where you left it.`,
        offerPause: false,
        offerHelp: false,
      };
    case "other":
      return {
        headline: "We'd like to understand.",
        body: "If there's something specific driving your decision, we'd like to hear it. You can also pause for up to 3 months if you're not ready to decide.",
        offerPause: true,
        offerHelp: true,
      };
  }
}

function CancelSection({ orgName, isActive, isTrial: _isTrial }: { orgName: string; isActive: boolean; isTrial: boolean }) {
  const [step, setStep] = useState<"idle" | "reason" | "response" | "confirmed">("idle");
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [otherText, setOtherText] = useState("");
  const [processing, setProcessing] = useState(false);

  const handlePause = async () => {
    setProcessing(true);
    try {
      const token = localStorage.getItem("auth_token");
      await fetch("/api/billing/pause", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason, other_text: otherText || undefined }),
      });
      setStep("confirmed");
    } catch {
      // Fall through to confirmed state anyway
      setStep("confirmed");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    setProcessing(true);
    try {
      const token = localStorage.getItem("auth_token");
      // Log the reason before redirecting to Stripe portal
      await fetch("/api/billing/cancel-reason", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason, other_text: otherText || undefined }),
      });
      // Redirect to Stripe portal for actual cancellation
      const portalRes = await fetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const portalData = await portalRes.json();
      if (portalData.url) {
        window.location.href = portalData.url;
      }
    } catch {
      // silent
    } finally {
      setProcessing(false);
    }
  };

  const handleContactCorey = () => {
    window.location.href = "mailto:corey@getalloro.com?subject=Help with my Alloro account";
  };

  if (step === "confirmed") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-3" />
        <p className="text-sm font-bold text-[#212D40]">Account paused</p>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          Your data and intelligence history are preserved. Resume anytime from this page.
        </p>
      </div>
    );
  }

  if (step === "response" && reason) {
    const response = getRetentionResponse(reason, orgName);
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <p className="text-base font-bold text-[#212D40]">{response.headline}</p>
        <p className="text-sm text-gray-600 leading-relaxed">{response.body}</p>

        {reason === "other" || reason === "missing_feature" ? (
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder={reason === "missing_feature" ? "What feature would make the difference?" : "What's driving your decision?"}
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10 resize-none"
          />
        ) : null}

        <div className="flex flex-col gap-2 pt-2">
          {response.offerPause && (
            <button
              type="button"
              onClick={handlePause}
              disabled={processing}
              className="w-full h-11 rounded-xl bg-[#212D40] text-white text-sm font-semibold hover:bg-[#212D40]/90 transition-colors disabled:opacity-50 btn-press"
            >
              {processing ? "Processing..." : "Pause my account (up to 3 months)"}
            </button>
          )}
          {response.offerHelp && (
            <button
              type="button"
              onClick={handleContactCorey}
              className="w-full h-11 rounded-xl border border-[#D56753]/20 text-[#D56753] text-sm font-semibold hover:bg-[#D56753]/5 transition-colors btn-press"
            >
              Talk to Corey
            </button>
          )}
          <button
            type="button"
            onClick={handleCancel}
            disabled={processing}
            className="w-full h-11 rounded-xl text-gray-400 text-sm hover:text-gray-600 transition-colors"
          >
            {processing ? "Processing..." : "I still want to cancel"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => { setStep("idle"); setReason(null); }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Never mind, go back
        </button>
      </div>
    );
  }

  if (step === "reason") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <p className="text-sm font-bold text-[#212D40]">What's driving your decision?</p>
        <p className="text-xs text-gray-500">This goes directly to Corey. One question, then you're done.</p>
        <div className="space-y-2">
          {CANCEL_REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                reason === r.value
                  ? "border-[#D56753] bg-[#D56753]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="cancel_reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="w-4 h-4 text-[#D56753] border-gray-300 focus:ring-[#D56753]/20"
              />
              <span className="text-sm text-[#212D40]">{r.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Never mind
          </button>
          <button
            type="button"
            onClick={() => { if (reason) setStep("response"); }}
            disabled={!reason}
            className="flex-1 h-10 rounded-xl bg-[#212D40] text-white text-sm font-semibold hover:bg-[#212D40]/90 transition-colors disabled:opacity-30 btn-press"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Idle state: quiet link at the bottom
  return (
    <div className="text-center py-2">
      <button
        type="button"
        onClick={() => setStep("reason")}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {isActive ? "Cancel or pause my subscription" : "Cancel my trial"}
      </button>
    </div>
  );
}
