/**
 * Heroes Initiative Page (WO-11)
 * Route: /foundation/heroes
 */

import { Link } from "react-router-dom";
import { Shield, Star, Award } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function HeroesPage() {
  return (
    <MarketingLayout
      title="Heroes Initiative"
      description="For veterans who transitioned from military service to business ownership. Full access to Alloro's business clarity platform."
    >
      <section className="px-6 py-20 max-w-3xl mx-auto">
        <Link to="/foundation" className="text-xs text-gray-400 hover:text-[#D56753] mb-6 block">
          &larr; Back to Foundation
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-6 w-6 text-[#D56753]" />
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
            Heroes Initiative
          </p>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#212D40] leading-tight">
          You protected something bigger than yourself. Now protect what you built.
        </h1>
        <p className="mt-6 text-base text-gray-600 leading-relaxed">
          The Heroes Initiative is for veterans who transitioned from military service to
          business ownership. You learned discipline, leadership, and sacrifice. Those
          skills built your business. Alloro gives you the clarity to protect it.
        </p>
        <div className="mt-6 rounded-xl bg-[#212D40] p-5 text-center">
          <p className="text-sm font-bold text-white">
            Veterans, active duty spouses, first responders, Gold Star families: Alloro is free. Forever.
          </p>
          <p className="text-xs text-white/50 mt-1">
            Not discounted. Not a trial. Full access. No time limit.
          </p>
        </div>

        <div className="mt-12 space-y-8">
          <div className="flex gap-4">
            <Star className="h-5 w-5 text-[#D56753] mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-[#212D40]">RISE Scholars Program</h3>
              <p className="text-sm text-gray-500 mt-1">
                Full access to Alloro's business clarity platform. Market position
                tracking, competitor monitoring, weekly intelligence briefs, and a
                PatientPath website built for your practice. No cost. No time limit.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Award className="h-5 w-5 text-[#D56753] mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-[#212D40]">Your Story, Told Right</h3>
              <p className="text-sm text-gray-500 mt-1">
                Every RISE Scholar gets a profile that tells their story. Not a case study.
                Not a testimonial. Your story, in your words, presented with the respect
                it deserves.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Shield className="h-5 w-5 text-[#D56753] mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-[#212D40]">VA Benefits Integration</h3>
              <p className="text-sm text-gray-500 mt-1">
                100% P&T disability rating? Your VA benefits extend further than you think.
                Alloro helps you understand exactly how your benefits intersect with
                practice ownership, from funding fee waivers to tax optimization.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12">
          <Link
            to="/foundation/apply"
            className="inline-flex items-center justify-center rounded-xl bg-[#D56753] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            Apply for RISE Scholars
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
