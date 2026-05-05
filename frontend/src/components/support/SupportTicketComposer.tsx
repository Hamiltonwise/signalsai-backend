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

type FieldConfig = {
  name: string;
  label: string;
  required: boolean;
  kind: "input" | "textarea";
  rows?: number;
  placeholder: string;
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Ticket type
        </p>
        <SupportTypeSelector value={type} onChange={setType} />
      </div>

      {errorMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {renderFields(type, answers[type], handleAnswerChange)}
        {type === "website_edit" && (
          <label className="space-y-1.5 text-left">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Requested completion (optional)
            </span>
            <input
              type="date"
              value={requestedCompletionDate}
              onChange={(event) =>
                setRequestedCompletionDate(event.target.value)
              }
              style={{ colorScheme: "light" }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
            />
          </label>
        )}
      </div>

      <label className="block space-y-1.5 text-left">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Additional context (optional)
        </span>
        <textarea
          value={additionalContext}
          onChange={(event) => setAdditionalContext(event.target.value)}
          rows={4}
          placeholder="Add screenshots, exact copy, links, business context, or anything the team should know."
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
        />
      </label>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_24px_rgba(214,104,83,0.22)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Sending" : "Create ticket"}
          <Send className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function renderFields(
  type: SupportTicketType,
  values: Record<string, string>,
  onChange: (field: string, value: string) => void,
) {
  const fields = getFieldConfig(type);
  return fields.map((field) => (
    <label
      key={field.name}
      className={`space-y-1.5 text-left ${
        field.kind === "textarea" ? "sm:col-span-2" : ""
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {formatFieldLabel(field)}
      </span>
      {field.kind === "input" ? (
        <input
          required={field.required}
          value={values[field.name] || ""}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
        />
      ) : (
        <textarea
          required={field.required}
          value={values[field.name] || ""}
          onChange={(event) => onChange(field.name, event.target.value)}
          rows={field.rows}
          placeholder={field.placeholder}
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
        />
      )}
    </label>
  ));
}

function formatFieldLabel(field: FieldConfig): string {
  return field.required ? field.label : `${field.label} (optional)`;
}

function getFieldConfig(type: SupportTicketType): FieldConfig[] {
  if (type === "feature_request") {
    return [
      {
        name: "idea",
        label: "Feature idea",
        required: true,
        kind: "input",
        placeholder: "What should Alloro add?",
      },
      {
        name: "impact",
        label: "Expected impact",
        required: false,
        kind: "input",
        placeholder: "How often would your team use it?",
      },
      {
        name: "problem",
        label: "Problem solved",
        required: true,
        kind: "textarea",
        rows: 3,
        placeholder: "What workflow or pain does this improve?",
      },
    ];
  }

  if (type === "website_edit") {
    return [
      {
        name: "pageUrl",
        label: "Page URL",
        required: true,
        kind: "input",
        placeholder: "https://yourpractice.com/page",
      },
      {
        name: "requestedChange",
        label: "Requested change",
        required: true,
        kind: "textarea",
        rows: 4,
        placeholder: "Describe the exact edit, copy, image, or layout change.",
      },
      {
        name: "approvalNotes",
        label: "Approval notes",
        required: false,
        kind: "textarea",
        rows: 3,
        placeholder: "Add legal, clinical, or brand approval details.",
      },
    ];
  }

  return [
    {
      name: "summary",
      label: "What is broken?",
      required: true,
      kind: "input",
      placeholder: "Briefly describe the issue.",
    },
    {
      name: "stepsToReproduce",
      label: "Steps to reproduce",
      required: true,
      kind: "textarea",
      rows: 4,
      placeholder: "Tell us where you clicked and what happened.",
    },
    {
      name: "expectedBehavior",
      label: "Expected behavior",
      required: false,
      kind: "textarea",
      rows: 3,
      placeholder: "What did you expect to happen?",
    },
  ];
}
