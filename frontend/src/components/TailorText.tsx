/**
 * TailorText -- inline-editable text element for Tailor mode.
 *
 * In normal mode: renders text (override or default).
 * In tailor mode: dashed border on hover, click to edit inline, Enter saves, Escape cancels.
 */

import { useState, useRef, useEffect, useCallback, type ElementType } from "react";
import { Pencil } from "lucide-react";
import { useTailor } from "../contexts/TailorContext";

interface TailorTextProps {
  editKey: string;
  defaultText: string;
  className?: string;
  as?: "p" | "h1" | "h2" | "h3" | "span" | "div";
}

export function TailorText({
  editKey,
  defaultText,
  className = "",
  as = "span",
}: TailorTextProps) {
  const { isTailorMode, getOverride, saveEdit } = useTailor();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const override = getOverride(editKey);
  const displayText = override ?? defaultText;

  const Tag = as as ElementType;

  const startEditing = useCallback(() => {
    if (!isTailorMode) return;
    setEditValue(displayText);
    setIsEditing(true);
  }, [isTailorMode, displayText]);

  // Auto-focus and auto-size the textarea when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      // Auto-size
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = inputRef.current.scrollHeight + "px";
    }
  }, [isEditing]);

  const handleSave = useCallback(async () => {
    setIsEditing(false);
    if (editValue.trim() === displayText) return;
    await saveEdit(editKey, editValue.trim());
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  }, [editValue, displayText, saveEdit, editKey]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  const handleInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = inputRef.current.scrollHeight + "px";
    }
  }, []);

  // Normal mode: just render text
  if (!isTailorMode) {
    return <Tag className={className}>{displayText}</Tag>;
  }

  // Tailor mode, editing state
  if (isEditing) {
    return (
      <span className="relative inline-block w-full">
        <textarea
          ref={inputRef}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          rows={1}
          className={`${className} w-full resize-none border-2 border-[#D56753] rounded-md bg-white/95 px-2 py-1 outline-none shadow-md`}
          style={{ minHeight: "1.5em" }}
        />
      </span>
    );
  }

  // Tailor mode, display state (hoverable)
  return (
    <Tag
      className={`${className} relative cursor-pointer group/tailor border border-dashed border-transparent hover:border-[#D56753]/60 rounded transition-all duration-200`}
      onClick={startEditing}
    >
      {displayText}
      <span className="absolute -top-2 -right-2 opacity-0 group-hover/tailor:opacity-100 transition-opacity duration-200 bg-[#D56753] text-white rounded-full p-0.5 shadow-sm z-10">
        <Pencil size={10} />
      </span>
      {showSaved && (
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap animate-fade-in">
          Saved
        </span>
      )}
    </Tag>
  );
}
