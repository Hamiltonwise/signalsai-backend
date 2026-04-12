/**
 * "Make It Yours" -- The 5-Minute Guided Site Personalization
 *
 * This is NOT an editor. This is a conversation.
 *
 * The business owner just signed up. Their site was built automatically
 * from their Google data. It's already beautiful. But it doesn't feel
 * like THEIRS yet. This guided flow changes that in 5 screens.
 *
 * The research says: the best editor is one you use for 5 minutes
 * and never open again. Not because it failed. Because it worked
 * so well the first time that everything after is automatic.
 *
 * Design: iPhone Camera model. Layer 0 works perfectly.
 * The user's job is confirming, not creating.
 * "Check our work" not "design your site."
 *
 * After this flow, Alloro's agents take over. The site gets better
 * every week without the owner lifting a finger.
 */

import { useState } from "react";
import { Check, Upload, ChevronRight } from "lucide-react";

interface SiteMakeItYoursProps {
  practiceName: string;
  currentHours?: string[];
  currentServices?: string[];
  currentAbout?: string;
  sitePreviewUrl?: string;
  onComplete: () => void;
}

type Step = "welcome" | "photos" | "hours" | "about" | "vibe" | "done";

const VIBES = [
  {
    id: "warm",
    name: "Warm & Welcoming",
    description: "Soft colors, rounded corners, friendly feel",
    primaryColor: "#D66853",
    bgColor: "#FFF9F7",
  },
  {
    id: "professional",
    name: "Clean & Professional",
    description: "Navy tones, sharp lines, authoritative",
    primaryColor: "#212D40",
    bgColor: "#F7F8FA",
  },
  {
    id: "modern",
    name: "Modern & Bold",
    description: "High contrast, confident, stands out",
    primaryColor: "#1A1D23",
    bgColor: "#FFFFFF",
  },
];

