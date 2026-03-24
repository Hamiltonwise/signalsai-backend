/**
 * Public Homepage -- /
 *
 * What a doctor sees when they type getalloro.com.
 * Not a marketing brochure. A direct challenge.
 * Mobile-first. Terracotta (#D56753) and Navy (#212D40).
 */

import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
      {/* ─── Section 1: The Hook ───────────────────────────────────── */}
      <section className="bg-[#212D40] px-5 py-20 sm:py-28">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight">
            Every endodontist has a referring GP they're about to lose.
            <br className="hidden sm:block" />
            <span className="text-[#D56753]"> We know which one it is.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-white/60 leading-relaxed max-w-lg mx-auto">
            Run your free Business Clarity Checkup. 60 seconds.
          </p>
          <a
            href="/checkup"
            className="mt-8 w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:shadow-[0_6px_28px_rgba(213,103,83,0.5)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See my market
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ─── Section 2: The Proof ──────────────────────────────────── */}
      <section className="px-5 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto grid sm:grid-cols-3 gap-4">
          <ProofCard
            number="60"
            unit="seconds"
            text="to your first finding"
          />
          <ProofCard
            number="Named"
            unit="competitors"
            text="on a live map"
          />
          <ProofCard
            number="One"
            unit="move"
            text="that changes your week"
          />
        </div>
      </section>

      {/* ─── Section 3: The ICP Mirror ─────────────────────────────── */}
      <section className="bg-white px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto space-y-8">
          <p className="text-sm text-[#212D40]/80 leading-relaxed">
            You watched Centerville climb past you in search results last
            quarter. You're not sure what they did differently, but patients
            are mentioning their name now.
          </p>
          <p className="text-sm text-[#212D40]/80 leading-relaxed">
            Your top referring GP sent 14 patients last year. This quarter,
            two. You haven't called because you're not sure if it's you or
            if they retired. It's neither.
          </p>
          <p className="text-sm text-[#212D40]/80 leading-relaxed">
            The competitor two blocks from you has 280 Google reviews. You
            have 34. You didn't know because you stopped looking. That gap
            is why your Tuesday afternoons are empty.
          </p>
          <div className="pt-4">
            <a
              href="/checkup"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#D56753] hover:underline"
            >
              Sound familiar? Run your Checkup.
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Section 4: What Alloro Does ───────────────────────────── */}
      <section className="px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#212D40] tracking-tight">
            Business Clarity. Not a dashboard.
          </h2>
          <div className="mt-8 space-y-4">
            <p className="text-base text-[#212D40]/70 leading-relaxed">
              Your competitors, by name, on a live map.
            </p>
            <p className="text-base text-[#212D40]/70 leading-relaxed">
              The GP who's drifting -- before you notice the revenue drop.
            </p>
            <p className="text-base text-[#212D40]/70 leading-relaxed">
              One action. Monday morning. Every week.
            </p>
          </div>
          <a
            href="/checkup"
            className="mt-10 w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:shadow-[0_6px_28px_rgba(213,103,83,0.5)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Start free
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ─── Section 5: Footer ─────────────────────────────────────── */}
      <footer className="border-t border-gray-200 px-5 py-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <a href="/business-clarity" className="hover:text-[#D56753] transition-colors">
              Business Clarity
            </a>
            <a href="/checkup" className="hover:text-[#D56753] transition-colors">
              Free Checkup
            </a>
            <a href="/aae" className="hover:text-[#D56753] transition-colors">
              AAE 2026
            </a>
          </div>
          <p className="mt-6 text-center text-[11px] text-slate-300">
            &copy; 2026 Alloro, Inc. Bend, Oregon.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Proof Card ─────────────────────────────────────────────────────

function ProofCard({
  number,
  unit,
  text,
}: {
  number: string;
  unit: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
      <p className="text-3xl font-black text-[#212D40]">{number}</p>
      <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mt-1">
        {unit}
      </p>
      <p className="text-sm text-slate-500 mt-2">{text}</p>
    </div>
  );
}

// T1 verifies / route points to Home.tsx in App.tsx
