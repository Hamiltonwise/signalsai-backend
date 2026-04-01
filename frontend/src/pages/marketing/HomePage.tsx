/**
 * HomePage -- getalloro.com
 *
 * Not a SaaS funnel. The front door of a tribe.
 * Identity first, product second. "You took the leap. We see what it cost you."
 *
 * Sequence: Recognition -> Belonging -> Empowerment -> Product -> Foundation -> Action
 *
 * Vocabulary rule: "business" not "practice" on all pre-login surfaces.
 * Exception: inside quoted testimonial speech.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { ArrowRight, Search, MapPin, Loader2, Heart, Shield, Users, Star } from "lucide-react";
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
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    // IP-based location via backend. No browser permission popup.
    fetch("/api/checkup/geo", { signal: AbortSignal.timeout(3000) })
      .then(r => r.json())
      .then(data => { if (data.lat && data.lng) { locationRef.current = { lat: data.lat, lng: data.lng }; } })
      .catch(() => {});
  }, []);

  const searchPlaces = useCallback((input: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const loc = locationRef.current;
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, ...(loc ? { lat: loc.lat, lng: loc.lng } : {}) }),
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
    navigate(`/checkup?placeId=${encodeURIComponent(place.placeId)}&name=${encodeURIComponent(place.mainText)}`);
  };

  const textColor = dark ? "text-white" : "text-[#212D40]";
  const placeholderColor = dark ? "placeholder:text-white/30" : "placeholder:text-[#212D40]/30";
  const borderColor = dark ? "border-white/15 focus-within:border-[#D56753]" : "border-[#D56753]/15 focus-within:border-[#D56753]/40";
  const bgColor = dark ? "bg-white/8" : "bg-white";

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className={`flex items-center gap-2 border-2 ${borderColor} rounded-xl ${bgColor} px-4 py-3.5 transition-all duration-200 shadow-warm`}>
        {loading ? (
          <Loader2 className="w-4 h-4 text-[#D56753] animate-spin shrink-0" />
        ) : (
          <Search className={`w-4 h-4 shrink-0 ${dark ? "text-white/30" : "text-[#D56753]/30"}`} />
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
          className="shrink-0 flex items-center gap-1.5 rounded-lg text-white text-sm font-semibold px-4 py-2 btn-press transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #D66853 0%, #C45A46 100%)', boxShadow: '0 2px 8px rgba(214, 104, 83, 0.25)' }}
        >
          See What We Find <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className={`absolute top-full left-0 right-0 mt-1 ${dark ? "bg-[#2a3a4f] border-white/10" : "bg-white border-[#D56753]/10"} border rounded-xl shadow-warm-lg overflow-hidden z-10`}>
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => selectPlace(s)}
              className={`w-full text-left px-4 py-3 hover:bg-[#D56753]/5 transition-colors border-b last:border-0 ${dark ? "border-white/5" : "border-[#D56753]/5"}`}
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
      description="You took the leap. You trained for years. You bought the business for freedom. Alloro gives it back."
    >
      {/* ═══ HERO — The Recognition ═══
          Not "here's a tool." "We see you." The burned business owner at 11pm
          should feel understood in the first sentence. */}
      <section className="bg-[#212D40] px-5 py-20 sm:py-28 relative overflow-hidden">
        {/* Warm ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#D56753]/[0.06] rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-2xl mx-auto text-center relative">
          <p className="text-[11px] font-semibold tracking-[0.25em] text-[#D56753] uppercase mb-6">
            For the ones who took the leap
          </p>
          <h1 className="text-[28px] sm:text-[44px] font-extrabold text-white leading-[1.15] tracking-tight font-heading">
            You trained for years in a craft you love.
            <br className="hidden sm:block" />
            <span className="text-white/50">Then you bought a business.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-white/40 leading-relaxed max-w-lg mx-auto">
            And somewhere between the dream and the spreadsheet, the freedom
            you jumped for started slipping away.
          </p>
          <p className="mt-3 text-lg text-white/70 font-medium">
            Alloro gives it back.
          </p>

          <div className="mt-10">
            <CheckupInput id="hero" dark />
          </div>

          <p className="mt-4 text-xs text-white/20">
            Free. 60 seconds. See your score instantly.
          </p>
        </div>
      </section>

      {/* ═══ THE WOUND — Identity Mirror ═══
          This is The Broken Industry Map distilled to emotion.
          Not features. The feeling of Sunday night. */}
      <section className="px-5 py-16 sm:py-20" style={{ background: 'linear-gradient(180deg, #1a2533 0%, #212D40 100%)' }}>
        <div className="max-w-xl mx-auto space-y-6 text-white/70 text-base leading-relaxed">
          <p>You know the feeling.</p>
          <p>
            Sunday night. You're going through numbers in your head
            instead of being present. You know something is off with
            a key relationship but you can't prove it. You know a
            competitor is gaining ground but you can't see how fast.
          </p>
          <p>
            You didn't train for this part. You trained to be excellent
            at your craft. The business side was supposed to be the vehicle
            to freedom. Instead it became the thing that took it away.
          </p>
          <p className="text-white font-medium text-lg pt-2">
            You're not bad at business. Your business just speaks a language
            nobody taught you to read.
          </p>
          <p className="text-[#D56753] font-semibold">
            Alloro translates it. Every Monday morning. In plain English.
          </p>
        </div>
      </section>

      {/* ═══ THE PROOF — What Monday Looks Like ═══
          Not a feature list. A story. One specific moment. */}
      <section className="px-5 py-16 sm:py-20 bg-warm-gradient">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#D56753]/50 mb-8">
            This is what Monday morning looks like
          </p>
          <div className="grid sm:grid-cols-3 gap-5">
            <DiagnosisCard
              title="The catch"
              body="Your top referral source sent 6 cases a month. Hasn't sent one in 8 weeks. You haven't noticed yet. Alloro has."
            />
            <DiagnosisCard
              title="The gap"
              body="The competitor two miles away added 22 reviews last month. You added 4. Here's the one move that changes the math."
            />
            <DiagnosisCard
              title="The build"
              body="Your business ranks #4 for the exact search your next customer just typed. The business at #1 has one thing yours doesn't. Alloro built it for you this morning."
            />
          </div>
          <p className="text-center text-sm text-[#212D40]/40 mt-8 font-heading italic">
            This is not a demo. This is what your inbox looks like on Monday.
          </p>
        </div>
      </section>

      {/* ═══ THE BELONGING — You're Not Alone ═══
          This is the tribal moment. The shift from "tool" to "us." */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D56753]/50 mb-4">
            You are not alone in this
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#212D40] leading-tight font-heading">
            240 million people worldwide started a business for freedom.
          </h2>
          <p className="mt-4 text-base text-[#212D40]/60 leading-relaxed max-w-lg mx-auto">
            62% say the stress was worse than they imagined.
            56% feel completely alone in it.
            They're not failing. They just can't see what the business is telling them.
          </p>
          <p className="mt-6 text-base font-medium text-[#212D40]">
            Alloro was built for every one of them.
          </p>

          <div className="flex flex-wrap justify-center gap-2.5 mt-8">
            {[
              "Endodontist", "Orthodontist", "General Dentist", "Barber",
              "Attorney", "Veterinarian", "Garden Designer", "Med Spa",
              "Plumber", "CPA", "Real Estate Agent", "Fitness Studio",
              "Chiropractor", "Physical Therapist", "Restaurant", "Photographer",
            ].map((v) => (
              <span
                key={v}
                className="px-3.5 py-1.5 rounded-full border border-[#D56753]/10 text-sm text-[#212D40]/60 hover:border-[#D56753]/30 hover:text-[#D56753] transition-all duration-200 cursor-default"
              >
                {v}
              </span>
            ))}
          </div>
          <p className="mt-6 text-sm text-[#212D40]/40 font-heading italic">
            If you chose to own a business, you're one of us. And you're invited.
          </p>
        </div>
      </section>

      {/* ═══ THE EMPOWERMENT — What Changes ═══
          Before/after, but framed as "you get your life back" not "features" */}
      <section className="px-5 py-16 sm:py-20" style={{ backgroundColor: "rgba(214, 104, 83, 0.03)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-0 rounded-2xl overflow-hidden shadow-warm-lg">
            <div className="bg-[#212D40] p-8 text-white/80 text-sm leading-relaxed">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-5">Before</p>
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
            <div className="bg-gradient-to-br from-white to-[#FFF9F7] p-8 text-[#212D40] text-sm leading-relaxed">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D56753]/50 mb-5">After</p>
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
              <p className="text-xs text-[#D56753]/40 mt-6">
                Endodontist, Virginia
              </p>
            </div>
          </div>
          <p className="text-center text-sm font-medium text-[#212D40]/60 mt-6">
            That relationship was worth $27,000 a year.
            It was in the Monday email.
          </p>
        </div>
      </section>

      {/* ═══ SECOND CTA — The Curiosity Close ═══ */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-xl mx-auto text-center space-y-5">
          <p className="text-base text-[#212D40]/70 leading-relaxed">
            Your business has a number. A competitive gap with a dollar figure.
            A relationship that shifted in the last 60 days.
          </p>
          <p className="text-lg font-semibold text-[#212D40]">
            You'll know what they are in 60 seconds.
          </p>
          <div className="pt-2">
            <CheckupInput id="mid-page" />
          </div>
        </div>
      </section>

      {/* ═══ THE PRODUCT — What Alloro Actually Does ═══
          Three things, simply stated. Not features. Outcomes. */}
      <section className="px-5 py-16 sm:py-20" style={{ backgroundColor: "rgba(214, 104, 83, 0.03)" }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#D56753]/50 mb-10">
            Three things. All automatic. All for you.
          </p>
          <div className="grid sm:grid-cols-3 gap-8">
            <ThreeThing
              icon={<Shield className="w-5 h-5 text-[#D56753]" />}
              verb="WATCH"
              body="Every Monday, one email. One specific finding about your market with a name, a number, and one action. The catch before it costs you. The move before your competitor makes it."
            />
            <ThreeThing
              icon={<Star className="w-5 h-5 text-[#D56753]" />}
              verb="BUILD"
              body="Your professional website and referral pages, built by AI agents in under an hour. Indexed. Ranking. Updating. You never touched them."
            />
            <ThreeThing
              icon={<Users className="w-5 h-5 text-[#D56753]" />}
              verb="GROW"
              body="When customers search for someone like you, you show up. When they ask ChatGPT, you're the answer. Your visibility runs while you sleep."
            />
          </div>
          <p className="text-center text-sm text-[#212D40]/40 mt-10 font-heading italic">
            You run your business. Alloro runs the rest.
          </p>
        </div>
      </section>

      {/* ═══ PRODUCT PROOF — Real Screenshots ═══ */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#D56753]/50 mb-3">
            The actual product
          </p>
          <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-[#212D40] mb-10 font-heading">
            Not a mockup. Not a promise. This.
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="rounded-2xl overflow-hidden shadow-warm border border-[#D56753]/8 hover:shadow-warm-lg transition-all duration-300">
              <img src="/product-checkup.png" alt="Alloro Checkup: See where you rank in 60 seconds" className="w-full" loading="lazy" />
              <div className="p-4 bg-gradient-to-b from-white to-[#FFF9F7]">
                <p className="text-sm font-bold text-[#212D40]">Your Checkup</p>
                <p className="text-xs text-[#212D40]/50 mt-1">Type your name. See your score, your competitors, and your first action. 60 seconds.</p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-warm border border-[#D56753]/8 hover:shadow-warm-lg transition-all duration-300">
              <img src="/product-dashboard.png" alt="Alloro Dashboard: Your business clarity at a glance" className="w-full" loading="lazy" />
              <div className="p-4 bg-gradient-to-b from-white to-[#FFF9F7]">
                <p className="text-sm font-bold text-[#212D40]">Your Dashboard</p>
                <p className="text-xs text-[#212D40]/50 mt-1">One action. Market position. Website status. Everything that matters, nothing that doesn't.</p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-warm border border-[#D56753]/8 hover:shadow-warm-lg transition-all duration-300">
              <img src="/product-rankings.png" alt="Alloro Rankings: See every competitor in your market" className="w-full" loading="lazy" />
              <div className="p-4 bg-gradient-to-b from-white to-[#FFF9F7]">
                <p className="text-sm font-bold text-[#212D40]">Your Market</p>
                <p className="text-xs text-[#212D40]/50 mt-1">Every competitor. Every week. Named. The scoreboard that updates while you sleep.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ THE FOUNDATION — The Soul ═══
          Moved UP from section 8. This is NOT a footer add-on.
          This is the tribal identity. "By being here, you're part of something." */}
      <section className="px-5 py-16 sm:py-20 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #D66853 0%, #C45A46 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="max-w-xl mx-auto text-white space-y-6 leading-relaxed relative">
          <div className="flex items-center gap-3 mb-2">
            <Heart className="w-5 h-5 text-white/60" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
              Heroes & Founders Foundation
            </p>
          </div>

          <p className="text-xl font-heading font-bold leading-snug">
            When you join Alloro, you're not just getting clarity for yourself.
            You're giving it to someone who served.
          </p>

          <p className="text-base text-white/80">
            Veterans, active duty spouses, first responders,
            and Gold Star family members who own a business
            get Alloro free. Not discounted. Free. Permanent.
            Because the people who chose to serve their communities first
            deserve the same tools everyone else pays for.
          </p>

          <p className="text-base text-white/80">
            First-year business owners pay $400/month.
            Everything included. No stripped-down version.
            We all rise together.
          </p>

          <p className="text-base font-semibold text-white">
            This is not a marketing play. This is why the company exists.
          </p>

          <Link
            to="/foundation"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white underline underline-offset-4 decoration-white/40 hover:decoration-white transition-colors"
          >
            Meet the Foundation <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* ═══ WHAT YOU'RE REPLACING ═══ */}
      <section className="px-5 py-16 sm:py-20 bg-white">
        <div className="max-w-xl mx-auto space-y-6">
          <p className="text-[10px] font-bold text-[#212D40]/30 uppercase tracking-[0.2em]">
            What most business owners are paying for right now
          </p>
          <div className="space-y-4">
            <ComparisonRow label="$6,000/month agency" detail={'Quarterly PDF report. "Give it more time."'} />
            <ComparisonRow label="$200/month website tool" detail={'Templates that look like everyone else.'} />
            <ComparisonRow label="$500/month analytics software" detail="Dashboard nobody opens." />
            <ComparisonRow label="Nothing" detail="Sunday spreadsheets and a lot of anxiety." />
          </div>
          <div className="pt-6 space-y-3">
            <div className="h-px divider-warm" />
            <p className="text-base font-semibold text-[#212D40] pt-2">
              Alloro is $2,000/month. No contracts. Cancel anytime.
            </p>
            <p className="text-sm text-[#212D40]/60 leading-relaxed">
              It runs while you sleep. It catches what you'd miss.
              It builds what no agency built. It never asks for a check-in call.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ THE FOUNDER — Not about Corey. About why. ═══ */}
      <section className="px-5 py-16 sm:py-20" style={{ backgroundColor: "rgba(214, 104, 83, 0.03)" }}>
        <div className="max-w-xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start gap-6 mb-8">
            <img
              src="/corey-wise.jpg"
              alt="Corey Wise, Founder of Alloro"
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shrink-0 shadow-warm"
            />
            <div>
              <p className="text-lg font-bold text-[#212D40] font-heading">Corey Wise</p>
              <p className="text-sm text-[#212D40]/40 mt-0.5">Founder. USAF Veteran. Bend, Oregon.</p>
            </div>
          </div>
          <div className="space-y-5 text-[#212D40]/70 text-base leading-relaxed">
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
            <p className="font-medium text-[#212D40]">
              Alloro is the tool he wished existed for them.
            </p>
            <p className="text-sm text-[#212D40]/30 font-heading italic">
              Built on Claude by Anthropic, because you build with the
              companies whose values match yours.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA — The Invitation ═══ */}
      <section className="bg-[#212D40] px-5 py-20 sm:py-24 relative overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#D56753]/[0.04] rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-xl mx-auto text-center space-y-6 relative">
          <p className="text-xl sm:text-2xl font-bold text-white leading-relaxed font-heading">
            Your business has been speaking.
          </p>
          <p className="text-lg text-white/50">
            Type your name. We'll tell you what it said.
          </p>
          <div className="pt-2">
            <CheckupInput id="final" dark />
          </div>
          <div className="space-y-2 pt-4">
            <p className="text-sm text-white/30">
              Free. 60 seconds. We build your sites and send your first
              Monday email before you've decided if you want to pay for anything.
            </p>
            <p className="text-sm text-white/20 font-heading italic pt-2">
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
                description: "Business Clarity platform. Gives every business owner the life they set out to build.",
                logo: "https://getalloro.com/logo.png",
                founder: { "@type": "Person", name: "Corey Wise", jobTitle: "Founder" },
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
                  target: { "@type": "EntryPoint", urlTemplate: "https://getalloro.com/checkup?q={search_term_string}" },
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@type": "SoftwareApplication",
                name: "Alloro",
                applicationCategory: "BusinessApplication",
                operatingSystem: "Web",
                offers: { "@type": "Offer", price: "2000", priceCurrency: "USD", priceValidUntil: "2027-12-31" },
                description: "Business Clarity platform. AI agents monitor your competitive position, build your web presence, and deliver one actionable finding every Monday.",
                featureList: "Competitive intelligence, AI-built websites, Review monitoring, Referral tracking, SEO and AEO optimization",
              },
              {
                "@type": "FAQPage",
                mainEntity: [
                  { "@type": "Question", name: "What is a Business Clarity Score?", acceptedAnswer: { "@type": "Answer", text: "A composite rating (0-100) of your local visibility, online presence, and review health compared to every competitor in your market. Calculated from public Google data in 60 seconds." } },
                  { "@type": "Question", name: "How much does Alloro cost?", acceptedAnswer: { "@type": "Answer", text: "Alloro is $2,000/month with no contracts. Cancel anytime. Veterans, active duty spouses, first responders, and Gold Star family members get Alloro free forever through the Heroes and Founders Foundation. First-year business owners pay $400/month." } },
                  { "@type": "Question", name: "What does Alloro do?", acceptedAnswer: { "@type": "Answer", text: "Alloro translates your business. AI agents monitor your competitive position, build your website, track reviews and referral sources, and deliver one specific finding every Monday morning. You run your business. Alloro runs the rest." } },
                  { "@type": "Question", name: "Do I need to do anything after signing up?", acceptedAnswer: { "@type": "Answer", text: "No. Alloro automatically builds your website, monitors competitors, and sends weekly intelligence. The system runs without your involvement." } },
                  { "@type": "Question", name: "What types of businesses does Alloro serve?", acceptedAnswer: { "@type": "Answer", text: "Every local service business: dental, medical, legal, veterinary, chiropractic, optometry, financial advisory, landscaping, personal care, and more. The platform adapts its language and intelligence to your specific industry." } },
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

function DiagnosisCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[#212D40] rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/5">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D56753]/70 mb-3">{title}</p>
      <p className="text-sm text-white/60 leading-relaxed">{body}</p>
    </div>
  );
}

function ThreeThing({ icon, verb, body }: { icon: React.ReactNode; verb: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-lg bg-[#D56753]/8 flex items-center justify-center">
          {icon}
        </div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#D56753]">{verb}</p>
      </div>
      <p className="text-sm text-[#212D40]/60 leading-relaxed">{body}</p>
    </div>
  );
}

function ComparisonRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-1.5 h-1.5 rounded-full bg-[#D56753]/20 shrink-0 mt-2" />
      <div>
        <p className="text-sm font-semibold text-[#212D40]">{label}</p>
        <p className="text-sm text-[#212D40]/40">{detail}</p>
      </div>
    </div>
  );
}
