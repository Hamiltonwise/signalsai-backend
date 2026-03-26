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
    slug: "accidental-business-owner-problem",
    category: "Business Clarity",
    title: "The accidental business owner problem no one is solving",
    summary:
      "34 million people started businesses to get their life back. Most discovered they had accidentally bought a second job. Here's what nobody told them.",
  },
  {
    slug: "google-business-profile-score",
    category: "Local Search",
    title: "What your Google Business Profile score actually means",
    summary:
      "Your GBP score is the first thing a potential client sees. What drives it, what breaks it, and the one thing you can do this week to move it.",
  },
  {
    slug: "why-your-competitor-keeps-showing-up",
    category: "Competitive Intelligence",
    title: "Why your top competitor keeps showing up where you don't",
    summary:
      "It's not luck. It's not budget. There's a pattern behind who shows up first in your market. Here's what your competitor knows that you don't.",
  },
];

export default function Blog() {
  return (
    <MarketingLayout
      title="Blog - Business Clarity"
      description="What your business is trying to tell you. Published every week."
    >
      {/* Hero */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight">
            Business Clarity
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#212D40]/60 leading-relaxed">
            What your business is trying to tell you.
            Published every week.
          </p>
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#D56753]">
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
                "description": "What your business is trying to tell you. Published every week.",
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
