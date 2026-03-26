/**
 * WhoItsFor -- /who-its-for
 *
 * Heroes + Founders + 9 vertical cards.
 */

import { Link } from "react-router-dom";
import {
  Stethoscope, Scale, Heart, Eye, Activity,
  PawPrint, Briefcase, Calculator, Users,
} from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function WhoItsFor() {
  return (
    <MarketingLayout
      title="Who Alloro Is For"
      description="Built for people who chose service first. If you trained for a craft and built a business around it, Alloro was built for you."
    >
      {/* Hero */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight">
            Built for people who chose service first.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-[#212D40]/60 leading-relaxed max-w-xl mx-auto">
            You spent years becoming excellent at your craft.
            Then you opened a business. Then you discovered the
            business has a language of its own, one nobody
            taught you. Alloro speaks it.
          </p>
        </div>
      </section>

      {/* Heroes */}
      <section className="px-5 py-12 sm:py-16 bg-white">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-[#212D40] mb-4">The Heroes</h2>
          <p className="text-base text-[#212D40]/70 leading-relaxed">
            If you spent years in service before you built
            something, in the military, in medicine, in public
            service, in the trades, you are a Hero. You chose
            others before you chose yourself. The business you
            built is the second chapter of that choice. It deserves
            to succeed.
          </p>
        </div>
      </section>

      {/* Founders */}
      <section className="px-5 py-12 sm:py-16">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-[#212D40] mb-4">The Founders</h2>
          <p className="text-base text-[#212D40]/70 leading-relaxed">
            If you took the leap, left the security of a
            salary, bet on yourself, opened a practice or a firm or
            a studio, you are a Founder. Most people won't do what
            you did. The business you built is proof of that.
          </p>
        </div>
      </section>

      {/* Verticals Grid */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <VerticalCard
              icon={<Stethoscope className="w-5 h-5 text-[#D56753]" />}
              title="Endodontists"
              desc="GP referral intelligence. Competitor ranking. Every Monday."
            />
            <VerticalCard
              icon={<Heart className="w-5 h-5 text-[#D56753]" />}
              title="Orthodontists"
              desc="New patient acquisition. Practice visibility. Market position."
            />
            <VerticalCard
              icon={<Activity className="w-5 h-5 text-[#D56753]" />}
              title="Chiropractors"
              desc="Local search dominance. Patient retention signals. Weekly clarity."
            />
            <VerticalCard
              icon={<Users className="w-5 h-5 text-[#D56753]" />}
              title="Physical Therapists"
              desc="Referral source tracking. Online presence monitoring. Plain English."
            />
            <VerticalCard
              icon={<Eye className="w-5 h-5 text-[#D56753]" />}
              title="Optometrists"
              desc="Competitive analysis. Review velocity. One action every week."
            />
            <VerticalCard
              icon={<PawPrint className="w-5 h-5 text-[#D56753]" />}
              title="Veterinarians"
              desc="Local visibility. Client acquisition signals. No jargon."
            />
            <VerticalCard
              icon={<Scale className="w-5 h-5 text-[#D56753]" />}
              title="Attorneys"
              desc="Market position. Referral patterns. Business intelligence weekly."
            />
            <VerticalCard
              icon={<Calculator className="w-5 h-5 text-[#D56753]" />}
              title="CPAs and Financial Advisors"
              desc="Client retention signals. Local visibility. The clarity layer."
            />
            <VerticalCard
              icon={<Briefcase className="w-5 h-5 text-[#D56753]" />}
              title="Anyone who trained for a craft and built a business around it"
              desc="If your livelihood depends on local clients finding you and trusting you, Alloro was built for you."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-16 sm:py-20">
        <div className="max-w-md mx-auto text-center">
          <Link
            to="/checkup"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Run your free Business Clarity Checkup
          </Link>
          <p className="mt-3 text-xs text-gray-400">
            Free. 60 seconds. No account required.
          </p>
        </div>
      </section>

      {/* Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@id": "https://getalloro.com/#organization", "@type": "Organization", "name": "Alloro", "url": "https://getalloro.com" },
              {
                "@type": "AboutPage",
                "name": "Who Alloro Is For",
                "description": "Built for local service professionals who trained for a craft and built a business around it.",
                "url": "https://getalloro.com/who-its-for",
                "publisher": { "@id": "https://getalloro.com/#organization" },
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}

function VerticalCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-[#FAFAF8] p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div>
          <h3 className="text-sm font-bold text-[#212D40] mb-1">{title}</h3>
          <p className="text-xs text-[#212D40]/60 leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  );
}
