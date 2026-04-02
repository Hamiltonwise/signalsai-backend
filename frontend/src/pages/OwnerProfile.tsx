/**
 * Owner Profile -- The Five Onboarding Questions (Lemonis Protocol)
 *
 * Appears once between account creation and first dashboard load.
 * Five questions, one at a time. Shapes every piece of intelligence that follows.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, SkipForward } from "lucide-react";
import { apiPost } from "../api/index";

const QUESTIONS = [
  {
    key: "vision_3yr",
    question: "What does success feel like to you in 3 years? Not metrics. Your actual life. What does your week look like?",
    placeholder: "E.g. I want Tuesdays free. I want to stop working weekends. I want to know my business runs without me.",
    type: "text" as const,
  },
  {
    key: "sunday_fear",
    question: "What's keeping you up on Sunday nights right now?",
    placeholder: "Be honest. Nobody else sees this.",
    type: "text" as const,
  },
  {
    key: "confidence_score",
    question: "On a scale of 1 to 10, how confident are you that this business exists in 5 years?",
    placeholder: "",
    type: "slider" as const,
    followup: {
      key: "confidence_threat",
      question: "What's the biggest reason it might not?",
      placeholder: "The one thing that worries you most.",
    },
  },
  {
    key: "people_challenge",
    question: "Is there one person in your business whose behavior you wish you could change?",
    placeholder: "Tell us more (optional).",
    type: "yesno" as const,
  },
  {
    key: "personal_goal",
    question: "If this business ran perfectly and you had 2 extra hours every day, what would you do with them?",
    placeholder: "This tells us what you actually value.",
    type: "text" as const,
  },
];

export default function OwnerProfile() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sliderValue, setSliderValue] = useState(5);
  const [yesNoValue, setYesNoValue] = useState<boolean | null>(null);

  const current = QUESTIONS[step];

  const setAnswer = (key: string, value: string | number | null) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      setYesNoValue(null);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await apiPost({ path: "/user/owner-profile", passedData: answers }).catch(() => {});
    navigate("/dashboard", { replace: true });
  };

  const handleSkip = async () => {
    // Mark as skipped so it shows once more on next login
    localStorage.setItem("owner_profile_skipped", "1");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-[#FAFAF8] flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        {step === 0 && (
          <div className="text-center mb-10">
            <h1 className="text-2xl font-semibold text-[#212D40] tracking-tight">
              Before we go further.
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Five questions. Takes 2 minutes. Shapes everything Alloro tells you from here.
            </p>
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-8">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-[#D56753]" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Question */}
        <p className="text-lg font-semibold text-[#212D40] leading-relaxed mb-6">
          {current.question}
        </p>

        {/* Input */}
        {current.type === "text" && (
          <textarea
            value={String(answers[current.key] || "")}
            onChange={(e) => setAnswer(current.key, e.target.value)}
            placeholder={current.placeholder}
            rows={4}
            className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm text-[#212D40] placeholder:text-gray-400 focus:border-[#D56753] focus:outline-none focus:ring-2 focus:ring-[#D56753]/10 resize-none transition-colors"
            autoFocus
          />
        )}

        {current.type === "slider" && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">1</span>
              <input
                type="range"
                min={1}
                max={10}
                value={sliderValue}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSliderValue(val);
                  setAnswer("confidence_score", val);
                }}
                className="flex-1 h-2 rounded-full appearance-none bg-gray-200 accent-[#D56753]"
              />
              <span className="text-sm text-gray-400">10</span>
            </div>
            <p className="text-center text-3xl font-semibold text-[#212D40]">{sliderValue}</p>

            {/* Followup question */}
            {current.followup && (
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-[#212D40] mb-3">
                  {current.followup.question}
                </p>
                <textarea
                  value={String(answers[current.followup.key] || "")}
                  onChange={(e) => setAnswer(current.followup.key, e.target.value)}
                  placeholder={current.followup.placeholder}
                  rows={2}
                  className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm text-[#212D40] placeholder:text-gray-400 focus:border-[#D56753] focus:outline-none focus:ring-2 focus:ring-[#D56753]/10 resize-none transition-colors"
                />
              </div>
            )}
          </div>
        )}

        {current.type === "yesno" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setYesNoValue(true); setAnswer("people_challenge", "yes"); }}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                  yesNoValue === true
                    ? "bg-[#D56753] text-white"
                    : "bg-white border-2 border-gray-200 text-[#212D40] hover:border-gray-300"
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => { setYesNoValue(false); setAnswer("people_challenge", "no"); }}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                  yesNoValue === false
                    ? "bg-[#212D40] text-white"
                    : "bg-white border-2 border-gray-200 text-[#212D40] hover:border-gray-300"
                }`}
              >
                No
              </button>
            </div>
            {yesNoValue === true && (
              <textarea
                value={String(answers.people_challenge_detail || "")}
                onChange={(e) => setAnswer("people_challenge_detail", e.target.value)}
                placeholder={current.placeholder}
                rows={2}
                className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm text-[#212D40] placeholder:text-gray-400 focus:border-[#D56753] focus:outline-none focus:ring-2 focus:ring-[#D56753]/10 resize-none transition-colors"
              />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={handleSkip}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            <SkipForward className="w-3 h-3" />
            Skip for now
          </button>
          <button
            onClick={handleNext}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {step === QUESTIONS.length - 1 ? "Done" : "Next"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Question count */}
        <p className="text-center text-xs text-gray-300 mt-6">
          Question {step + 1} of {QUESTIONS.length}
        </p>
      </div>
    </div>
  );
}
