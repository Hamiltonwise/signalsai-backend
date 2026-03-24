/**
 * Partner Portal — /partner
 *
 * Three screens for referral partners and agencies:
 * 1. Portfolio: practices referred, with health status
 * 2. Checkup: run scans, share results with doctors
 * 3. Performance: referral code stats
 *
 * Separate surface from Doctor Dashboard and HQ Admin.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Search,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Copy,
  Users,
  DollarSign,
  Target,
  ArrowRight,
  CheckCircle2,
  Pencil,
  Loader2,
} from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/api/index";

// ─── Types ──────────────────────────────────────────────────────────

interface PortfolioPractice {
  id: number;
  name: string;
  city: string | null;
  specialty: string | null;
  score: number | null;
  previousScore: number | null;
  rankPosition: number | null;
  subscriptionStatus: string | null;
  subscriptionTier: string | null;
  createdAt: string;
}

interface PortfolioStats {
  totalReferred: number;
  totalMRR: number;
  avgScore: number | null;
  referralCode: string | null;
}

interface PerformanceData {
  referralCode: string | null;
  totalScans: number;
  emailsCaptured: number;
  accountsCreated: number;
  activeSubscriptions: number;
  estimatedMRR: number;
}

// ─── Sidebar ────────────────────────────────────────────────────────

type PartnerTab = "portfolio" | "checkup" | "performance" | "write";

function PartnerSidebar({
  active,
  onChange,
}: {
  active: PartnerTab;
  onChange: (tab: PartnerTab) => void;
}) {
  const items: { key: PartnerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "portfolio", label: "Portfolio", icon: Briefcase },
    { key: "checkup", label: "Checkup", icon: Search },
    { key: "performance", label: "Performance", icon: BarChart3 },
    { key: "write", label: "Write an Email", icon: Pencil },
  ];

  return (
    <nav className="flex lg:flex-col gap-1 lg:w-56 lg:shrink-0">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            active === item.key
              ? "bg-[#D56753] text-white shadow-sm"
              : "text-gray-500 hover:text-[#212D40] hover:bg-gray-100"
          }`}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

// ─── Partner Progress Tracker ────────────────────────────────────────

function ProgressTracker() {
  const { data: perfData } = useQuery({
    queryKey: ["partner-performance"],
    queryFn: async () => {
      const res = await apiGet({ path: "/partner/performance" });
      return res?.success ? res.performance as PerformanceData : null;
    },
    staleTime: 5 * 60_000,
  });

  const scans = perfData?.totalScans || 0;
  const shares = perfData?.emailsCaptured || 0; // shares tracked as email captures with ref code
  const accounts = perfData?.accountsCreated || 0;
  const hasActive = (perfData?.activeSubscriptions || 0) > 0;

  const steps: {
    label: string;
    reward: string;
    complete: boolean;
    progress?: string;
    cta: string;
    ctaAction?: string;
  }[] = [
    {
      label: "Set up your partner profile",
      reward: "Unlocks your referral code and portfolio tracking",
      complete: true, // they're here, so it's done
      cta: "Edit profile",
      ctaAction: "/partner",
    },
    {
      label: "Run your first 5 Checkups",
      reward: "Each scan adds a practice to your portfolio with a live score",
      complete: scans >= 5,
      progress: `${Math.min(scans, 5)}/5`,
      cta: scans >= 5 ? "Done" : "Run a Checkup",
      ctaAction: "/checkup",
    },
    {
      label: "Share 3 results with doctors",
      reward: "Shared results convert at 3x the rate of cold outreach",
      complete: shares >= 3,
      progress: `${Math.min(shares, 3)}/3`,
      cta: shares >= 3 ? "Done" : "Share a result",
    },
    {
      label: "Get your first practice signed up",
      reward: "Your first referred account earns you a free month",
      complete: accounts >= 1,
      progress: accounts >= 1 ? undefined : `${accounts}/1`,
      cta: accounts >= 1 ? "Done" : "Keep sharing",
    },
    {
      label: "Earn your first referral month",
      reward: "One free month of Alloro for every practice that signs up",
      complete: hasActive,
      cta: hasActive ? "Earned" : "Unlocks after step 4",
    },
  ];

  const completedCount = steps.filter((s) => s.complete).length;

  // Hide tracker if all steps complete
  if (completedCount === steps.length) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Getting Started
        </p>
        <span className="text-xs font-bold text-[#D56753]">
          {completedCount}/{steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-[#D56753] rounded-full transition-all duration-700"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
              step.complete
                ? "bg-[#D56753]/[0.04]"
                : "bg-gray-50"
            }`}
          >
            {/* Step indicator */}
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step.complete
                ? "bg-[#D56753] text-white"
                : "bg-[#212D40]/10 text-[#212D40]/40"
            }`}>
              {step.complete ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                i + 1
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-semibold ${step.complete ? "text-[#D56753]" : "text-[#212D40]"}`}>
                  {step.label}
                </p>
                {step.progress && !step.complete && (
                  <span className="text-[10px] font-bold text-[#212D40]/40 bg-[#212D40]/5 px-1.5 py-0.5 rounded">
                    {step.progress}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">{step.reward}</p>
            </div>

            {/* CTA */}
            {!step.complete && step.ctaAction && (
              <a
                href={step.ctaAction}
                className="shrink-0 text-[11px] font-semibold text-[#D56753] hover:underline"
              >
                {step.cta} →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Screen 1: Portfolio View ───────────────────────────────────────

function PortfolioView() {
  const { data, isLoading } = useQuery({
    queryKey: ["partner-portfolio"],
    queryFn: async () => {
      const res = await apiGet({ path: "/partner/portfolio" });
      return res?.success ? res : null;
    },
    staleTime: 5 * 60_000,
  });

  const portfolio: PortfolioPractice[] = data?.portfolio || [];
  const stats: PortfolioStats = data?.stats || { totalReferred: 0, totalMRR: 0, avgScore: null, referralCode: null };

  return (
    <div className="space-y-6">
      {/* Progress tracker — above everything */}
      <ProgressTracker />

      {/* Stats header */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-[#212D40]">{stats.totalReferred}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Practices</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-emerald-600">${stats.totalMRR}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">MRR Attributed</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-[#212D40]">{stats.avgScore ?? "—"}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Avg Score</p>
        </div>
      </div>

      {/* Practice cards */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
      )}

      {!isLoading && portfolio.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-[#212D40]">Run your first Checkup to add a practice.</p>
          <p className="text-sm text-gray-400 mt-1">
            Use the Checkup tab to scan any practice and add it to your portfolio.
          </p>
        </div>
      )}

      {portfolio.map((p) => {
        const scoreDelta = p.score && p.previousScore ? p.score - p.previousScore : null;
        const trend = scoreDelta && scoreDelta > 0 ? "up" : scoreDelta && scoreDelta < 0 ? "down" : "flat";

        return (
          <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#212D40] truncate">{p.name}</p>
              <p className="text-xs text-gray-500">
                {p.city && `${p.city} · `}{p.specialty || "Practice"}
              </p>
              <div className="flex items-center gap-3 mt-2">
                {p.subscriptionStatus === "active" && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                )}
                {p.subscriptionStatus !== "active" && (
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {p.subscriptionStatus || "Pending"}
                  </span>
                )}
                {p.rankPosition && (
                  <span className="text-[10px] text-gray-400">Rank #{p.rankPosition}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className={`text-2xl font-black ${
                p.score && p.score >= 70 ? "text-emerald-600" : p.score && p.score >= 50 ? "text-amber-600" : "text-[#D56753]"
              }`}>
                {p.score ?? "—"}
              </p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                {trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                {trend === "flat" && <Minus className="h-3 w-3 text-gray-300" />}
                <span className="text-[10px] text-gray-400">/100</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Screen 2: Checkup Launcher ─────────────────────────────────────

function CheckupLauncher() {
  const [copied, setCopied] = useState(false);

  const { data: perfData } = useQuery({
    queryKey: ["partner-performance"],
    queryFn: async () => {
      const res = await apiGet({ path: "/partner/performance" });
      return res?.success ? res.performance : null;
    },
    staleTime: 5 * 60_000,
  });

  const refCode = perfData?.referralCode;
  const checkupUrl = refCode
    ? `${window.location.origin}/checkup?ref=${refCode}`
    : `${window.location.origin}/checkup`;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h3 className="text-base font-bold text-[#212D40] mb-2">Run a Checkup</h3>
        <p className="text-sm text-gray-500 mb-4">
          Search any practice to generate a live Business Health Score. Results are automatically added to your portfolio.
        </p>
        <a
          href={checkupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-5 py-3 shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:brightness-105 transition-all"
        >
          Open Checkup
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h3 className="text-base font-bold text-[#212D40] mb-2">Share with a Doctor</h3>
        <p className="text-sm text-gray-500 mb-4">
          Send this link to a doctor. They'll see the full Checkup experience with the blur gate.
          When they sign up, the account is attributed to you.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={checkupUrl}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 truncate"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(checkupUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all ${
              copied
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-[#212D40] text-white hover:bg-[#212D40]/90"
            }`}
          >
            <Copy className="h-3 w-3" />
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        {refCode && (
          <p className="text-[11px] text-gray-400 mt-2">
            Your referral code: <span className="font-mono font-bold">{refCode}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Screen 3: Performance Dashboard ────────────────────────────────

function PerformanceDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["partner-performance"],
    queryFn: async () => {
      const res = await apiGet({ path: "/partner/performance" });
      return res?.success ? res.performance as PerformanceData : null;
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
        <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Performance data appears after your first referral.</p>
      </div>
    );
  }

  const funnel = [
    { label: "Checkup Scans", value: data.totalScans, icon: Search },
    { label: "Emails Captured", value: data.emailsCaptured, icon: Target },
    { label: "Accounts Created", value: data.accountsCreated, icon: Users },
    { label: "Active Subscriptions", value: data.activeSubscriptions, icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      {/* Referral code */}
      {data.referralCode && (
        <div className="bg-[#212D40] rounded-2xl p-5 text-white flex items-center justify-between">
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider font-bold">Your Referral Code</p>
            <p className="text-2xl font-mono font-black mt-1">{data.referralCode}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50 uppercase tracking-wider font-bold">Estimated MRR</p>
            <p className="text-2xl font-black mt-1">${data.estimatedMRR}</p>
          </div>
        </div>
      )}

      {/* Funnel */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Conversion Funnel</p>
        {funnel.map((step, i) => {
          const pct = funnel[0].value > 0
            ? Math.round((step.value / funnel[0].value) * 100)
            : 0;
          return (
            <div key={step.label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#D56753]/10 flex items-center justify-center">
                  <step.icon className="h-4 w-4 text-[#D56753]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#212D40]">{step.label}</p>
                  {i > 0 && funnel[0].value > 0 && (
                    <p className="text-[10px] text-gray-400">{pct}% of scans</p>
                  )}
                </div>
              </div>
              <p className="text-xl font-black text-[#212D40]">{step.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Voice Profile Extraction Prompt ─────────────────────────────────

const EXTRACTION_PROMPT = `Analyze everything you know about how I communicate -- from our conversations, my messages, my writing style, and any preferences I've shared.

Generate my Voice Profile as a single code block I can copy and paste into other AI tools to make them write in my voice.

Format exactly as follows:

VOICE PROFILE: [Name]

RHYTHM:
[How I structure sentences. Where the point lands. Length patterns.]

TONE:
[Emotional register. How it shifts by audience. What it never is.]

NEVER SAYS:
[10-15 specific phrases, words, or patterns I consistently avoid.]

ALWAYS DOES:
[5-8 consistent patterns in how I open, emphasize, land a point, or close.]

VOCABULARY:
[Words and phrases distinctly mine.]

WHAT I CARE ABOUT:
[3-5 things that consistently show up in my writing.]

SAMPLE SENTENCES:
[3 sentences synthesized from my patterns that sound exactly like me.]

Output the entire profile in a single code block.
Be specific. Every line should be true only of me, not most people.`;

// ─── Voice Profile Onboarding ───────────────────────────────────────

function VoiceProfileSetup({ onSaved }: { onSaved: () => void }) {
  const [profileText, setProfileText] = useState("");
  const [saving, setSaving] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const handleSave = async () => {
    if (!profileText.trim() || saving) return;
    setSaving(true);
    try {
      await apiPatch({
        path: "/partner/voice-profile",
        passedData: { voiceProfile: profileText.trim() },
      });
      onSaved();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-[#212D40] mb-2">
          Let's make sure every email sounds like you.
        </h3>
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          Paste your Voice Profile below. If you don't have one, copy this prompt into ChatGPT or Claude and paste the result back.
        </p>

        {/* Extraction prompt with copy button */}
        <div className="bg-[#212D40]/[0.03] rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Voice Extraction Prompt
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(EXTRACTION_PROMPT).then(() => {
                  setPromptCopied(true);
                  setTimeout(() => setPromptCopied(false), 2000);
                });
              }}
              className={`flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-3 py-1.5 transition-all ${
                promptCopied
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <Copy className="h-3 w-3" />
              {promptCopied ? "Copied!" : "Copy prompt"}
            </button>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line line-clamp-4">
            {EXTRACTION_PROMPT.slice(0, 200)}...
          </p>
        </div>

        {/* Textarea for paste */}
        <label className="block text-sm font-semibold text-[#212D40] mb-2">
          Paste your Voice Profile
        </label>
        <textarea
          value={profileText}
          onChange={(e) => setProfileText(e.target.value)}
          placeholder="VOICE PROFILE: Your Name&#10;&#10;RHYTHM:&#10;..."
          rows={8}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10 resize-none font-mono text-xs"
        />

        {/* Preview sentence */}
        {profileText.trim().length > 50 && (
          <div className="mt-3 bg-[#D56753]/[0.04] rounded-lg p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#D56753] mb-1">
              Profile detected
            </p>
            <p className="text-xs text-gray-600">
              {profileText.includes("SAMPLE SENTENCES")
                ? profileText.split("SAMPLE SENTENCES")[1]?.split("\n").find((l: string) => l.trim().length > 10)?.trim().slice(0, 120) || "Voice profile loaded"
                : "Voice profile loaded — your emails will match this voice"}
            </p>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!profileText.trim() || saving}
          className="mt-4 flex items-center gap-2 rounded-xl bg-[#D56753] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save my voice"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Email Writer ───────────────────────────────────────────────────

interface GeneratedEmail {
  subject: string;
  body: string;
}

function EmailWriter() {
  const { data: voiceData, isLoading: voiceLoading, refetch: refetchVoice } = useQuery({
    queryKey: ["partner-voice-profile"],
    queryFn: async () => {
      const res = await apiGet({ path: "/partner/voice-profile" });
      return res?.success ? res.voiceProfile : null;
    },
    staleTime: 10 * 60_000,
  });

  const hasVoiceProfile = !!voiceData;

  const [situation, setSituation] = useState("");
  const [tone, setTone] = useState<"professional" | "friendly" | "urgent">("professional");
  const [generating, setGenerating] = useState(false);
  const [emails, setEmails] = useState<GeneratedEmail[]>([]);
  const [history, setHistory] = useState<{ situation: string; emails: GeneratedEmail[] }[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Show onboarding if no voice profile
  if (voiceLoading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white" />;
  }

  if (!hasVoiceProfile) {
    return <VoiceProfileSetup onSaved={() => refetchVoice()} />;
  }

  const handleGenerate = async () => {
    if (!situation.trim() || generating) return;
    setGenerating(true);
    setError("");
    setEmails([]);

    try {
      const res = await apiPost({
        path: "/api/partner/write",
        passedData: { situation: situation.trim(), tone },
      });

      if (res?.success && res.emails?.length) {
        setEmails(res.emails);
        setHistory((prev) => [{ situation: situation.trim(), emails: res.emails }, ...prev].slice(0, 5));
      } else {
        setError(res?.error || "Failed to generate emails. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (idx: number) => {
    const email = emails[idx];
    const text = `Subject: ${email.subject}\n\n${email.body}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Input form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-semibold text-[#212D40] mb-2">
          Describe your situation
        </label>
        <textarea
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder="I need to follow up with Dr. Martinez who watched our demo but mentioned the price was a concern"
          rows={3}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10 resize-none"
        />

        {/* Tone selector */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs font-medium text-gray-500">Tone:</span>
          {(["professional", "friendly", "urgent"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all capitalize ${
                tone === t
                  ? "border-[#D56753] bg-[#D56753]/5 text-[#D56753] font-semibold"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={!situation.trim() || generating}
          className="mt-4 flex items-center gap-2 rounded-xl bg-[#D56753] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Writing...
            </>
          ) : (
            <>
              <Pencil className="h-4 w-4" />
              Generate emails
            </>
          )}
        </button>

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* Generated emails */}
      {emails.length > 0 && (
        <div className="space-y-4">
          {emails.map((email, idx) => (
            <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Option {idx + 1}
                  </span>
                  <p className="text-sm font-bold text-[#212D40] mt-1">
                    {email.subject}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(idx)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
                    copiedIdx === idx
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {copiedIdx === idx ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {email.body}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {history.length > 0 && emails.length === 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Recent</p>
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                setSituation(h.situation);
                setEmails(h.emails);
              }}
              className="w-full text-left rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 hover:border-gray-300 transition-colors truncate"
            >
              {h.situation}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function PartnerPortal() {
  const [activeTab, setActiveTab] = useState<PartnerTab>("portfolio");

  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
      {/* Header */}
      <header className="bg-[#212D40] text-white py-4 px-5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9"/>
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">alloro</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 bg-white/10 px-2.5 py-0.5 rounded-full ml-2">
              Partner
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <PartnerSidebar active={activeTab} onChange={setActiveTab} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-[#212D40]">
                {activeTab === "portfolio" && "Your Portfolio"}
                {activeTab === "checkup" && "Run a Checkup"}
                {activeTab === "performance" && "Referral Performance"}
                {activeTab === "write" && "Write an Email"}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {activeTab === "portfolio" && "Practices you've referred to Alloro."}
                {activeTab === "checkup" && "Scan any practice and share the results."}
                {activeTab === "performance" && "Your referral code performance."}
                {activeTab === "write" && "Generate follow-up emails in seconds."}
              </p>
            </div>

            {activeTab === "portfolio" && <PortfolioView />}
            {activeTab === "checkup" && <CheckupLauncher />}
            {activeTab === "performance" && <PerformanceDashboard />}
            {activeTab === "write" && <EmailWriter />}
          </div>
        </div>
      </div>
    </div>
  );
}
