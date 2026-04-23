import InlineEditRow from "../primitives/InlineEditRow";
import { useInlineEdit } from "../hooks/useInlineEdit";
import type { FieldEditorProps } from "../types";

function formatDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function DateFieldEditor({
  field,
  value,
  onChange,
}: FieldEditorProps<string>) {
  const { editing, startEdit, bindInput, draftValue, setDraftValue } = useInlineEdit<string>({
    value,
    onCommit: onChange,
  });

  const inputProps = bindInput();
  const formatted = formatDate(value);

  return (
    <InlineEditRow
      field={field}
      onClickToEdit={editing ? undefined : startEdit}
      isEditing={editing}
    >
      {editing ? (
        <input
          type="date"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          ref={inputProps.ref}
          onKeyDown={inputProps.onKeyDown}
          onBlur={inputProps.onBlur}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        />
      ) : formatted ? (
        <span className="text-sm text-gray-700 truncate block">{formatted}</span>
      ) : (
        <span className="text-sm text-gray-400 italic">Empty</span>
      )}
    </InlineEditRow>
  );
}
