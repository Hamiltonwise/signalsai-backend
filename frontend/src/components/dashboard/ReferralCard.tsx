/**
 * Referral Card -- "Rise Together. Split month one."
 *
 * Not a "referral program" widget. A natural invitation that feels
 * like the user's own idea, not a sales ask. Oz principle: the
 * experience should be so good that sharing is instinctive.
 *
 * Placed on the dashboard after the owner has seen their first
 * intelligence (post-TTFV). Never on first load.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, Users } from "lucide-react";
import { apiGet } from "@/api/index";

export default function ReferralCard() {
  const [copied, setCopied] = useState(false);

  // Read from the cached dashboard-context query (no extra API call)
  const { data: dashCtx } = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/dashboard-context" });
      return res?.success ? res : null;
    },
    staleTime: 30 * 60_000,
  });

  const stats = dashCtx?.referral_stats;
  if (!stats?.referral_code) return null;

  const link = `${window.location.origin}/checkup?ref=${stats.referral_code}`;
  const friendsJoined = stats.referrals_converted || 0;
  const monthsEarned = stats.months_earned || 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="rounded-2xl border border-[#212D40]/10 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-[#D56753]/10 flex items-center justify-center">
          <Users className="h-5 w-5 text-[#D56753]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1A1D23]">
            See how a colleague ranks.
          </p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Send them your link. When they join, you both split month one. Rise together.
          </p>

          {/* Copy link */}
          <button
            onClick={handleCopy}
            className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 hover:border-[#D56753]/30 transition-colors group"
          >
            <span className="flex-1 text-xs text-gray-500 truncate text-left font-mono">
              {link}
            </span>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#D56753] shrink-0" />
            )}
          </button>

          {/* Stats (only show after first referral) */}
          {friendsJoined > 0 && (
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
              <span>{friendsJoined} colleague{friendsJoined !== 1 ? "s" : ""} joined</span>
              <span>{monthsEarned} free month{monthsEarned !== 1 ? "s" : ""} earned</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
