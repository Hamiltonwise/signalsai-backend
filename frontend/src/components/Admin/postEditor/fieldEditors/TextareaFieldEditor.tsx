import InlineEditRow from "../primitives/InlineEditRow";
import { useInlineEdit } from "../hooks/useInlineEdit";
import type { FieldEditorProps } from "../types";

export default function TextareaFieldEditor({
  field,
  value,
  onChange,
}: FieldEditorProps<string>) {
  const { editing, startEdit, bindInput, draftValue, setDraftValue } = useInlineEdit<string>({
    value,
    onCommit: onChange,
    multiline: true,
  });

  const inputProps = bindInput();

  return (
    <InlineEditRow
      field={field}
      onClickToEdit={editing ? undefined : startEdit}
      isEditing={editing}
    >
      {editing ? (
        <textarea
          rows={3}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          ref={inputProps.ref}
          onKeyDown={inputProps.onKeyDown}
          onBlur={inputProps.onBlur}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        />
      ) : value ? (
        <span className="line-clamp-1 text-sm text-gray-700">{value}</span>
      ) : (
        <span className="text-sm text-gray-400 italic">Empty</span>
      )}
    </InlineEditRow>
  );
}
