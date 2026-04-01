// T1 adds /business-clarity/specialists route
/**
 * Business Clarity Hub -- /business-clarity/specialists
 *
 * Category hub page linking to all vertical content pages.
 * Target query: "business intelligence for medical practice" /
 * "practice management software alternatives"
 * BreadcrumbList JSON-LD connecting all vertical pages.
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const VERTICALS = [
  {
    title: "Endodontists",
    description:
      "Referral drift detection, GP relationship intelligence, and competitive positioning for endodontic practices.",
    href: "/endodontist-marketing",
    ready: true,
  },
  {
    title: "Orthodontists",
    description:
      "Dual-front intelligence: GP referral monitoring and direct consumer visibility for orthodontic practices.",
    href: "/orthodontist-marketing",
    ready: true,
  },
  {
    title: "Chiropractors",
    description:
      "Competitive market clarity, review intelligence, and client acquisition insights for chiropractic businesses.",
    href: "/chiropractor-marketing",
    ready: false,
  },
  {
    title: "Optometrists",
    description:
      "Market positioning, referral network health, and competitive visibility for optometry practices.",
    href: "/optometrist-marketing",
    ready: false,
  },
  {
    title: "Physical Therapists",
    description:
      "Physician referral tracking, competitive market mapping, and growth intelligence for PT practices.",
    href: "/pt-marketing",
    ready: false,
  },
  {
    title: "Veterinarians",
    description:
      "Review gap analysis, local market intelligence, and competitive positioning for veterinary practices.",
    href: "/veterinarian-marketing",
    ready: false,
  },
];

const INTRO =
  "Every specialist practice shares the same problem: you trained for years in a craft you love, built or bought a business to practice it, and discovered that running the business is a second job nobody prepared you for. The data exists -- in your PMS, your Google profile, your referral patterns, your competitor's public footprint. But nobody is reading it for you. Nobody is translating it into the one thing you should do this week. That is the gap Business Clarity closes.";

const BREADCRUMB_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Business Clarity",
      item: "https://getalloro.com/business-clarity",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "For Specialists",
      item: "https://getalloro.com/business-clarity/specialists",
    },
    ...VERTICALS.map((v, i) => ({
      "@type": "ListItem" as const,
      position: i + 3,
      name: v.title,
      item: `https://getalloro.com${v.href}`,
    })),
  ],
};

export default function BusinessClarityHub() {
  const navigate = useNavigate();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />

      <div className="min-h-dvh bg-[#FAFAF8]">
        <header className="flex items-center justify-center pt-10 pb-6 px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-[22px] font-bold tracking-tight text-[#212D40]">
              alloro
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 pb-16">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight text-center mt-8">
            Business Clarity for Licensed Specialists
          </h1>

          <p className="text-base sm:text-lg text-gray-700 leading-relaxed text-center mt-6 max-w-xl mx-auto">
            {INTRO}
          </p>

          {/* Vertical Cards */}
          <div className="mt-12 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
              Choose your specialty
            </h2>
            {VERTICALS.map((vertical) => (
              <button
                key={vertical.href}
                onClick={() => navigate(vertical.href)}
                className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-left hover:border-[#D56753]/30 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-[#212D40] group-hover:text-[#D56753] transition-colors">
                      {vertical.title}
                    </p>
                    <p className="text-sm text-gray-500 leading-relaxed mt-1">
                      {vertical.description}
                    </p>
                    {!vertical.ready && (
                      <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider text-[#D56753]/60 bg-[#D56753]/5 px-2 py-0.5 rounded">
                        Run your free checkup
                      </span>
                    )}
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-300 group-hover:text-[#D56753] transition-colors shrink-0 ml-4" />
                </div>
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <button
              onClick={() => navigate("/checkup")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-8 py-4 text-base font-semibold text-white shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:shadow-[0_6px_20px_rgba(213,103,83,0.45)] hover:brightness-105 active:scale-[0.98] transition-all"
            >
              Run your free Business Clarity Checkup
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Works for any specialty. See your score instantly. 60 seconds.
            </p>
          </div>
        </main>

        <footer className="py-8 text-center border-t border-slate-100">
          <p className="text-[11px] font-medium tracking-wide text-slate-300 uppercase">
            Alloro &middot; Business Clarity for Every Specialist
          </p>
        </footer>
      </div>
    </>
  );
}
