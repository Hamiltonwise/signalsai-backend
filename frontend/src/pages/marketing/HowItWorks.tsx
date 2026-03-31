/**
 * HowItWorks -- /how-it-works
 *
 * Plain English. No tech language. Three stages + expanded Monday email + FAQ.
 */

import { Link } from "react-router-dom";
import { Search, Mail, Zap } from "lucide-react";
import MarketingLayout from "../../components/marketing/MarketingLayout";

export default function HowItWorks() {
  return (
    <MarketingLayout
      title="How Alloro Works"
      description="Type your business name. Monday morning, we tell you which competitor gained ground and what to do about it."
    >
      {/* Hero */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#212D40] tracking-tight">
            How Alloro works
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#212D40]/60 leading-relaxed max-w-lg mx-auto">
            You type your business name. Monday morning, we tell you
            which competitor gained 11 reviews last week and what to do about it.
          </p>
          <Link
            to="/checkup"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Try it free
          </Link>
          <p className="mt-2 text-xs text-gray-400">60 seconds. No account required.</p>
        </div>
      </section>

      {/* Three Stages */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-3xl mx-auto space-y-12">
          <Stage
            icon={<Search className="w-6 h-6 text-[#D56753]" />}
            title="The Checkup (60 seconds, free)"
            body="Enter your business name. Alloro scans your market: competitors, rankings, review velocity, online visibility. You see your score and the one thing most affecting your position. No account required."
          />
          <Stage
            icon={<Mail className="w-6 h-6 text-[#212D40]" />}
            title="The Monday Brief (automated, every week)"
            body="Create an account. Every Monday at 7am, your Business Clarity Brief arrives. One score. One finding specific to your business. One action you can take this week. The brief takes 90 seconds to read. The action takes 10 minutes to do."
          />
          <Stage
            icon={<Zap className="w-6 h-6 text-[#D56753]" />}
            title="The Clarity Layer (ongoing, autonomous)"
            body="Connect your existing data. When your top referring source goes 30 days without sending a case, you get a note Monday morning, not a surprise three months later. When a competitor opens a second location, you know before your staff hears about it."
          />
        </div>
      </section>

      {/* Expanded Monday Email */}
      <section className="px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-[#212D40] text-center mb-8">
            What shows up Monday morning
          </h2>
          <div className="rounded-2xl border border-[#212D40]/20 bg-white overflow-hidden shadow-sm">
            <div className="h-1 bg-[#D56753]" />
            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs text-gray-400 mb-1">Subject:</p>
                <p className="text-sm font-bold text-[#212D40]">
                  Your market moved this week.
                </p>
              </div>

              {/* Finding 1 */}
              <div className="border-l-2 border-[#D56753] pl-4">
                <p className="text-sm text-[#212D40]/80 leading-relaxed">
                  Cascade Endodontics gained 11 reviews last week. You gained 0.
                  At this pace, they close the gap to rank #1 in your market
                  within 8 weeks. One review request to your last 10 patients
                  changes this trajectory.
                </p>
              </div>

              {/* Finding 2 */}
              <div className="border-l-2 border-[#212D40]/20 pl-4">
                <p className="text-sm text-[#212D40]/60 leading-relaxed">
                  Your top referral source hasn't sent business in 34 days. This
                  is the longest gap in 14 months. Worth a call this week.
                </p>
              </div>

              {/* Action card */}
              <div className="rounded-xl bg-[#D56753]/5 border border-[#D56753]/20 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#D56753] mb-2">
                  This week
                </p>
                <p className="text-sm text-[#212D40]/80 leading-relaxed">
                  Request reviews from 10 patients who came in last month.
                  Takes 8 minutes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-[#212D40] text-center mb-10">
            Questions
          </h2>
          <div className="space-y-8">
            <FAQ
              q="Do I need to install anything?"
              a="No. Alloro reads publicly available signals about your business's market position. Nothing is installed on your website or connected to your systems unless you choose to connect it."
            />
            <FAQ
              q="How long until I see my first Monday brief?"
              a="Your first brief arrives the Monday after you create your account. If you sign up on a Tuesday, you have something to read by Monday morning."
            />
            <FAQ
              q="What if I don't want to receive weekly emails?"
              a="You can pause them, change the frequency, or turn them off anytime from your dashboard. The data keeps running whether the emails do or not."
            />
            <FAQ
              q="Is my business data private?"
              a="Alloro reads market-level signals, not patient records. No patient data ever enters the system. The intelligence is about your competitive position, not about anyone who's visited your business."
            />
            <FAQ
              q="What specialties does Alloro serve?"
              a="We built this for specialist service businesses, endodontists, oral surgeons, orthodontists, and have since expanded to attorneys, veterinarians, physical therapists, financial advisors, and chiropractors. If your livelihood depends on local clients finding you and trusting you, Alloro was built for you."
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
            See where you rank
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
                "@type": "HowTo",
                "name": "How Alloro Works",
                "description": "Three steps to Business Clarity for your business.",
                "step": [
                  { "@type": "HowToStep", "name": "The Checkup", "text": "Enter your business name. Alloro scans your market and delivers your score in 60 seconds." },
                  { "@type": "HowToStep", "name": "The Monday Brief", "text": "Create an account. Every Monday at 7am, your Business Clarity Brief arrives." },
                  { "@type": "HowToStep", "name": "The Clarity Layer", "text": "Connect your existing data. When your top referring source goes 30 days without sending a case, you get a note Monday morning. When a competitor opens a second location, you know before your staff hears about it." },
                ],
              },
              {
                "@type": "FAQPage",
                "mainEntity": [
                  { "@type": "Question", "name": "Do I need to install anything?", "acceptedAnswer": { "@type": "Answer", "text": "No. Alloro reads publicly available signals about your business's market position." } },
                  { "@type": "Question", "name": "How long until I see my first Monday brief?", "acceptedAnswer": { "@type": "Answer", "text": "Your first brief arrives the Monday after you create your account." } },
                  { "@type": "Question", "name": "Is my business data private?", "acceptedAnswer": { "@type": "Answer", "text": "Alloro reads market-level signals, not patient records. No patient data ever enters the system." } },
                  { "@type": "Question", "name": "What if I don't want weekly emails?", "acceptedAnswer": { "@type": "Answer", "text": "You can pause, change the frequency, or turn them off anytime from your dashboard. The data keeps running whether the emails do or not." } },
                  { "@type": "Question", "name": "What specialties does Alloro serve?", "acceptedAnswer": { "@type": "Answer", "text": "We built this for specialist service businesses like endodontists, oral surgeons, and orthodontists, and have since expanded to attorneys, veterinarians, physical therapists, financial advisors, and chiropractors." } },
                ],
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}

function Stage({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-5">
      <div className="shrink-0 w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-bold text-[#212D40] mb-2">{title}</h3>
        <p className="text-sm text-[#212D40]/70 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-[#212D40] mb-2">{q}</h3>
      <p className="text-sm text-[#212D40]/70 leading-relaxed">{a}</p>
    </div>
  );
}
