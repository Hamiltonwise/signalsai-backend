/**
 * AAE 2026 Conference Landing Page -- /aae
 *
 * This is the page doctors visit after scanning the QR code at the Alloro booth.
 * Not the generic Checkup. This is booth-specific.
 *
 * Mobile-first. Terracotta (#D56753) and Navy (#212D40).
 * Zero API calls on load -- static page, loads instantly on cellular.
 */

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const SOCIAL_PROOF = [
  {
    quote: "I had no idea Centerville was that far ahead of me.",
    attribution: "Endodontist, Utah",
  },
  {
    quote: "Showed this to my front desk and they immediately understood the goal.",
    attribution: "Orthodontist, Colorado",
  },
  {
    quote: "The competitor map alone was worth 10 minutes of my time.",
    attribution: "Endodontist, Arizona",
  },
];

export default function AAELanding() {
  return (
    <div className="min-h-dvh bg-[#212D40] flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 py-16 text-center">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 mb-12">
          <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">alloro</span>
        </Link>

        {/* Badge */}
        <span className="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-[#D56753] bg-[#D56753]/10 rounded-full px-4 py-1.5 mb-8">
          AAE 2026
        </span>

        {/* Headline */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight max-w-md">
          You're at AAE 2026.
          <br />
          Run your free Checkup.
        </h1>

        {/* Subhead */}
        <p className="mt-5 text-base text-white/60 leading-relaxed max-w-sm">
          See exactly where you rank in your market. Takes 60 seconds.
        </p>

        {/* CTA */}
        <a
          href="/checkup?source=aae2026&mode=conference"
          className="mt-10 inline-flex items-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:shadow-[0_6px_28px_rgba(213,103,83,0.5)] hover:brightness-110 active:scale-[0.98] transition-all"
        >
          Start my Checkup
          <ArrowRight className="w-4.5 h-4.5" />
        </a>

        {/* Reassurance */}
        <p className="mt-5 text-sm text-white/30">
          No credit card. No commitment. Just clarity.
        </p>
      </main>

      {/* Social proof strip */}
      <section className="border-t border-white/10 px-5 py-10">
        <div className="max-w-lg mx-auto space-y-6">
          {SOCIAL_PROOF.map((item) => (
            <blockquote key={item.attribution} className="text-center">
              <p className="text-sm text-white/50 leading-relaxed italic">
                "{item.quote}"
              </p>
              <cite className="block mt-1.5 text-xs text-white/25 not-italic font-medium">
                -- {item.attribution}
              </cite>
            </blockquote>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center pb-8">
        <p className="text-[10px] text-white/15 uppercase tracking-widest">
          getalloro.com
        </p>
      </footer>
    </div>
  );
}

// T1 adds /aae route to App.tsx