export default function SiteMakeItYours({
  practiceName,
  currentHours,
  currentServices,
  currentAbout,
  sitePreviewUrl,
  onComplete,
}: SiteMakeItYoursProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [selectedVibe, setSelectedVibe] = useState("warm");
  const [aboutText, setAboutText] = useState(currentAbout || "");
  const [photoUploaded, setPhotoUploaded] = useState(false);

  const steps: Step[] = ["welcome", "photos", "hours", "about", "vibe", "done"];
  const currentIndex = steps.indexOf(step);
  const progress = Math.round((currentIndex / (steps.length - 1)) * 100);

  function next() {
    const nextIndex = currentIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      {/* Progress */}
      {step !== "welcome" && step !== "done" && (
        <div className="mb-8">
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D56753] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2 text-right">
            {currentIndex} of {steps.length - 2}
          </p>
        </div>
      )}

      {/* Step: Welcome */}
      {step === "welcome" && (
        <div className="text-center space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-[#1A1D23] font-heading">
              Your site is ready.
            </h1>
            <p className="text-sm text-gray-500 mt-3 leading-relaxed max-w-sm mx-auto">
              Alloro built this from your Google reviews, your market data,
              and what your customers say about you.
              Take a look, then make it yours in about 5 minutes.
            </p>
          </div>

          {sitePreviewUrl && (
            <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <iframe
                src={sitePreviewUrl}
                className="w-full h-64 pointer-events-none"
                title="Your site preview"
              />
            </div>
          )}

          <button onClick={next} className="btn-primary btn-press inline-flex items-center gap-2">
            Make it mine
            <ChevronRight className="w-4 h-4" />
          </button>

          <button onClick={onComplete} className="block mx-auto text-xs text-gray-400 hover:text-gray-500">
            Looks great already, skip for now
          </button>
        </div>
      )}

      {/* Step: Photos */}
      {step === "photos" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-[#1A1D23] font-heading">
              Add your team photo
            </h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Real photos of real people make the biggest difference.
              This replaces the placeholder on your homepage.
            </p>
          </div>

          <div
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              photoUploaded
                ? "border-emerald-300 bg-emerald-50"
                : "border-gray-200 hover:border-[#D56753]/30 hover:bg-[#FFF9F7]"
            }`}
            onClick={() => setPhotoUploaded(true)}
          >
            {photoUploaded ? (
              <div className="space-y-2">
                <Check className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-sm font-medium text-emerald-700">Photo added</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="w-8 h-8 text-gray-300 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-[#1A1D23]">
                    Drop a photo here or tap to upload
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Tip: a team photo in matching scrubs, natural light, everyone smiling.
                    iPhone quality is perfect.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={next} className="text-sm text-gray-400 hover:text-gray-500">
              Skip for now
            </button>
            <button onClick={next} className="btn-primary btn-press inline-flex items-center gap-2">
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: Hours & Services */}
      {step === "hours" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-[#1A1D23] font-heading">
              Are these correct?
            </h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Pulled from your Google Business Profile. Fix anything that's wrong.
            </p>
          </div>

          {currentHours && currentHours.length > 0 && (
            <div className="card-supporting">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-[0.05em] mb-3">Hours</p>
              <div className="space-y-1.5">
                {currentHours.map((h, i) => (
                  <p key={i} className="text-sm text-[#1A1D23]">{h}</p>
                ))}
              </div>
            </div>
          )}

          {currentServices && currentServices.length > 0 && (
            <div className="card-supporting">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-[0.05em] mb-3">Services</p>
              <div className="flex flex-wrap gap-2">
                {currentServices.map((s, i) => (
                  <span key={i} className="text-xs bg-gray-50 text-[#1A1D23] px-3 py-1.5 rounded-lg border border-gray-100">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(!currentHours || currentHours.length === 0) && (!currentServices || currentServices.length === 0) && (
            <div className="card-preparing text-center py-8">
              <p className="text-sm text-gray-500">
                Alloro is pulling your hours and services from Google.
                You can add them manually later from your dashboard.
              </p>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={next} className="text-sm text-gray-400 hover:text-gray-500">
              These are correct
            </button>
            <button onClick={next} className="btn-primary btn-press inline-flex items-center gap-2">
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: About / Bio */}
      {step === "about" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-[#1A1D23] font-heading">
              Does this sound like you?
            </h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Alloro wrote this from your reviews and market data.
              Edit it, or leave it as is.
            </p>
          </div>

          <textarea
            value={aboutText}
            onChange={(e) => setAboutText(e.target.value)}
            rows={5}
            className="w-full text-sm text-[#1A1D23] bg-white border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#D56753]/20 focus:border-[#D56753]/40 leading-relaxed"
            placeholder={`Tell people about ${practiceName} in your own words...`}
          />

          <p className="text-xs text-gray-400">
            This appears on your homepage. Write like you'd talk to a neighbor, not a brochure.
          </p>

          <div className="flex justify-end">
            <button onClick={next} className="btn-primary btn-press inline-flex items-center gap-2">
              {aboutText ? "Looks good" : "Skip for now"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: Vibe / Style */}
      {step === "vibe" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-[#1A1D23] font-heading">
              Pick your vibe
            </h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              This sets the color and feel of your site. You can always change it later.
            </p>
          </div>

          <div className="space-y-3">
            {VIBES.map((vibe) => (
              <button
                key={vibe.id}
                onClick={() => setSelectedVibe(vibe.id)}
                className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                  selectedVibe === vibe.id
                    ? "border-[#D56753] bg-[#D56753]/[0.03]"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex gap-1.5 shrink-0">
                    <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: vibe.primaryColor }} />
                    <div className="w-8 h-8 rounded-lg border border-gray-100" style={{ backgroundColor: vibe.bgColor }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1A1D23]">{vibe.name}</p>
                    <p className="text-xs text-gray-400">{vibe.description}</p>
                  </div>
                  {selectedVibe === vibe.id && (
                    <Check className="w-5 h-5 text-[#D56753] ml-auto shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <button onClick={next} className="btn-primary btn-press inline-flex items-center gap-2">
              Finish
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="text-center space-y-6 py-8">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-[#1A1D23] font-heading">
              {practiceName} is live.
            </h2>
            <p className="text-sm text-gray-500 mt-3 leading-relaxed max-w-sm mx-auto">
              Your site is published and Alloro is watching it.
              New reviews get added automatically. Content stays fresh.
              You'll see updates in your Monday briefing.
            </p>
          </div>

          <div className="card-supporting text-left max-w-sm mx-auto">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-[0.05em] mb-3">
              What happens from here
            </p>
            <div className="space-y-2.5">
              {[
                "New reviews appear on your site automatically",
                "Alloro adjusts content based on what people search for",
                "Your Monday email includes site performance",
                "You can edit anything anytime from your dashboard",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-500">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <button onClick={onComplete} className="btn-primary btn-press inline-flex items-center gap-2">
            Go to my dashboard
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
