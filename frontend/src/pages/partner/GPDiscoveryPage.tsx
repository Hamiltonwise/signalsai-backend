/**
 * GP Discovery Page -- public referral intake for referring doctors.
 *
 * Route: /refer (PatientPath domain) or /dashboard/refer (preview)
 * AEO-optimized: "Refer a patient to [Practice] in [City]"
 *
 * Six sections:
 * 1. Direct scheduling line (GBP phone)
 * 2. Case acceptance criteria (vocabulary config)
 * 3. Turnaround time
 * 4. Patient communication protocol (praise_patterns)
 * 5. Emergency case protocol
 * 6. Referral form
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  Phone,
  CheckCircle2,
  Clock,
  Heart,
  AlertTriangle,
  Send,
  Loader2,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/index";

// --- Types -------------------------------------------------------------------

interface PracticeData {
  name: string;
  phone: string | null;
  city: string | null;
  specialty: string | null;
  case_types: string[];
  turnaround_days: number;
  praise_patterns: string[];
  practice_personality: string | null;
  referral_form_data: {
    org_id: number;
    urgency_options: string[];
  };
}

// --- Main Component ----------------------------------------------------------

export default function GPDiscoveryPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const slug = orgSlug || "preview";

  const { data: practice, isLoading } = useQuery({
    queryKey: ["gp-discovery", slug],
    queryFn: async () => {
      const res = await apiGet({ path: `/partner/discovery/${slug}` });
      return res?.success ? (res.practice as PracticeData) : null;
    },
    staleTime: 5 * 60_000,
  });

  const [form, setForm] = useState({
    referring_doctor_name: "",
    referring_practice_name: "",
    patient_first_name: "",
    case_type: "",
    urgency: "Routine",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !practice) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await apiPost({
        path: `/referral/${practice.referral_form_data.org_id}`,
        passedData: form,
      });
      if (res?.success) {
        setSubmitted(true);
      } else {
        setError(res?.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-[#FAFAF8] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-[#D56753]/10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#D56753]" />
        </div>
      </div>
    );
  }

  if (!practice) {
    return (
      <div className="min-h-dvh bg-[#FAFAF8] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-bold text-[#212D40]">Practice not found</p>
          <p className="text-sm text-gray-500 mt-1">This referral page may not be set up yet.</p>
        </div>
      </div>
    );
  }

  // AEO: set document title + inject FAQPage schema
  useEffect(() => {
    if (!practice) return;
    document.title = `Refer a patient to ${practice.name}${practice.city ? ` in ${practice.city}` : ""}`;

    // Inject FAQPage JSON-LD
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `Who should I refer root canal cases to${practice.city ? ` in ${practice.city}` : ""}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `${practice.name}${practice.city ? ` in ${practice.city}` : ""} accepts referrals for ${practice.case_types.join(", ")}. ${practice.phone ? `Call ${practice.phone} for direct scheduling.` : "Use the online referral form for submissions."}`,
          },
        },
      ],
    });
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [practice]);

  return (
    <div className="min-h-dvh bg-[#FAFAF8]">
        {/* Header */}
        <header className="bg-[#212D40] text-white py-6 px-5">
          <div className="mx-auto max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">
              Refer a Patient
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight">{practice.name}</h1>
            {practice.city && (
              <p className="text-sm text-white/60 mt-1">{practice.specialty || "Specialist"} in {practice.city}</p>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
          {/* 1. Direct Scheduling Line */}
          {practice.phone && (
            <div className="bg-[#D56753] rounded-2xl p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/70">Direct Scheduling</p>
                  <a href={`tel:${practice.phone}`} className="text-xl font-black hover:underline">
                    {practice.phone}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* 2. Case Acceptance Criteria */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-5 w-5 text-[#D56753]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">Cases We Accept</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {practice.case_types.map((ct) => (
                <div key={ct} className="flex items-center gap-2 text-sm text-[#212D40]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D56753] shrink-0" />
                  {ct}
                </div>
              ))}
            </div>
          </div>

          {/* 3. Turnaround Time */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-[#D56753]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">Turnaround</h2>
            </div>
            <p className="text-lg font-bold text-[#212D40]">
              We contact your patient within {practice.turnaround_days} business day{practice.turnaround_days !== 1 ? "s" : ""}.
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Emergency cases are triaged and contacted same day.
            </p>
          </div>

          {/* 4. Patient Communication Protocol */}
          {practice.praise_patterns.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Heart className="h-5 w-5 text-[#D56753]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">What Patients Say</h2>
              </div>
              <div className="space-y-3">
                {practice.praise_patterns.map((pattern, i) => (
                  <div key={i} className="bg-[#D56753]/[0.03] rounded-xl px-4 py-3">
                    <p className="text-sm text-[#212D40] italic leading-relaxed">"{pattern}"</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">From verified Google reviews</p>
            </div>
          )}

          {/* 5. Emergency Case Protocol */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-amber-700">Emergency Cases</h2>
            </div>
            <p className="text-sm text-amber-900 leading-relaxed">
              For urgent or emergency referrals, {practice.phone
                ? <>call <a href={`tel:${practice.phone}`} className="font-bold underline">{practice.phone}</a> directly</>
                : "submit the form below with urgency set to Emergency"
              }.
              Emergency referrals are triaged immediately and your patient will be contacted within 2 hours during business hours.
            </p>
          </div>

          {/* 6. Referral Form */}
          {submitted ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
              <p className="text-lg font-bold text-emerald-900">Referral received.</p>
              <p className="text-sm text-emerald-700 mt-2">
                We'll contact your patient within {practice.turnaround_days} business day{practice.turnaround_days !== 1 ? "s" : ""}.
                Thank you for the trust.
              </p>
              <button
                onClick={() => { setSubmitted(false); setForm({ referring_doctor_name: "", referring_practice_name: "", patient_first_name: "", case_type: "", urgency: "Routine", notes: "" }); }}
                className="mt-4 text-sm font-semibold text-emerald-700 hover:underline"
              >
                Submit another referral
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Send className="h-5 w-5 text-[#D56753]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#D56753]">Refer a Patient</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#212D40] mb-1">Your Name *</label>
                    <input
                      type="text"
                      required
                      value={form.referring_doctor_name}
                      onChange={(e) => setForm({ ...form, referring_doctor_name: e.target.value })}
                      placeholder="Dr. Smith"
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#212D40] mb-1">Your Practice *</label>
                    <input
                      type="text"
                      required
                      value={form.referring_practice_name}
                      onChange={(e) => setForm({ ...form, referring_practice_name: e.target.value })}
                      placeholder="Smith Family Dental"
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#212D40] mb-1">Patient First Name *</label>
                  <input
                    type="text"
                    required
                    value={form.patient_first_name}
                    onChange={(e) => setForm({ ...form, patient_first_name: e.target.value })}
                    placeholder="First name only"
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">First name only for PHI compliance</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#212D40] mb-1">Case Type *</label>
                    <select
                      required
                      value={form.case_type}
                      onChange={(e) => setForm({ ...form, case_type: e.target.value })}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#212D40] focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
                    >
                      <option value="">Select...</option>
                      {practice.case_types.map((ct) => (
                        <option key={ct} value={ct}>{ct}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#212D40] mb-1">Urgency *</label>
                    <select
                      required
                      value={form.urgency}
                      onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#212D40] focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10"
                    >
                      {practice.referral_form_data.urgency_options.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#212D40] mb-1">Notes (optional)</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Clinical notes, imaging details, patient preferences..."
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-[#212D40] placeholder:text-gray-400 focus:outline-none focus:border-[#D56753] focus:ring-2 focus:ring-[#D56753]/10 resize-none"
                  />
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-[#D56753] text-white text-sm font-semibold shadow-[0_4px_14px_rgba(213,103,83,0.35)] hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit Referral
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Footer */}
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-[11px] text-gray-300">
              Powered by Alloro
            </p>
          </div>
        </div>
    </div>
  );
}

// Notify T1 to add /dashboard/refer/:orgSlug to App.tsx
