import { ArrowRight, ArrowDownRight, ArrowDown, ArrowUpRight } from "lucide-react";
import ColorPicker from "./ColorPicker";

export type GradientDirection = "to-r" | "to-br" | "to-b" | "to-tr";

export interface GradientValue {
  enabled: boolean;
  from: string;
  to: string;
  direction: GradientDirection;
}

interface GradientPickerProps {
  value: GradientValue;
  onChange: (value: GradientValue) => void;
  /**
   * When the user toggles gradient on for the first time, we default from/to
   * to the primary/accent colors provided here.
   */
  defaultFrom?: string;
  defaultTo?: string;
}

const DIRECTIONS: Array<{ value: GradientDirection; label: string; icon: React.ReactNode; css: string }> = [
  { value: "to-r", label: "Right", icon: <ArrowRight className="h-3.5 w-3.5" />, css: "to right" },
  { value: "to-br", label: "Bottom right", icon: <ArrowDownRight className="h-3.5 w-3.5" />, css: "to bottom right" },
  { value: "to-b", label: "Bottom", icon: <ArrowDown className="h-3.5 w-3.5" />, css: "to bottom" },
  { value: "to-tr", label: "Top right", icon: <ArrowUpRight className="h-3.5 w-3.5" />, css: "to top right" },
];

function cssDirection(dir: GradientDirection): string {
  const match = DIRECTIONS.find((d) => d.value === dir);
  return match?.css || "to bottom right";
}

export default function GradientPicker({
  value,
  onChange,
  defaultFrom,
  defaultTo,
}: GradientPickerProps) {
  const handleToggle = (enabled: boolean) => {
    onChange({
      ...value,
      enabled,
      from: value.from || defaultFrom || "#1E40AF",
      to: value.to || defaultTo || "#F59E0B",
    });
  };

  const previewCss = `linear-gradient(${cssDirection(value.direction)}, ${value.from}, ${value.to})`;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          className="rounded"
        />
        Use gradient
      </label>

      {value.enabled && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
          {/* Direction presets */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 mb-1.5">Direction</div>
            <div className="flex items-center gap-1.5">
              {DIRECTIONS.map((dir) => (
                <button
                  key={dir.value}
                  onClick={() => onChange({ ...value, direction: dir.value })}
                  title={dir.label}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                    value.direction === dir.value
                      ? "border-alloro-orange bg-alloro-orange text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {dir.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <ColorPicker
              value={value.from}
              onChange={(v) => onChange({ ...value, from: v })}
              label="From"
            />
            <ColorPicker
              value={value.to}
              onChange={(v) => onChange({ ...value, to: v })}
              label="To"
            />
          </div>

          {/* Live preview */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 mb-1.5">Preview</div>
            <div
              className="h-10 w-full rounded-lg border border-gray-200"
              style={{ background: previewCss }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
