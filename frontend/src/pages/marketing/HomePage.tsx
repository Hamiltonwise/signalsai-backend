/**
 * HomePage -- getalloro.com
 *
 * 10 scroll sections. Full Funnel Design Spec governs.
 * Option C headline. Checkup input embedded as the CTA.
 * Every word is locked copy from the spec. Do not rewrite.
 *
 * Vocabulary rule: "business" not "practice" on all pre-login surfaces.
 * Exception: inside quoted testimonial speech.
 */

import { useState, useCallback, useRef } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { ArrowRight, Search, MapPin, Loader2 } from "lucide-react";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { trackEvent } from "../../api/tracking";
import MarketingLayout from "../../components/marketing/MarketingLayout";

// ── Checkup Input (reused in 3 CTA positions) ──────────────────────

interface CheckupInputProps {
  id: string;
  dark?: boolean;
}

function CheckupInput({ id, dark = false }: CheckupInputProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ placeId: string; mainText: string; secondaryText: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPlaces = useCallback((input: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });
        const data = await res.json();
        if (data.success && data.suggestions) setSuggestions(data.suggestions.slice(0, 5));
      } catch { setSuggestions([]); }
    }, 300);
  }, []);

  const selectPlace = (place: { placeId: string; mainText: string }) => {
    setSuggestions([]);
    setQuery(place.mainText);
    setLoading(true);
    trackEvent("marketing.checkup_start", { source: id, place: place.mainText });
    // Navigate to checkup with placeId pre-selected
    navigate(`/checkup?placeId=${encodeURIComponent(place.placeId)}&name=${encodeURIComponent(place.mainText)}`);
  };

  const textColor = dark ? "text-white" : "text-[#212D40]";
  const placeholderColor = dark ? "placeholder:text-white/30" : "placeholder:text-[#212D40]/30";
  const borderColor = dark ? "border-white/20 focus-within:border-[#D56753]" : "border-[#212D40]/15 focus-within:border-[#D56753]";
  const bgColor = dark ? "bg-white/10" : "bg-white";
  const dropBg = dark ? "bg-[#2a3a4f]" : "bg-white";
  const dropBorder = dark ? "border-white/10" : "border-gray-200";

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className={`flex items-center gap-2 border-2 ${borderColor} rounded-xl ${bgColor} px-4 py-3.5 transition-colors`}>
        {loading ? (
          <Loader2 className="w-4 h-4 text-[#D56753] animate-spin shrink-0" />
        ) : (
          <Search className={`w-4 h-4 shrink-0 ${dark ? "text-white/30" : "text-[#212D40]/30"}`} />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); searchPlaces(e.target.value); }}
          placeholder="Enter your business name"
          className={`flex-1 bg-transparent text-sm ${textColor} ${placeholderColor} outline-none`}
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => { if (query.trim().length >= 3) navigate(`/checkup?q=${encodeURIComponent(query)}`); }}
          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[#D56753] text-white text-sm font-semibold px-4 py-2 hover:brightness-110 active:scale-[0.98] transition-all"
        >
          See What We Find <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className={`absolute top-full left-0 right-0 mt-1 ${dropBg} border ${dropBorder} rounded-xl shadow-lg overflow-hidden z-10`}>
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => selectPlace(s)}
              className={`w-full text-left px-4 py-3 hover:bg-[#D56753]/5 transition-colors border-b last:border-0 ${dark ? "border-white/5" : "border-gray-50"}`}
            >
              <p className={`text-sm font-medium ${textColor}`}>{s.mainText}</p>
              <p className={`text-xs flex items-center gap-1 mt-0.5 ${dark ? "text-white/40" : "text-[#212D40]/50"}`}>
                <MapPin className="w-3 h-3" />{s.secondaryText}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function HomePage() {
  const isAuthenticated = !!getPriorityItem("auth_token") || !!getPriorityItem("token");
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <MarketingLayout
      title="Alloro - Business Clarity"
      description="Enter your business name. 60 seconds later, Alloro tells you something specific and true about your business that you didn't know. Free."
    >
      {/* ═══ ABOVE THE FOLD — Stage 1: Pattern Interrupt ═══ */}
      <section className="bg-[#212D40] px-5 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-[26px] sm:text-[42px] font-extrabold text-white leading-tight tracking-tight">
            Your business is telling you something.
            {" "}<span className="text-[#D56753]">We know what it is.</span>
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-white/50 leading-relaxed">
            Every Monday morning, one finding you didn't know.<br className="hidden sm:block" />
            Named competitors. Real numbers. One clear action.
          </p>
          <p className="mt-2 text-sm text-white/30">
            See where you rank in 60 seconds. Free. No account needed.
          </p>

          <div className="mt-8">
            <CheckupInput id="hero" dark />
          </div>

          <p className="mt-4 text-xs text-white/25">
            Free. No credit card. No sales call. Cancel anytime.
            We find something specific or we tell you.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 1 — Stage 2: The Mirror Block ═══ */}
      <section className="bg-[#1a2533] px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto space-y-6 text-white/80 text-base leading-relaxed">
          <p>You know your best referring source by name.</p>
          <p>
            You know when they stopped sending business, because
            you went back and counted.
          </p>
          <p>
            You know the competitor who added 400 reviews
            last year while you added 30.
          </p>
          <p>
            You know what Sunday night feels like
            when Monday is coming and the numbers
            are in your head and not on paper.
          </p>
          <p>You've known all of this.</p>
          <p>
            The problem was never that you didn't know.
            The problem was that knowing it took your whole weekend.
          </p>
          <p className="text-white font-semibold text-lg">
            Alloro reads your business so you don't have to.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 2 — The Diagnosis Cards ═══ */}
      <section className="px-5 py-16 sm:py-20" style={{ backgroundColor: "rgba(213, 103, 83, 0.04)" }}>
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-5">
          <DiagnosisCard number={1}>
            The referring source who used to send 6 clients a month.
            Hasn't sent one in 8 weeks. You haven't noticed yet.
            Alloro has.
          </DiagnosisCard>
          <DiagnosisCard number={2}>
            The competitor two miles away added 22 reviews
            last month. You added 4. At this rate, their advantage
            grows by 18 reviews a quarter. Here's the one move
            that changes that.
          </DiagnosisCard>
          <DiagnosisCard number={3}>
            Your business ranks #4 for the exact search query
            your next customer just typed into Google.
            The business at #1 has one thing yours doesn't.
            Alloro built it for you this morning.
          </DiagnosisCard>
        </div>
        <p className="text-center text-sm text-[#212D40]/50 mt-8">
          This is not a demo. This is what Monday looks like.
        </p>
      </section>

      {/* ═══ SECTION 3 — The Three Things ═══ */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-8">
          <ThreeThing
            verb="BUILD"
            lines={[
              "Your professional website and referral pages, built for your business by AI agents in under an hour.",
              "Your site for customers. Your page for referring partners. Professional. Specific. Indexed. Ranking. You never touched them.",
            ]}
          />
          <ThreeThing
            verb="GROW"
            lines={[
              "Your online visibility runs on autopilot.",
              "When customers search for someone like you, you show up. When they ask Siri or ChatGPT, you're the answer. When a referral source looks you up before they send, they find you first. You never wrote a word.",
            ]}
          />
          <ThreeThing
            verb="WATCH"
            lines={[
              "Your business speaks all the time. We listen so you don't have to.",
              "Every Monday, one email. One thing that's specific, true, and actionable. The catch before it costs you. The move before your competitor makes it. You don't check. It tells you.",
            ]}
          />
        </div>
        <div className="max-w-lg mx-auto text-center mt-12 space-y-1">
          <p className="text-base font-semibold text-[#212D40]">
            This is not software you use.
          </p>
          <p className="text-base font-semibold text-[#212D40]">
            This is infrastructure that runs.
          </p>
          <p className="text-sm text-[#212D40]/50 mt-3">
            You run your business. Alloro does the rest.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 4 — Social Proof: Before / After ═══ */}
      <section className="px-5 py-16 sm:py-20" style={{ backgroundColor: "rgba(213, 103, 83, 0.04)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-0 rounded-2xl overflow-hidden shadow-lg">
            {/* Before */}
            <div className="bg-[#212D40] p-8 text-white/80 text-sm leading-relaxed">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">Before</p>
              <p className="italic">
                "I was spending three hours every Sunday
                checking my rankings, counting my reviews,
                cross-referencing my referral spreadsheet.
              </p>
              <p className="italic mt-4">
                I knew something was off with one of my top GPs.
                I just couldn't prove it.
                So I kept watching."
              </p>
            </div>
            {/* After */}
            <div className="bg-white p-8 text-[#212D40] text-sm leading-relaxed">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-4">After</p>
              <p className="italic">
                "Monday morning. Six words in the subject line:
                'Dr. Reyes sent 0 cases in March.'
              </p>
              <p className="italic mt-4">
                I called her that afternoon.
                She had a new endodontist in her building.
                I knew before I lost the relationship.
              </p>
              <p className="italic mt-4">
                Alloro found it. I didn't ask."
              </p>
              <p className="text-xs text-[#212D40]/40 mt-6">
                Endodontist, Virginia (name withheld)
              </p>
            </div>
          </div>
          <p className="text-center text-sm font-semibold text-[#212D40] mt-6">
            That's the product. Not a feature. The product.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 5 — Curiosity Gap Close (2nd CTA) ═══ */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <div className="space-y-4 text-base text-[#212D40]/80 leading-relaxed">
            <p>Your business has a number.</p>
            <p>
              A referral velocity score.
              A competitive gap with a dollar figure attached.
              A specific source whose behavior has changed
              in the last 60 days.
            </p>
            <p className="font-semibold text-[#212D40]">
              You don't know what any of those numbers are right now.
            </p>
            <p className="font-semibold text-[#212D40]">
              You will in 60 seconds.
            </p>
          </div>
          <div className="pt-4">
            <CheckupInput id="mid-page" />
          </div>
          <p className="text-xs text-[#212D40]/30">
            No account. No card. No call.
            We find something specific or we tell you why we couldn't.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 6 — The Process ═══ */}
      <section className="px-5 py-16 sm:py-20" style={{ backgroundColor: "rgba(213, 103, 83, 0.04)" }}>
        <div className="max-w-xl mx-auto">
          <p className="text-sm font-bold text-[#212D40]/40 uppercase tracking-wider mb-6">
            Here's what happens when you enter your business name:
          </p>
          <div className="space-y-5">
            {[
              "60 seconds: We analyze your competitive position, your visibility gaps, and your referral signals.",
              "Simultaneously: Your professional website and referral pages are built for your business by AI agents.",
              "You receive your Checkup result and two live URLs. Your customer site and your referral page. Already indexed. Already ranking.",
              "Monday morning: Your first intelligence brief. One thing. Specific. Actionable.",
              "Every Monday after: The same. The catch before it costs you. The move before your competitor makes it.",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <ArrowRight className="w-4 h-4 text-[#D56753] shrink-0 mt-1" />
                <p className="text-sm text-[#212D40]/80 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
          <p className="text-sm font-semibold text-[#212D40] mt-8">
            You did one thing: entered your business name. Alloro did the rest.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 7 — What You're Replacing ═══ */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-xl mx-auto space-y-6">
          <p className="text-sm font-bold text-[#212D40]/40 uppercase tracking-wider">
            Most of your peers are paying for one of these:
          </p>
          <div className="space-y-4">
            <ComparisonRow label="$6,000/month agency" detail={'Quarterly PDF report. "Give it more time."'} />
            <ComparisonRow label="$200/month website tool" detail={'Templates that look like everyone else\'s site.'} />
            <ComparisonRow label="$500/month analytics software" detail="Dashboard nobody opens." />
            <ComparisonRow label="Nothing" detail="Sunday spreadsheets and a lot of anxiety." />
          </div>
          <div className="border-t border-gray-200 pt-6 space-y-2">
            <p className="text-base font-semibold text-[#212D40]">
              Alloro is $2,000/month. No contracts. Cancel anytime.
            </p>
            <p className="text-sm text-[#212D40]/70 leading-relaxed">
              It runs while you sleep.
              It catches what you'd miss.
              It builds what no agency built.
              It never asks for a check-in call.
            </p>
          </div>
          <p className="text-sm font-semibold text-[#D56753]">
            What's Monday morning worth to you when someone else is watching?
          </p>
        </div>
      </section>

      {/* ═══ SECTION 8 — Heroes & Founders ═══ */}
      <section className="bg-[#D56753] px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto text-white space-y-6 leading-relaxed">
          <p className="text-base">
            10% of every Alloro subscription funds the Heroes & Founders Foundation.
          </p>
          <p className="text-base">
            Veterans, active duty spouses, first responders,
            and Gold Star family members who own a business
            get Alloro free. Not discounted. Free. Forever.
            Because the people who chose to serve first
            deserve the intelligence everyone else pays for.
          </p>
          <p className="text-base">
            First-year business owners pay $400/month.
            Everything included. No stripped version. No waitlist.
            We all rise together.
          </p>
          <p className="text-base font-semibold">
            When you subscribe, you are not just buying clarity for yourself.
            You are making it possible for someone who served to have it too.
          </p>
          <Link
            to="/foundation"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white underline underline-offset-4 hover:text-white/80 transition-colors"
          >
            Learn about Heroes & Founders <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* ═══ SECTION 9 — The Founder ═══ */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-xl mx-auto space-y-5 text-[#212D40]/80 text-base leading-relaxed">
          <p>
            Alloro was built by Corey Wise.
            USAF veteran. 100% service-connected disability.
            A decade inside specialty service businesses.
          </p>
          <p>
            For years before Alloro existed, he taught business
            webinars for veteran entrepreneurs. For free.
            Before there was anything to sell.
          </p>
          <p>
            He watched brilliant people lose businesses they'd
            spent their careers building. Not because they weren't
            talented. Because they couldn't see what was happening
            until it was too late.
          </p>
          <p className="font-semibold text-[#212D40]">
            Alloro is the tool he wished existed.
          </p>
          <p className="text-sm text-[#212D40]/50">
            Built on Claude, because Anthropic refused a
            Department of Defense surveillance contract
            to protect user data. You build with the companies
            whose values match yours.
          </p>
          <p className="text-sm text-[#212D40]/40 italic">
            Corey Wise, Bend, Oregon
          </p>
        </div>
      </section>

      {/* ═══ SECTION 10 — Final CTA ═══ */}
      <section className="bg-[#212D40] px-5 py-16 sm:py-20">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <p className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
            Your business has been speaking.
          </p>
          <p className="text-lg text-white/60">
            Enter your name. We'll tell you what it said.
          </p>
          <div className="pt-2">
            <CheckupInput id="final" dark />
          </div>
          <div className="space-y-1 pt-4">
            <p className="text-sm text-white/40">
              Free. Takes 60 seconds.
              We build your sites and send your first Monday email
              before you've decided if you want to pay for anything.
            </p>
            <p className="text-sm text-white/30 italic">
              See you Monday.
              <br />
              Corey
            </p>
          </div>
        </div>
      </section>

      {/* Page schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@id": "https://getalloro.com/#organization",
                "@type": "Organization",
                name: "Alloro",
                url: "https://getalloro.com",
                description: "Business Clarity platform for local service professionals",
                logo: "https://getalloro.com/logo.png",
                founder: {
                  "@type": "Person",
                  name: "Corey Wise",
                  jobTitle: "Founder",
                },
                sameAs: ["https://www.linkedin.com/company/getalloro"],
              },
              {
                "@type": "WebSite",
                "@id": "https://getalloro.com/#website",
                url: "https://getalloro.com",
                name: "Alloro - Business Clarity",
                publisher: { "@id": "https://getalloro.com/#organization" },
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: "https://getalloro.com/checkup?q={search_term_string}",
                  },
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@type": "SoftwareApplication",
                name: "Alloro",
                applicationCategory: "BusinessApplication",
                operatingSystem: "Web",
                offers: {
                  "@type": "Offer",
                  price: "2000",
                  priceCurrency: "USD",
                  priceValidUntil: "2027-12-31",
                },
                description: "Business Clarity platform. 47 AI agents monitor your competitive position, build your web presence, and deliver one actionable finding every Monday.",
                featureList: "Competitive intelligence, AI-built websites, Review monitoring, Referral tracking, SEO and AEO optimization",
              },
              {
                "@type": "FAQPage",
                mainEntity: [
                  {
                    "@type": "Question",
                    name: "What is a Business Clarity Score?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "A Business Clarity Score is a composite rating (0-100) of your local visibility, online presence, and review health compared to every competitor in your market. It is calculated from public Google data in 60 seconds.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How much does Alloro cost?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Alloro is $2,000/month with no contracts. Cancel anytime. Veterans, active duty spouses, first responders, and Gold Star family members get Alloro free forever through the Heroes and Founders Foundation. First-year business owners pay $400/month.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What does Alloro do for my business?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Alloro runs 47 AI agents that monitor your competitive position, build and optimize your website, track your reviews and referral sources, and deliver one specific, actionable finding every Monday morning. You run your business. Alloro does the rest.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "Do I need to do anything after signing up?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "No. After entering your business name, Alloro automatically builds your website, indexes it for search engines, monitors your competitors, and sends you a weekly intelligence brief. The system runs without your involvement.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What types of businesses does Alloro work for?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Alloro serves all local service businesses: dental, medical, legal, veterinary, chiropractic, optometry, financial advisory, real estate, and more. The platform automatically adapts its language and intelligence to your specific industry.",
                    },
                  },
                ],
              },
            ],
          }),
        }}
      />
    </MarketingLayout>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function DiagnosisCard({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="bg-[#212D40] rounded-2xl p-6">
      <span className="text-3xl font-black text-[#D56753]">{number}</span>
      <p className="mt-3 text-sm text-white/70 leading-relaxed">{children}</p>
    </div>
  );
}

function ThreeThing({ verb, lines }: { verb: string; lines: string[] }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#D56753] mb-3">{verb}</p>
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-[#212D40]/70 leading-relaxed mt-2 first:mt-0">{line}</p>
      ))}
    </div>
  );
}

function ComparisonRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-1.5 h-1.5 rounded-full bg-[#212D40]/20 shrink-0 mt-2" />
      <div>
        <p className="text-sm font-semibold text-[#212D40]">{label}</p>
        <p className="text-sm text-[#212D40]/50">{detail}</p>
      </div>
    </div>
  );
}
