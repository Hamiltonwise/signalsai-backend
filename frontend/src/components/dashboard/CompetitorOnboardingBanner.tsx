/**
 * Competitor Onboarding Banner
 *
 * Renders on the Rankings dashboard when a location has not yet finalized
 * its v2 curated competitor list. Links to the per-location onboarding page
 * where the user discovers, curates, and runs their first analysis.
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

import { Sparkles, ArrowRight } from "lucide-react";

interface CompetitorOnboardingBannerProps {
  locationId: number;
  locationName?: string | null;
  status: "pending" | "curating";
}

export function CompetitorOnboardingBanner({
  locationId,
  locationName,
  status,
}: CompetitorOnboardingBannerProps) {
  const headline =
    status === "pending"
      ? "v2 competitor curation — improving ranking accuracy"
      : "Finish your v2 competitor list — improving ranking accuracy";

  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-700">
      <a
        href={`/dashboard/competitors/${locationId}/onboarding`}
        className="flex items-center gap-3 bg-gradient-to-r from-alloro-orange/10 to-alloro-orange/5 border border-alloro-orange/25 rounded-xl px-4 py-2.5 hover:from-alloro-orange/15 hover:to-alloro-orange/10 transition-all duration-200 group"
      >
        <div className="w-7 h-7 bg-alloro-orange text-white rounded-lg flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-alloro-orange/15 rounded text-alloro-orange text-[9px] font-black uppercase tracking-widest flex-shrink-0">
            Action needed
          </span>
          <span className="text-sm font-semibold text-alloro-navy truncate">
            {headline}
          </span>
          {locationName && (
            <span className="text-[10px] font-bold text-alloro-textDark/40 uppercase tracking-widest truncate hidden md:inline">
              · {locationName}
            </span>
          )}
        </div>
        <div className="flex items-center text-alloro-orange font-bold text-xs gap-1 group-hover:translate-x-0.5 transition-transform duration-200 flex-shrink-0">
          Set up
          <ArrowRight size={13} />
        </div>
      </a>
    </section>
  );
}

interface LegacyRankingTagProps {
  className?: string;
}

/**
 * Subtle tag rendered next to the rank score when the latest ranking row was
 * produced before the v2 curated-competitor flow shipped (auto-discovered).
 */
export function LegacyRankingTag({ className = "" }: LegacyRankingTagProps) {
  return (
    <span
      title="This score was generated before you curated your competitor list. Set up your list to refresh it."
      className={`inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest ${className}`}
    >
      v1 · auto-discovered
    </span>
  );
}
