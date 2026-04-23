import InlineEditRow from "../primitives/InlineEditRow";
import type { FieldEditorProps } from "../types";

export default function BooleanFieldEditor({
  field,
  value,
  onChange,
}: FieldEditorProps<boolean>) {
  const on = Boolean(value);

  const toggle = () => onChange(!on);

  return (
    <InlineEditRow field={field}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={toggle}
          className={[
            "relative inline-flex items-center w-10 h-6 rounded-full transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
            on ? "bg-indigo-500" : "bg-gray-200",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-150",
              on ? "translate-x-[18px]" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
        <span className="text-sm text-gray-700 select-none">{on ? "Yes" : "No"}</span>
      </div>
    </InlineEditRow>
  );
}
