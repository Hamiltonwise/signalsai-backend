import InlineEditRow from "../primitives/InlineEditRow";
import { useInlineEdit } from "../hooks/useInlineEdit";
import type { FieldEditorProps } from "../types";

type NumberValue = number | "";

export default function NumberFieldEditor({
  field,
  value,
  onChange,
}: FieldEditorProps<NumberValue>) {
  // Draft is kept as string so partial input (empty, "-", etc.) doesn't fight the input
  const { editing, startEdit, bindInput, draftValue, setDraftValue } = useInlineEdit<string>({
    value: value === "" ? "" : String(value),
    onCommit: (next) => {
      onChange(next === "" ? "" : Number(next));
    },
  });

  const inputProps = bindInput();
  const displayValue = value === "" ? null : String(value);

  return (
    <InlineEditRow
      field={field}
      onClickToEdit={editing ? undefined : startEdit}
      isEditing={editing}
    >
      {editing ? (
        <input
          type="number"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          ref={inputProps.ref}
          onKeyDown={inputProps.onKeyDown}
          onBlur={inputProps.onBlur}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        />
      ) : displayValue !== null ? (
        <span className="text-sm text-gray-700 truncate block">{displayValue}</span>
      ) : (
        <span className="text-sm text-gray-400 italic">Empty</span>
      )}
    </InlineEditRow>
  );
}
