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
      ? "Set up your competitor list"
      : "Finish setting up your competitor list";
  const sub =
    status === "pending"
      ? "Pick the practices you actually compete with so your Practice Health score reflects reality."
      : "You started picking competitors — finish the list so your next ranking runs against the right practices.";

  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-700">
      <a
        href={`/dashboard/competitors/${locationId}/onboarding`}
        className="block bg-gradient-to-r from-alloro-orange/10 to-alloro-orange/5 border border-alloro-orange/30 rounded-3xl p-6 lg:p-7 hover:from-alloro-orange/15 hover:to-alloro-orange/10 transition-all duration-200 group"
      >
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 bg-alloro-orange text-white rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
            <Sparkles size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-alloro-orange/15 rounded-md text-alloro-orange text-[9px] font-black uppercase tracking-widest">
                Action needed
              </span>
              {locationName && (
                <span className="text-[10px] font-bold text-alloro-textDark/40 uppercase tracking-widest truncate">
                  {locationName}
                </span>
              )}
            </div>
            <h3 className="text-lg lg:text-xl font-black font-heading text-alloro-navy tracking-tight mb-1">
              {headline}
            </h3>
            <p className="text-sm text-slate-600 font-medium leading-relaxed pr-4">
              {sub}
            </p>
          </div>
          <div className="flex items-center text-alloro-orange font-bold text-sm gap-1.5 group-hover:translate-x-1 transition-transform duration-200 flex-shrink-0 hidden sm:flex">
            Set up
            <ArrowRight size={16} />
          </div>
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
