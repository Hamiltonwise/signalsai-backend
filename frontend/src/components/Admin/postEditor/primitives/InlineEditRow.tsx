import type { ReactNode, KeyboardEvent } from "react";
import FieldTypeIcon from "./FieldTypeIcon";
import type { SchemaField } from "../types";

interface InlineEditRowProps {
  field: SchemaField;
  children: ReactNode;
  rightSlot?: ReactNode;
  onClickToEdit?: () => void;
  isEditing?: boolean;
}

export default function InlineEditRow({
  field,
  children,
  rightSlot,
  onClickToEdit,
  isEditing,
}: InlineEditRowProps) {
  const clickable = Boolean(onClickToEdit) && !isEditing;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || !onClickToEdit) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClickToEdit();
    }
  };

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClickToEdit : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
      className={[
        "flex items-center gap-3 py-2.5 px-3 rounded-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
        clickable ? "hover:bg-gray-50 cursor-pointer" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="w-8 shrink-0 flex items-center justify-center">
        <FieldTypeIcon type={field.type} />
      </div>
      <div className="w-40 shrink-0 text-sm text-gray-600 truncate">
        {field.name}
        {field.required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
      {rightSlot ? <div className="shrink-0 flex items-center">{rightSlot}</div> : null}
    </div>
  );
}
