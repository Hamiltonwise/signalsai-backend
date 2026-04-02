/**
 * Product Changelog -- /changelog
 *
 * Doctors who see their dashboard improve want to know why.
 * Showing the changelog builds trust and daily stickiness.
 * Reverse chronological. Plain English. Written for the doctor.
 */

import { ArrowRight } from "lucide-react";
import MarketingLayout from "../components/marketing/MarketingLayout";

// ─── Changelog Entries ──────────────────────────────────────────────

interface ChangelogEntry {
  date: string;
  headline: string;
  items: string[];
}

const ENTRIES: ChangelogEntry[] = [
  {
    date: "March 24, 2026",
    headline: "A significant update",
    items: [
      "Your Checkup now creates your account automatically -- no separate signup step.",
      "The One Action Card now shows the single most important move for your specific market.",
      "Monday morning emails now include what Alloro did this week, not just what it observed.",
      "GP drift alerts now show the dollar figure at risk.",
      "Growth Mode now shows your exact gap to the next position.",
    ],
  },
  {
    date: "March 17, 2026",
    headline: "Competitor intelligence gets sharper",
    items: [
      "Competitors now appear on a live map with real pins for every business in your market.",
      "Review velocity tracking shows who's gaining on you and how fast.",
      "The scanning theater now streams live reviews from your competitors during your Checkup.",
    ],
  },
  {
    date: "March 10, 2026",
    headline: "Your referral network, visible",
    items: [
      "GP Referral Intelligence screen shows every referring doctor by name.",
      "Drift alerts fire when a consistent referrer goes quiet.",
      "Dollar figures attached to every referral relationship.",
      "Upload any PMS export -- Dentrix, Eaglesoft, OpenDental all work.",
    ],
  },
  {
    date: "March 3, 2026",
    headline: "The foundation",
    items: [
      "Free Business Clarity Checkup launched -- 60 seconds to your competitive position.",
      "Score reveal with three real findings and dollar figures.",
      "City disambiguation so you're compared to the right market.",
      "Referral codes so doctors can share with colleagues.",
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────

export default function Changelog() {
  return (
    <MarketingLayout title="Changelog" description="What's new in Alloro. Product updates written in plain English.">
      <div className="max-w-lg mx-auto px-5 py-12 sm:py-16 space-y-10">
        {/* Title */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-2">
            What's new
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#212D40] tracking-tight">
            Changelog
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Everything we shipped, in plain English.
          </p>
        </div>

        {/* Entries */}
        <div className="space-y-8">
          {ENTRIES.map((entry) => (
            <article
              key={entry.date}
              className="rounded-2xl border border-gray-200 bg-white p-6"
            >
              <p className="text-xs font-bold text-slate-400 mb-1">
                {entry.date}
              </p>
              <h2 className="text-base font-semibold text-[#212D40] mb-4">
                {entry.headline}
              </h2>
              <ul className="space-y-2.5">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[#D56753]" />
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {item}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-[#212D40] p-6 text-center">
          <p className="text-sm font-bold text-white">
            Want to see what's coming?
          </p>
          <a
            href="mailto:corey@getalloro.com"
            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#D56753] hover:underline"
          >
            Email corey@getalloro.com
            <ArrowRight className="w-3 h-3" />
          </a>
        </div>

      </div>
    </MarketingLayout>
  );
}

// T1 adds /changelog route to App.tsx
