import type { DynamicSlotDef } from "../../api/websites";

interface DynamicSlotInputsProps {
  slots: DynamicSlotDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  title?: string;
  emptyMessage?: string;
}

/**
 * Renders a set of slot input fields. Text slots render as textareas; url slots
 * render as url inputs. Each slot shows label + description + input. Controlled.
 */
export default function DynamicSlotInputs({
  slots,
  values,
  onChange,
  title,
  emptyMessage = "No slots defined for this template page.",
}: DynamicSlotInputsProps) {
  if (!slots || slots.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic">{emptyMessage}</div>
    );
  }

  return (
    <div className="space-y-3">
      {title && (
        <div className="text-xs font-semibold text-gray-700">{title}</div>
      )}
      {slots.map((slot) => (
        <div key={slot.key} className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            {slot.label}
            {slot.type === "url" && (
              <span className="ml-1.5 text-[9px] uppercase font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                URL
              </span>
            )}
          </label>
          {slot.description && (
            <p className="text-[11px] text-gray-500 leading-snug">
              {slot.description}
            </p>
          )}
          {slot.type === "url" ? (
            <input
              type="url"
              value={values[slot.key] || ""}
              onChange={(e) => onChange(slot.key, e.target.value)}
              placeholder={slot.placeholder || "https://..."}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
            />
          ) : (
            <textarea
              value={values[slot.key] || ""}
              onChange={(e) => onChange(slot.key, e.target.value)}
              placeholder={slot.placeholder || ""}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
            />
          )}
        </div>
      ))}
    </div>
  );
}
