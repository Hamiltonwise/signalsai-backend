/**
 * Referral Program Landing -- /referral-program
 *
 * A doctor lands here when a colleague shares their referral link.
 * Not a marketing page. A confirmation: your colleague found something.
 * Dynamic via ?ref=[code] or falls back to generic SLC demo data.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Gift, Users } from "lucide-react";
import { validateReferralCode } from "../api/checkup";
import MarketingLayout from "../components/marketing/MarketingLayout";

// ─── Fallback (SLC demo data) ───────────────────────────────────────

const FALLBACK = {
  specialty: "endodontics",
  city: "Salt Lake City",
  reviewGap: 27,
  keyword: "endodontist near me",
};

export default function ReferralProgram() {
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || "";

  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [validRef, setValidRef] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!refCode || refCode.length < 6) {
      setLoaded(true);
      return;
    }
    validateReferralCode(refCode).then((res) => {
      if (res.valid && res.referrerName) {
        setReferrerName(res.referrerName);
        setValidRef(true);
      }
      setLoaded(true);
    });
  }, [refCode]);

  const checkupLink = refCode
    ? `/checkup?ref=${encodeURIComponent(refCode)}`
    : "/checkup";

  if (!loaded) return null;

  return (
    <MarketingLayout title="Referral Program" description="A colleague thought you'd want to see this. Run your free Checkup.">
      <div className="max-w-lg mx-auto px-5 py-12 sm:py-16 space-y-10">
        {/* Hero */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#D56753]/10 mb-5">
            <Users className="w-6 h-6 text-[#D56753]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#1A1D23] tracking-tight leading-tight">
            A colleague thought you'd want to see this.
          </h1>
          <p className="mt-4 text-base text-slate-500 leading-relaxed max-w-md mx-auto">
            They ran their business through Alloro and found something.
            Here's what they found -- and what it might mean for yours.
          </p>
        </div>

        {/* Section 1: What your colleague found */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D56753] mb-3">
            What {validRef && referrerName ? referrerName : "your colleague"} found
          </p>
          {validRef && referrerName ? (
            <p className="text-sm text-[#1A1D23]/80 leading-relaxed">
              A business referred by{" "}
              <strong>{referrerName}</strong> ran their Business Clarity
              Checkup and discovered where they rank against every
              competitor in their market -- with named competitors on a
              live map and the one move that changes their week. They saw
              their result in 60 seconds.
            </p>
          ) : (
            <p className="text-sm text-[#1A1D23]/80 leading-relaxed">
              A {FALLBACK.specialty} business in {FALLBACK.city} found
              that their top competitor has {FALLBACK.reviewGap} more
              reviews and ranks above them for "{FALLBACK.keyword}." They
              saw their result in 60 seconds.
            </p>
          )}
        </div>

        {/* Section 2: Run yours */}
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[#1A1D23]">
            Every business has a different result.
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Yours takes 60 seconds.
          </p>
          <a
            href={checkupLink}
            className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#D56753] text-white text-base font-semibold px-8 py-4 shadow-[0_4px_20px_rgba(213,103,83,0.4)] hover:shadow-[0_6px_28px_rgba(213,103,83,0.5)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            See my market
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Section 3: The offer */}
        <div className="rounded-2xl bg-[#212D40] p-6 text-center">
          <Gift className="w-6 h-6 text-[#D56753] mx-auto mb-3" />
          <p className="text-base font-bold text-white">
            You both split month one. $1,000 each instead of $2,000.
          </p>
          <p className="mt-2 text-xs text-white/40">
            Applied automatically. No code needed.
          </p>
        </div>

      </div>
    </MarketingLayout>
  );
}

// T1 adds /referral-program route to App.tsx
