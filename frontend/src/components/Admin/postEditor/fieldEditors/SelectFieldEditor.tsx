import InlineEditRow from "../primitives/InlineEditRow";
import AnimatedSelect from "../../../ui/AnimatedSelect";
import type { FieldEditorProps } from "../types";

export default function SelectFieldEditor({
  field,
  value,
  onChange,
}: FieldEditorProps<string>) {
  const options = field.options?.map((o) => ({ value: o, label: o })) ?? [];

  return (
    <InlineEditRow field={field}>
      <AnimatedSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Select..."
        size="sm"
      />
    </InlineEditRow>
  );
}
