import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Send } from "lucide-react";
import type {
  CreateSupportTicketPayload,
  SupportTicketType,
} from "../../api/support";
import { SupportTypeSelector } from "./SupportTypeSelector";

export type SupportTicketComposerProps = {
  locationId?: number | null;
  isSubmitting: boolean;
  errorMessage?: string | null;
  onCreateTicket: (payload: CreateSupportTicketPayload) => void;
};

const initialAnswers = {
  bug_report: { summary: "", stepsToReproduce: "", expectedBehavior: "" },
  feature_request: { idea: "", problem: "", impact: "" },
  website_edit: { pageUrl: "", requestedChange: "", approvalNotes: "" },
};

export function SupportTicketComposer({
  locationId,
  isSubmitting,
  errorMessage,
  onCreateTicket,
}: SupportTicketComposerProps) {
  const [type, setType] = useState<SupportTicketType>("bug_report");
  const [answers, setAnswers] = useState(initialAnswers);
  const [additionalContext, setAdditionalContext] = useState("");
  const [requestedCompletionDate, setRequestedCompletionDate] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreateTicket({
      type,
      guidedAnswers: answers[type],
      additionalContext,
      requestedCompletionDate:
        type === "website_edit" ? requestedCompletionDate : undefined,
      currentPageUrl: window.location.href,
      locationId,
    });
  };

  const handleAnswerChange = (field: string, value: string) => {
    setAnswers((current) => ({
      ...current,
      [type]: {
        ...current[type],
        [field]: value,
      },
    }));
  };

  return (
    <section className="rounded-2xl border border-[#EDE5C0] bg-[#FCFAED] p-5 shadow-premium sm:p-7">
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-alloro-orange">
          Support desk
        </p>
        <h1 className="font-display text-3xl font-medium leading-tight text-alloro-navy">
          Open a support ticket
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Send structured context to the Alloro team and follow every reply
          from this page.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <SupportTypeSelector value={type} onChange={setType} />
        {errorMessage && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            <AlertCircle className="h-4 w-4" />
            {errorMessage}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {renderFields(type, answers[type], handleAnswerChange)}
          {type === "website_edit" && (
            <label className="space-y-2 text-left">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Requested completion
              </span>
              <input
                type="date"
                value={requestedCompletionDate}
                onChange={(event) =>
                  setRequestedCompletionDate(event.target.value)
                }
                className="w-full rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-semibold text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
              />
            </label>
          )}
        </div>

        <label className="block space-y-2 text-left">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Additional context
          </span>
          <textarea
            value={additionalContext}
            onChange={(event) => setAdditionalContext(event.target.value)}
            rows={4}
            placeholder="Add screenshots, exact copy, links, business context, or anything the team should know."
            className="w-full resize-none rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-semibold text-alloro-navy placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-alloro-orange px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-alloro-orange/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Sending" : "Create ticket"}
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

function renderFields(
  type: SupportTicketType,
  values: Record<string, string>,
  onChange: (field: string, value: string) => void
) {
  const fields = getFieldConfig(type);
  return fields.map((field) => (
    <label key={field.name} className="space-y-2 text-left">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {field.label}
      </span>
      <textarea
        required={field.required}
        value={values[field.name] || ""}
        onChange={(event) => onChange(field.name, event.target.value)}
        rows={field.rows}
        placeholder={field.placeholder}
        className="w-full resize-none rounded-xl border border-[#EDE5C0] bg-white px-4 py-3 text-sm font-semibold text-alloro-navy placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
      />
    </label>
  ));
}

function getFieldConfig(type: SupportTicketType) {
  if (type === "feature_request") {
    return [
      { name: "idea", label: "Feature idea", required: true, rows: 3, placeholder: "What should Alloro add?" },
      { name: "problem", label: "Problem solved", required: true, rows: 3, placeholder: "What workflow or pain does this improve?" },
      { name: "impact", label: "Expected impact", required: false, rows: 3, placeholder: "How often would your team use it?" },
    ];
  }

  if (type === "website_edit") {
    return [
      { name: "pageUrl", label: "Page URL", required: true, rows: 2, placeholder: "https://yourpractice.com/page" },
      { name: "requestedChange", label: "Requested change", required: true, rows: 4, placeholder: "Describe the exact edit, copy, image, or layout change." },
      { name: "approvalNotes", label: "Approval notes", required: false, rows: 3, placeholder: "Add legal, clinical, or brand approval details." },
    ];
  }

  return [
    { name: "summary", label: "What is broken?", required: true, rows: 3, placeholder: "Briefly describe the issue." },
    { name: "stepsToReproduce", label: "Steps to reproduce", required: true, rows: 4, placeholder: "Tell us where you clicked and what happened." },
    { name: "expectedBehavior", label: "Expected behavior", required: false, rows: 3, placeholder: "What did you expect to happen?" },
  ];
}
