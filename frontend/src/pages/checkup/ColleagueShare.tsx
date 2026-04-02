import { useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Copy, Share2 } from "lucide-react";
import { trackEvent } from "../../api/tracking";

/**
 * /checkup/share -- Colleague share screen shown immediately after account creation.
 * This is the moment of maximum excitement. The doctor just saw their Oz moment,
 * created an account, and their colleague is standing 10 feet away.
 * One screen. One action. Make sharing effortless.
 */

interface ShareState {
  referralCode?: string | null;
  checkupScore?: number | null;
  businessName?: string | null;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "At Risk";
  return "Needs Attention";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

export default function ColleagueShare() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ShareState | undefined;
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const referralCode = state?.referralCode || null;
  const checkupScore = state?.checkupScore || null;

  const checkupLink = referralCode
    ? `${window.location.origin}/checkup?ref=${referralCode}`
    : `${window.location.origin}/checkup`;

  const shareMessage =
    "I just found out where I rank in my market. Took 60 seconds. You should see yours: " +
    checkupLink;

  const handleShare = useCallback(async () => {
    trackEvent("colleague_share.attempted", {
      method: "native_share",
      has_referral: !!referralCode,
    });

    if (navigator.share) {
      try {
        await navigator.share({
          text: shareMessage,
        });
        setShared(true);
        trackEvent("colleague_share.completed", {
          method: "native_share",
          has_referral: !!referralCode,
        });
      } catch {
        // User cancelled or share failed, that's fine
      }
    } else {
      // Fallback: open SMS with pre-filled body
      const smsUrl = `sms:?&body=${encodeURIComponent(shareMessage)}`;
      window.open(smsUrl, "_self");
      trackEvent("colleague_share.completed", {
        method: "sms_fallback",
        has_referral: !!referralCode,
      });
    }
  }, [shareMessage, referralCode]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(checkupLink);
      setCopied(true);
      trackEvent("colleague_share.link_copied", {
        has_referral: !!referralCode,
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API not available, select the text instead
      const input = document.querySelector<HTMLInputElement>("#share-link-input");
      if (input) {
        input.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  }, [checkupLink, referralCode]);

  const handleSkip = useCallback(() => {
    trackEvent("colleague_share.skipped", {
      has_referral: !!referralCode,
    });
    navigate("/owner-profile", { replace: true });
  }, [navigate, referralCode]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm text-center space-y-8">
        {/* Score badge */}
        {checkupScore != null && (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-[3px] border-slate-100 flex items-center justify-center">
                <span className="text-3xl font-semibold text-[#1A1D23]">
                  {checkupScore}
                </span>
              </div>
              <div
                className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold text-white uppercase tracking-wider ${getScoreColor(checkupScore)}`}
              >
                {getScoreLabel(checkupScore)}
              </div>
            </div>
          </div>
        )}

        {/* Headline */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#1A1D23] tracking-tight leading-tight">
            Know someone who should see theirs?
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
            It takes 60 seconds. Send them the link and they will see exactly where they stand in their market.
          </p>
        </div>

        {/* Pre-written message preview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-left">
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-3">
            Your message
          </p>
          <p className="text-sm text-[#1A1D23] leading-relaxed">
            "I just found out where I rank in my market. Took 60 seconds. You should see yours:{" "}
            <span className="text-[#D56753] font-medium break-all">{checkupLink}</span>"
          </p>
        </div>

        {/* Primary share button */}
        <button
          onClick={handleShare}
          className="w-full py-4 px-6 rounded-2xl text-white font-bold text-lg tracking-tight shadow-lg shadow-[#D56753]/25 transition-all duration-200 active:scale-[0.97] hover:shadow-xl hover:shadow-[#D56753]/30"
          style={{ backgroundColor: "#D56753" }}
        >
          <span className="flex items-center justify-center gap-3">
            <Share2 className="w-5 h-5" />
            {shared ? "Sent!" : "Send via text"}
          </span>
        </button>

        {/* Copy link secondary action */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              id="share-link-input"
              type="text"
              readOnly
              value={checkupLink}
              className="flex-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 truncate focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-[#1A1D23] hover:bg-slate-50 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Rise Together incentive */}
        {referralCode && (
          <div className="bg-[#D56753]/5 border border-[#D56753]/15 rounded-2xl p-4">
            <p className="text-xs font-semibold text-[#D56753] uppercase tracking-wide mb-1">
              Rise Together
            </p>
            <p className="text-sm text-[#1A1D23] leading-relaxed">
              When they join, you both pay $1,000 instead of $2,000 for the first 3 months.
            </p>
          </div>
        )}

        {/* Skip link */}
        <button
          onClick={handleSkip}
          className="text-xs text-slate-400 hover:text-slate-500 transition-colors py-2"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
