/**
 * Founders Initiative Page (WO-11)
 * Route: /foundation/founders
 */

import { Link } from "react-router-dom";
import { Rocket, Target, Users } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function FoundersPage() {
  return (
    <MarketingLayout
      title="Founders Initiative"
      description="Supporting first-generation practice owners building without a playbook. Market intelligence, founder network, and launch accelerator."
    >
      <section className="px-6 py-20 max-w-3xl mx-auto">
        <Link to="/foundation" className="text-xs text-gray-400 hover:text-[#D56753] mb-6 block">
          &larr; Back to Foundation
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <Rocket className="h-6 w-6 text-[#D56753]" />
          <p className="text-xs font-semibold uppercase tracking-widest text-[#D56753]">
            Founders Initiative
          </p>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1D23] leading-tight">
          You built something from nothing. Now build it into something undeniable.
        </h1>
        <p className="mt-6 text-base text-gray-600 leading-relaxed">
          The Founders Initiative supports first-generation business owners who are
          building without a playbook. No family in the profession. No inherited client
          base. Just skill, determination, and a vision for what their business could become.
        </p>
        <div className="mt-6 rounded-xl bg-[#D56753] p-5 text-center">
          <p className="text-sm font-semibold text-white">
            First-year business owners: $400/month. Everything included.
          </p>
          <p className="text-xs text-white/70 mt-1">
            Same product. Same intelligence. Same 47 agents. Community pricing because the first year is the hardest.
          </p>
        </div>

        <div className="mt-12 space-y-8">
          <div className="flex gap-4">
            <Target className="h-5 w-5 text-[#D56753] mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-[#1A1D23]">Market Intelligence</h3>
              <p className="text-sm text-gray-500 mt-1">
                Know exactly where you stand in your market. Who your competitors are.
                What they're doing. And the specific, actionable steps to close the gap.
                Updated weekly, automatically.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Users className="h-5 w-5 text-[#D56753] mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-[#1A1D23]">Founder Network</h3>
              <p className="text-sm text-gray-500 mt-1">
                Connect with other first-generation founders who understand the unique
                challenges of building without a safety net. Monthly virtual roundtables.
                Quarterly in-person meetups.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Rocket className="h-5 w-5 text-[#D56753] mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-[#1A1D23]">Launch Accelerator</h3>
              <p className="text-sm text-gray-500 mt-1">
                Opening a new practice? Alloro's launch accelerator gives you the market
                intelligence, competitive positioning, and patient acquisition strategy
                that established practices take years to develop.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12">
          <Link
            to="/foundation/apply"
            className="inline-flex items-center justify-center rounded-xl bg-[#D56753] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            Apply for Founders Initiative
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
