import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import {
  confirmReferralMapping,
  type MappingPreviewData,
  type ReferralColumnMapping,
  type ReferralMappingTarget,
} from "../../api/pms";

interface MappingConfirmStepProps {
  preview: MappingPreviewData;
  onConfirmed: (result: { plainEnglishSummary?: string | null; recordsProcessed: number }) => void;
  onCancel: () => void;
  /** Card E (May 4 re-scope): used in the modal title + helper. Falls back to "your practice" when absent. */
  practiceDisplayName?: string;
  /** Card E (May 4 re-scope): when present, renders the re-confirmation helper instead of first-time helper. */
  previousColumnCount?: number;
}

// Card E (May 4 2026, re-scoped) — labels + descriptions sourced from the
// approved string set in src/services/referrals/columnMappingStrings.ts.
const ROLES: { key: ReferralMappingTarget; label: string; description: string; required: boolean }[] = [
  { key: "source", label: "Referral source", description: "Who sent the patient (a person, practice, or campaign).", required: true },
  { key: "date", label: "Date", description: "When the visit or referral happened.", required: false },
  { key: "amount", label: "Amount", description: "Production, revenue, or fee per row.", required: false },
  { key: "count", label: "Referral count", description: "Number of referrals if the row aggregates.", required: false },
  { key: "patient", label: "Patient", description: "Patient or client name or ID, used for deduplication.", required: false },
  { key: "procedure", label: "Procedure", description: "Procedure or service code.", required: false },
  { key: "provider", label: "Provider", description: "Treating doctor or provider.", required: false },
];

const NONE_VALUE = "__none__";

export const MappingConfirmStep: React.FC<MappingConfirmStepProps> = ({
  preview,
  onConfirmed,
  onCancel,
  practiceDisplayName,
  previousColumnCount,
}) => {
  const practiceLabel = practiceDisplayName?.trim() || "your practice";
  const headerCount = preview.headers.length;
  const helperText =
    typeof previousColumnCount === "number" && previousColumnCount !== headerCount
      ? `Your last upload for ${practiceLabel} had ${previousColumnCount} columns. This upload has ${headerCount} columns. Confirm the new column mapping below before Alloro ingests this data.`
      : `Alloro detected ${headerCount} columns in your upload. Suggested mapping shown below. Adjust any field that doesn't match, then confirm. This mapping is saved for future uploads from ${practiceLabel}.`;
  const [mapping, setMapping] = useState<ReferralColumnMapping>(preview.suggestion.mapping);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headerOptions = useMemo(() => preview.headers, [preview.headers]);
  const lowConfidence = useMemo(() => {
    const out: Partial<Record<ReferralMappingTarget, boolean>> = {};
    for (const role of ROLES) {
      const c = preview.suggestion.confidence[role.key];
      if (typeof c === "number" && c < 0.7) out[role.key] = true;
    }
    return out;
  }, [preview.suggestion.confidence]);

  const sourceCol = mapping.source;
  const sampleSourceValues = useMemo(() => {
    if (!sourceCol) return [];
    return preview.sampleRows.slice(0, 5)
      .map((row) => String(row[sourceCol] ?? "").trim())
      .filter((v) => v.length > 0);
  }, [sourceCol, preview.sampleRows]);

  const handleSubmit = async () => {
    if (!mapping.source) {
      setError("Pick the column that names the referrer before confirming.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await confirmReferralMapping({ jobId: preview.jobId, mapping });
      if (!result.success || !result.data) {
        throw new Error(result.error || "Confirmation failed");
      }
      onConfirmed({
        plainEnglishSummary: result.data.plainEnglishSummary ?? null,
        recordsProcessed: result.data.recordsProcessed,
      });
    } catch (err) {
      console.error("MappingConfirmStep:", err);
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <button
        onClick={onCancel}
        disabled={submitting}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-semibold transition-colors disabled:opacity-50"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1A1D23]">
          Confirm referral column mapping for {practiceLabel}
        </h3>
        <p className="text-sm text-[#1A1D23]/70">{helperText}</p>
        {preview.suggestion.warnings.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">Heads up</p>
            <ul className="text-sm text-amber-900 space-y-1">
              {preview.suggestion.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200/60">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1A1D23]/60">
            Detected headers ({preview.headers.length})
          </p>
          <p className="text-sm text-[#1A1D23] mt-1 truncate">
            {preview.headers.join(", ")}
          </p>
        </div>
        <div className="divide-y divide-stone-200/60">
          {ROLES.map((role) => {
            const value = mapping[role.key] ?? null;
            const reason = preview.suggestion.rationale[role.key];
            const flagged = lowConfidence[role.key];
            return (
              <div key={role.key} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="sm:w-1/3">
                  <p className="text-sm font-semibold text-[#1A1D23]">
                    {role.label}{role.required && <span className="text-[#D56753]"> *</span>}
                  </p>
                  <p className="text-xs text-[#1A1D23]/60 mt-0.5">{role.description}</p>
                </div>
                <div className="sm:flex-1">
                  <select
                    value={value ?? NONE_VALUE}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMapping((m) => ({ ...m, [role.key]: v === NONE_VALUE ? null : v }));
                    }}
                    disabled={submitting}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm text-[#1A1D23] focus:outline-none focus:border-[#D56753] disabled:opacity-50"
                  >
                    <option value={NONE_VALUE}>(none)</option>
                    {headerOptions.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {reason && (
                    <p className="text-xs text-[#1A1D23]/60 mt-1.5">
                      {flagged && <AlertCircle className="inline w-3 h-3 text-amber-600 mr-1" />}
                      {reason}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {sampleSourceValues.length > 0 && (
        <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1A1D23]/60 mb-2">
            Sample referral source values
          </p>
          <div className="flex flex-wrap gap-2">
            {sampleSourceValues.map((v, i) => (
              <span key={i} className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-stone-200 text-xs text-[#1A1D23]">
                {v.length > 40 ? `${v.slice(0, 40)}...` : v}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting || !mapping.source}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D56753] text-white text-sm font-semibold hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirming...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Looks right, ingest
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="text-sm text-[#1A1D23]/60 hover:text-[#1A1D23] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
};
