/**
 * RisePage -- /rise
 *
 * Rise Together program. Locked copy from Website Architecture spec.
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function RisePage() {
  return (
    <MarketingLayout
      title="Rise Together"
      description="Bring someone who needs this and you carry the cost together. Three months at half price for both of you."
    >
      <section className="px-5 py-16 sm:py-24 bg-white">
        <div className="max-w-xl mx-auto space-y-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight leading-tight">
            Bring someone who needs this
            and you carry the cost together.
          </h1>

          <div className="space-y-5 text-base text-[#212D40]/80 leading-relaxed">
            <p>
              For three months, you both pay $1,000/month.
              At month four, you're both at standard rate.
              And you've both had three months of clarity
              that changes how you see your business.
            </p>
            <p>
              The pre-written message is already in your Monday email.
              One tap. Their name attached. Sixty seconds to send.
            </p>
            <p className="font-semibold text-[#212D40]">
              Because you know someone who is watching the same problem
              you were watching before Monday.
            </p>
          </div>

          <Link
            to="/checkup"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See Where You Rank <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@id": "https://getalloro.com/#organization", "@type": "Organization", name: "Alloro", url: "https://getalloro.com" },
              { "@type": "WebPage", "@id": "https://getalloro.com/rise", url: "https://getalloro.com/rise", name: "Rise Together", isPartOf: { "@id": "https://getalloro.com/#website" } },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}
