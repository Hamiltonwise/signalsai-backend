/**
 * BlogRedirect -- /blog/:slug
 *
 * Redirects to checkup. No dead ends.
 */

import { Link } from "react-router-dom";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function BlogRedirect() {
  return (
    <MarketingLayout
      title="Business Clarity Checkup"
      description="See where you rank in your market. Free. 60 seconds."
    >
      <section className="px-5 py-24 sm:py-32">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold text-[#212D40] mb-4">
            See where you rank in your market.
          </h1>
          <p className="text-base text-[#212D40]/60 mb-8">
            Your free Business Clarity Checkup shows your competitive position,
            review gaps, and the one thing most affecting your visibility right now.
          </p>
          <Link
            to="/checkup"
            className="inline-flex items-center justify-center rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Run your free Checkup
          </Link>
          <p className="mt-3 text-xs text-gray-400">Free. 60 seconds. No account required.</p>
        </div>
      </section>
    </MarketingLayout>
  );
}
