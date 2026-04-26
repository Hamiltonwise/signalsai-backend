import { motion } from "framer-motion";
import { Inbox, ChevronRight, FileText } from "lucide-react";
import type {
  DetectedForm,
  IntegrationFormMapping,
} from "../../../api/integrations";

interface Props {
  detectedForms: DetectedForm[];
  mappings: IntegrationFormMapping[];
  selectedFormName: string | null;
  loading?: boolean;
  onSelect: (formName: string) => void;
}

type MappingStatusBadge = "mapped" | "broken" | "unmapped";

function getMappingStatus(
  formName: string,
  mappings: IntegrationFormMapping[],
): MappingStatusBadge {
  const mapping = mappings.find((m) => m.website_form_name === formName);
  if (!mapping) return "unmapped";
  return mapping.status === "broken" ? "broken" : "mapped";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

const STATUS_BADGE: Record<MappingStatusBadge, { label: string; className: string }> = {
  mapped: { label: "Mapped", className: "bg-green-100 text-green-700" },
  broken: { label: "Broken", className: "bg-red-100 text-red-700" },
  unmapped: { label: "Unmapped", className: "bg-gray-100 text-gray-500" },
};

export default function DetectedFormsPanel({
  detectedForms,
  mappings,
  selectedFormName,
  loading,
  onSelect,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.05 }}
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-900">Detected Forms</h4>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
            {detectedForms.length}
          </span>
        </div>
        <p className="text-[11px] text-gray-400 hidden sm:block">
          Pulled from recent submissions
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          Loading detected forms…
        </div>
      ) : detectedForms.length === 0 ? (
        <div className="p-8 text-center">
          <Inbox className="mx-auto mb-3 text-gray-300" size={28} />
          <p className="text-gray-400 text-sm">No form submissions yet</p>
          <p className="text-gray-300 text-xs mt-1">
            Forms appear here once visitors start submitting them.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {detectedForms.map((form) => {
            const status = getMappingStatus(form.form_name, mappings);
            const badge = STATUS_BADGE[status];
            const isActive = selectedFormName === form.form_name;
            const mapping = mappings.find(
              (m) => m.website_form_name === form.form_name,
            );

            return (
              <button
                key={form.form_name}
                type="button"
                onClick={() => onSelect(form.form_name)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition ${
                  isActive
                    ? "bg-orange-50/50"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-alloro-bg flex items-center justify-center text-alloro-navy flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {form.form_name}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                    <span>{form.submission_count} submission{form.submission_count !== 1 ? "s" : ""}</span>
                    <span>&middot;</span>
                    <span>Last: {relativeTime(form.last_seen)}</span>
                    {mapping?.vendor_form_name && (
                      <>
                        <span>&middot;</span>
                        <span className="truncate">
                          &rarr; {mapping.vendor_form_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 flex-shrink-0 transition ${
                    isActive ? "text-alloro-orange" : "text-gray-300"
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
