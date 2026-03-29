/**
 * BlogRedirect -- /blog/:slug
 *
 * Placeholder: shows "coming soon" message and redirects to /checkup.
 */

import { Link } from "react-router-dom";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function BlogRedirect() {
  return (
    <MarketingLayout
      title="Coming Soon"
      description="This guide is coming soon. Run your free Checkup while you're here."
    >
      <section className="px-5 py-24 sm:py-32">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold text-[#212D40] mb-4">
            This guide is coming soon.
          </h1>
          <p className="text-base text-[#212D40]/60 mb-8">
            Run your free Checkup while you're here.
          </p>
          <Link
            to="/checkup"
            className="inline-flex items-center justify-center rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See where you rank
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
