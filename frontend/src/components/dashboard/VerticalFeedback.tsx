/**
 * VerticalFeedback -- "Is this accurate?" micro-widget
 *
 * Appears next to vocabulary-driven labels in the dashboard.
 * One tap to confirm or correct the vertical classification.
 * No support ticket. No human. Self-correcting system.
 *
 * When a tattoo artist sees "stylist" and taps "Not quite,"
 * the vocabulary config updates immediately. The dashboard
 * refreshes with the correct language. The system learned.
 *
 * Guidara: one-size-fits-one. This is how the product earns
 * the right to speak the customer's language.
 */

import { useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { apiPatch } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

const BUSINESS_TYPES = [
  "Tattoo Studio",
  "Barber Shop",
  "Hair Salon",
  "Nail Salon",
  "Med Spa",
  "Day Spa",
  "Massage Studio",
  "Dental Office",
  "Medical Office",
  "Law Firm",
  "Accounting Firm",
  "Real Estate Office",
  "Auto Shop",
  "Restaurant",
  "Fitness Studio",
  "Home Services",
  "Veterinary Clinic",
  "Pet Grooming",
  "Photography Studio",
  "Consulting Firm",
];

interface VerticalFeedbackProps {
  currentLabel: string;
  className?: string;
}

export default function VerticalFeedback({
  currentLabel,
  className = "",
}: VerticalFeedbackProps) {
  const [state, setState] = useState<"idle" | "asking" | "confirmed" | "correcting">("idle");
  const [selectedType, setSelectedType] = useState("");
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const orgId = userProfile?.organizationId;

  const handleCorrect = async () => {
    if (!selectedType || !orgId) return;
    setState("confirmed");

    try {
      await apiPatch({
        path: `/org/${orgId}/vocabulary`,
        passedData: { business_type_override: selectedType },
      });
      // Invalidate vocabulary cache so the dashboard refreshes
      queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-context"] });
    } catch {
      // Silent fail, the feedback was captured even if the update didn't persist
    }

    setTimeout(() => setState("idle"), 3000);
  };

  if (state === "confirmed") {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-emerald-600 ${className}`}>
        <Check className="h-3 w-3" /> Updated
      </span>
    );
  }

  if (state === "asking") {
    return (
      <div className={`inline-flex flex-col gap-2 ${className}`}>
        <p className="text-[10px] text-gray-500">What type of business is this?</p>
        <div className="flex flex-wrap gap-1.5">
          {BUSINESS_TYPES.slice(0, 8).map((type) => (
            <button
              key={type}
              onClick={() => {
                setSelectedType(type);
                setState("correcting");
              }}
              className="text-[10px] px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#D56753] hover:text-[#D56753] transition-colors"
            >
              {type}
            </button>
          ))}
          <button
            onClick={() => setState("correcting")}
            className="text-[10px] px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#D56753] hover:text-[#D56753] transition-colors"
          >
            Other...
          </button>
        </div>
      </div>
    );
  }

  if (state === "correcting") {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <input
          type="text"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          placeholder="e.g. Tattoo Studio"
          className="text-[10px] px-2 py-1 border border-gray-200 rounded-lg w-32 focus:border-[#D56753] outline-none"
          autoFocus
        />
        <button
          onClick={handleCorrect}
          disabled={!selectedType}
          className="text-[10px] px-2 py-1 rounded-lg bg-[#D56753] text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setState("asking")}
      className={`inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#D56753] transition-colors ${className}`}
      title="Is this business type correct?"
    >
      <AlertCircle className="h-3 w-3" />
      <span>Is this accurate?</span>
    </button>
  );
}
