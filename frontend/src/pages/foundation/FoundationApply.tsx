/**
 * Foundation Application Form (WO-11)
 * Route: /foundation/apply
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";

export default function FoundationApply() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    practiceName: "",
    specialty: "",
    city: "",
    state: "",
    program: "heroes", // heroes or founders
    veteranStatus: "",
    story: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/foundation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setSubmitError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setSubmitError("Could not reach the server. Please try again.");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#212D40]">Application Received</h1>
          <p className="mt-3 text-gray-500">
            Thank you, {form.name}. We review every application personally.
            You'll hear from us within 5 business days.
          </p>
          <Link
            to="/foundation"
            className="inline-block mt-8 text-sm text-[#D56753] font-semibold hover:underline"
          >
            Back to Foundation
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <section className="px-6 py-16 max-w-xl mx-auto">
        <Link to="/foundation" className="text-xs text-gray-400 hover:text-[#D56753] mb-6 block">
          &larr; Back to Foundation
        </Link>
        <h1 className="text-2xl font-bold text-[#212D40] mb-2">Apply to the Foundation</h1>
        <p className="text-sm text-gray-500 mb-8">
          Tell us about yourself and your practice. Every application is reviewed personally.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Program selection */}
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Which program?
            </legend>
            <div className="flex gap-3">
              {[
                { value: "heroes", label: "Heroes Initiative (Veterans)" },
                { value: "founders", label: "Founders Initiative" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex-1 cursor-pointer rounded-xl border-2 px-4 py-3 text-center text-sm font-semibold transition-all ${
                    form.program === opt.value
                      ? "border-[#D56753] bg-[#D56753]/5 text-[#D56753]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="program"
                    value={opt.value}
                    checked={form.program === opt.value}
                    onChange={(e) => setForm({ ...form, program: e.target.value })}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Personal info */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Full Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          </div>
          <Input label="Phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />

          {/* Practice info */}
          <Input label="Practice Name" value={form.practiceName} onChange={(v) => setForm({ ...form, practiceName: v })} required />
          <div className="grid sm:grid-cols-3 gap-4">
            <Input label="Specialty" value={form.specialty} onChange={(v) => setForm({ ...form, specialty: v })} required />
            <Input label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} required />
            <Input label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} required />
          </div>

          {/* Veteran status (if Heroes) */}
          {form.program === "heroes" && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 block">
                Veteran Status
              </label>
              <select
                value={form.veteranStatus}
                onChange={(e) => setForm({ ...form, veteranStatus: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#D56753] focus:outline-none focus:ring-1 focus:ring-[#D56753]"
                required
              >
                <option value="">Select...</option>
                <option value="active">Active Duty</option>
                <option value="veteran">Veteran</option>
                <option value="reserve">Reserve / National Guard</option>
                <option value="spouse">Military Spouse</option>
              </select>
            </div>
          )}

          {/* Story */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 block">
              Your Story (Optional)
            </label>
            <textarea
              value={form.story}
              onChange={(e) => setForm({ ...form, story: e.target.value })}
              rows={4}
              placeholder="Tell us about your journey from service to practice ownership..."
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#D56753] focus:outline-none focus:ring-1 focus:ring-[#D56753] resize-none"
            />
          </div>

          {submitError && (
            <p className="text-sm text-[#D56753] text-center">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#D56753] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Input({
  label,
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#D56753] focus:outline-none focus:ring-1 focus:ring-[#D56753]"
      />
    </div>
  );
}
