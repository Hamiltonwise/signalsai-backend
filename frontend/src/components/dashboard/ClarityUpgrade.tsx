/**
 * ClarityUpgrade -- The natural upgrade prompt for DWY users.
 *
 * Not a sales pitch. Not a banner ad. A quiet card that surfaces
 * ONCE per session, showing what Alloro could do based on the
 * user's actual data.
 *
 * "You can see the problem. Want us to fix it?"
 *
 * Like a doctor who shows you the blood panel and says:
 * "Here's what I'd recommend."
 *
 * Design: appears below the One Action Card, styled like the
 * other dashboard cards. Dismissable. Never aggressive.
 */

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useTier } from "@/hooks/useTier";

interface ClarityUpgradeProps {
  hasWebsite: boolean;
  reviewCount: number;
  competitorReviewCount: number;
  rankPosition: number | null;
}

export default function ClarityUpgrade({
  hasWebsite,
  reviewCount,
  competitorReviewCount,
  rankPosition,
}: ClarityUpgradeProps) {
  const { canUpgrade, isDWY } = useTier();
  const [dismissed, setDismissed] = useState(false);

  // Only show for DWY users, once per session
  if (!canUpgrade || !isDWY || dismissed) return null;

  // Generate the context from their actual data
  let headline = "";
  let detail = "";

  if (!hasWebsite && rankPosition && rankPosition > 3) {
    headline = "We could build your website this week.";
    detail = `You're #${rankPosition} in your market without one. We'd build it from your reviews, index it, and have it ranking. You wouldn't touch it.`;
  } else if (competitorReviewCount > reviewCount * 1.5) {
    const gap = competitorReviewCount - reviewCount;
    headline = `${gap} reviews stand between you and #1.`;
    detail = "We could send review requests to your customers automatically. Personalized. One at a time. You'd never think about it.";
  } else if (rankPosition && rankPosition > 1) {
    headline = "We found the gaps. We could close them.";
    detail = "Your website, your search presence, your review velocity. All of it, running without you. That's what Clarity + Freedom looks like.";
  } else {
    headline = "You see the data. We could act on it.";
    detail = "Website, reviews, referral outreach, search optimization. All running. You focus on your craft.";
  }

  return (
    <div className="rounded-2xl border border-[#D56753]/15 bg-white p-5 relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1 text-gray-300 hover:text-gray-500 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <p className="text-[10px] font-bold uppercase tracking-widest text-[#D56753]/50 mb-2">
        Based on your data
      </p>
      <p className="text-sm font-bold text-[#212D40] leading-snug pr-6">
        {headline}
      </p>
      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
        {detail}
      </p>

      <a
        href="/settings/billing"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#212D40] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#212D40]/90 active:scale-[0.98] transition-all"
      >
        See what changes
        <ArrowRight className="h-3.5 w-3.5" />
      </a>

      <p className="text-[10px] text-gray-400 mt-3">
        No commitment. See the difference first.
      </p>
    </div>
  );
}
