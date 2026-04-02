/**
 * Blog -- /blog
 *
 * Index page. 3 placeholder cards. Each links to /blog/[slug]
 * which redirects to /checkup until posts are published.
 */

import { Link } from "react-router-dom";
import MarketingLayout from "../../components/marketing/MarketingLayout";

const POSTS = [
  {
    slug: "the-second-job-problem",
    category: "Business Clarity",
    title: "The second job nobody warned you about",
    summary:
      "We've watched hundreds of business owners realize the same thing in year two: the business they bought to have freedom became the job they left. This post is about the exact point where that turns.",
  },
  {
    slug: "google-business-profile-score",
    category: "Local Search",
    title: "What your Google Business Profile score actually means",
    summary:
      "We pulled the GBP data on 200 local specialists. The ones ranking highest weren't the ones with the most reviews. Here's what was actually different.",
  },
  {
    slug: "why-your-competitor-keeps-showing-up",
    category: "Competitive Intelligence",
    title: "Why your top competitor keeps showing up where you don't",
    summary:
      "In every market we've analyzed, the same three behaviors separate the businesses showing up first from the ones asking why they're invisible. None of them are expensive. One takes 20 minutes.",
  },
];

export default function Blog() {
  return (
    <MarketingLayout
      title="Blog - Business Clarity"
      description="One post a week. Each one comes from something we actually saw in client data. No aggregated advice."
    >
      {/* Hero */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#212D40] tracking-tight">
            Alloro Blog
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#212D40]/60 leading-relaxed">
            One post a week. Each one comes from something
            we actually saw in client data. No aggregated advice.
          </p>
          <Link
            to="/checkup"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Run your free Checkup
          </Link>
        </div>
      </section>

      {/* Posts grid */}
      <section className="px-5 pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {POSTS.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-[#D56753]/30 hover:shadow-sm transition-all"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
                {post.category}
              </span>
              <h2 className="mt-3 text-base font-bold text-[#212D40] leading-snug group-hover:text-[#D56753] transition-colors">
                {post.title}
              </h2>
              <p className="mt-3 text-sm text-[#212D40]/60 leading-relaxed">
                {post.summary}
              </p>
              <span className="mt-4 inline-block text-xs font-semibold text-[#D56753]">
                Read &rarr;
              </span>
            </Link>
          ))}
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
                "@type": "Blog",
                "name": "Business Clarity",
                "description": "One post a week. Each one comes from something we actually saw in client data.",
                "url": "https://getalloro.com/blog",
                "publisher": { "@id": "https://getalloro.com/#organization" },
              },
              {
                "@type": "ItemList",
                "itemListElement": POSTS.map((post, i) => ({
                  "@type": "ListItem",
                  "position": i + 1,
                  "url": `https://getalloro.com/blog/${post.slug}`,
                  "name": post.title,
                })),
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}
