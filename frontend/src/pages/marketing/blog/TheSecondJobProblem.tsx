/**
 * Blog Post: The second job nobody warned you about
 * Route: /blog/the-second-job-problem
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingLayout from "../../../components/marketing/MarketingLayout";
import BlogEmailCapture from "../../../components/marketing/BlogEmailCapture";

export default function TheSecondJobProblem() {
  return (
    <MarketingLayout
      title="The Second Job Nobody Warned You About"
      description="34 million people started businesses to get their life back. Most discovered they had bought a second job. Here's what nobody told them."
      ogType="article"
    >
      <article className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <header className="mb-12">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#D56753]">
            Business Clarity
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-[#212D40] leading-tight tracking-tight">
            The second job nobody warned you about
          </h1>
          <p className="mt-4 text-base text-[#212D40]/50">
            March 2026
          </p>
        </header>

        <div className="space-y-6 text-base text-[#212D40]/80 leading-relaxed">
          <p>
            Freedom is the number one reason people start businesses. Not money.
            Not legacy. Not even passion. Freedom. The ability to control your
            time, your schedule, your income, and your life.
          </p>
          <p>
            34 million Americans own businesses. Most of them started with that
            same impulse: do the thing you're great at, on your own terms, and
            build a life around it.
          </p>
          <p>
            Nobody warned them about the second job.
          </p>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            The job you trained for, and the one you didn't
          </h2>
          <p>
            If you're a specialist, you trained for years. Residencies. Board
            exams. Clinical hours. You became excellent at something specific.
            Then you opened a business, or bought one, or inherited one, and
            discovered there's an entire parallel job that nobody mentioned in
            school.
          </p>
          <p>
            Marketing. Competitive positioning. Online reputation. Referral
            relationship management. Employee retention. Insurance negotiation.
            These aren't side tasks. Together, they form a full-time job, and
            most business owners are doing it on top of the core work that
            already fills their day.
          </p>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            The language problem
          </h2>
          <p>
            Here's the part nobody talks about: your business is constantly
            generating signals. Review velocity. Ranking fluctuations. Referral
            patterns. Competitor moves. These signals are the language of your
            business's health, and they're speaking all the time.
          </p>
          <p>
            Most owners don't hear them. Not because they're not smart. Because
            nobody ever taught them the language. The typical response is to hire
            an agency, a consultant, or a "marketing person" to translate.
          </p>
          <p>
            The problem: most of those translators don't speak the language
            either. They speak the language of deliverables. Reports. Dashboards.
            Monthly calls where someone reads numbers you could have read
            yourself. The business keeps talking. Nobody translates.
          </p>

          <h2 className="text-xl font-bold text-[#212D40] pt-4">
            What clarity looks like
          </h2>
          <p>
            Business Clarity is not a report. It's not a dashboard. It's the
            confidence that comes from knowing three things:
          </p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>What is happening in your market right now.</li>
            <li>What it means for your business specifically.</li>
            <li>The one thing you can do this week that changes it.</li>
          </ol>
          <p>
            That's it. One score. One finding. One action. Every Monday morning.
            In plain English. Before you see your first client.
          </p>
          <p>
            The business you built deserves a translator that actually speaks
            its language. That's what Alloro does.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-2xl bg-[#D56753]/5 border border-[#D56753]/20 p-8 text-center">
          <p className="text-base font-bold text-[#212D40] mb-2">
            Curious what your business is saying?
          </p>
          <p className="text-sm text-[#212D40]/50 mb-4">
            Run your free Business Clarity Checkup. 60 seconds.
          </p>
          <Link
            to="/checkup"
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See my market
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Email capture */}
        <div className="mt-12">
          <BlogEmailCapture />
        </div>

        {/* Related reading */}
        <div className="mt-12">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Related reading</h3>
          <div className="space-y-3">
            <Link to="/blog/google-business-profile-score" className="block rounded-xl border border-gray-200 p-4 hover:border-[#D56753]/30 transition-colors">
              <p className="text-sm font-bold text-[#212D40]">What your Google Business Profile score actually means</p>
              <p className="text-xs text-[#212D40]/50 mt-1">The one metric that determines who finds you first.</p>
            </Link>
            <Link to="/blog/why-your-competitor-keeps-showing-up" className="block rounded-xl border border-gray-200 p-4 hover:border-[#D56753]/30 transition-colors">
              <p className="text-sm font-bold text-[#212D40]">Why your top competitor keeps showing up where you don't</p>
              <p className="text-xs text-[#212D40]/50 mt-1">It's not luck. It's a pattern. Here's what drives it.</p>
            </Link>
          </div>
        </div>

        {/* Back to blog */}
        <div className="mt-8 text-center">
          <Link to="/blog" className="text-sm text-[#D56753] font-medium hover:underline">
            &larr; All posts
          </Link>
        </div>
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@id": "https://getalloro.com/#organization", "@type": "Organization", "name": "Alloro" },
              {
                "@type": "Article",
                "headline": "The Second Job Nobody Warned You About",
                "description": "34 million people started businesses to get their life back. Most discovered they had bought a second job.",
                "url": "https://getalloro.com/blog/the-second-job-problem",
                "publisher": { "@id": "https://getalloro.com/#organization" },
                "author": { "@type": "Person", "name": "Corey Wise" },
                "datePublished": "2026-03-26",
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}
