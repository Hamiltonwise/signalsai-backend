/**
 * Story -- /story
 *
 * Why this exists. Corey's voice. No stock photos.
 */

import { Link } from "react-router-dom";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function Story() {
  return (
    <MarketingLayout
      title="Our Story"
      description="Why Alloro exists. Built by a USAF veteran who spent ten years inside the problem."
      ogType="article"
    >
      {/* Hero */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight">
            Why this exists.
          </h1>
          <Link
            to="/checkup"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See what your market looks like
          </Link>
          <p className="mt-2 text-xs text-gray-400">Free. 60 seconds.</p>
        </div>
      </section>

      {/* The Opening */}
      <section className="px-5 pb-12 sm:pb-16">
        <div className="max-w-xl mx-auto space-y-6">
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            I spent five years inside specialist medical practices
            watching incredibly talented doctors struggle with a
            problem that had nothing to do with their medicine.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            They were excellent clinicians. The businesses around
            them, the referral relationships, the local visibility,
            the competitive dynamics, the things that determined
            whether they grew or slowly declined, were speaking
            a language nobody translated for them.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            They hired agencies. They got reports. The reports didn't
            tell them what to do. The agencies charged regardless.
            The problem persisted.
          </p>
        </div>
      </section>

      {/* The Service Years */}
      <section className="px-5 py-12 sm:py-16 bg-white">
        <div className="max-w-xl mx-auto space-y-6">
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            I served in the United States Air Force. When I got out,
            I had a 100% service-connected disability rating and no
            idea what came next.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            What came next was ten years in the dental specialist
            space, first as an operator, then building the product
            I wish had existed when I was trying to help practices
            understand what their own data was saying.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            I'm not a dentist. I'm not a software engineer. I'm
            someone who lived inside the problem long enough to
            understand it from the inside, then built the solution
            from the outside.
          </p>
        </div>
      </section>

      {/* The Reason */}
      <section className="px-5 py-12 sm:py-16">
        <div className="max-w-xl mx-auto space-y-6">
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            Alloro exists because 34 million people started a
            business to get their life back. Most of them are
            still waiting.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            The ones who built something worth building deserve
            the intelligence layer to protect it, grow it, and
            eventually hand it to someone who matters, whether
            that's a successor, a buyer, or their own kid.
          </p>
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            That's what Business Clarity means. Not a dashboard.
            Not a report. The confidence that comes from knowing
            which referral source went quiet last month, which
            competitor just opened near you, and what to do about
            both before Monday morning.
          </p>
        </div>
      </section>

      {/* Foundation */}
      <section className="px-5 py-12 sm:py-16 bg-white">
        <div className="max-w-xl mx-auto space-y-6">
          <p className="text-base text-[#212D40]/80 leading-relaxed">
            Heroes &amp; Founders Foundation is Alloro's commitment
            that the people who chose service first, in uniform,
            in medicine, in the trades, in public life, get the
            same intelligence that used to be reserved for companies
            with seven-figure marketing budgets.
          </p>
          <p>
            <Link to="/foundation" className="text-sm font-semibold text-[#D56753] hover:underline">
              Learn more about the Foundation &rarr;
            </Link>
          </p>
        </div>
      </section>

      {/* Corey */}
      <section className="px-5 py-12 sm:py-16">
        <div className="max-w-xl mx-auto text-center">
          {/* Photo placeholder: replace with real image */}
          <div className="w-32 h-32 rounded-full bg-[#212D40]/10 mx-auto mb-4 flex items-center justify-center">
            <span className="text-xs text-[#212D40]/40">Photo</span>
          </div>
          <p className="text-sm font-bold text-[#212D40]">
            Corey Wise
          </p>
          <p className="text-xs text-[#212D40]/50">
            Founder, Alloro. USAF veteran, Bend Oregon.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#D56753] px-5 py-12 sm:py-16">
        <div className="max-w-md mx-auto text-center">
          <Link
            to="/checkup"
            className="inline-flex items-center justify-center rounded-xl bg-white text-[#212D40] text-base font-semibold px-8 py-4 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            Run your free Business Clarity Checkup
          </Link>
        </div>
      </section>

      {/* Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@id": "https://getalloro.com/#organization", "@type": "Organization", "name": "Alloro", "url": "https://getalloro.com", "foundedBy": { "@id": "https://getalloro.com/#corey" } },
              {
                "@id": "https://getalloro.com/#corey",
                "@type": "Person",
                "name": "Corey Wise",
                "jobTitle": "Founder",
                "description": "USAF veteran, Bend Oregon. Built Alloro from ten years inside the problem.",
                "affiliation": { "@id": "https://getalloro.com/#organization" },
              },
              {
                "@type": "Article",
                "headline": "Why Alloro Exists",
                "author": { "@id": "https://getalloro.com/#corey" },
                "publisher": { "@id": "https://getalloro.com/#organization" },
                "url": "https://getalloro.com/story",
                "datePublished": "2026-03-26",
                "dateModified": "2026-03-26",
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}
