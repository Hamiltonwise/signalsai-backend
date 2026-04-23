import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

interface BulkPasteDialogProps {
  onClose: () => void;
  onSubmit: (raw: string) => void;
}

export default function BulkPasteDialog({ onClose, onSubmit }: BulkPasteDialogProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleBackdropClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  const submit = useCallback(() => {
    onSubmit(text);
  }, [text, onSubmit]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Paste image URLs</h3>
            <p className="text-xs text-gray-500 mt-1">
              One URL per line, or separated by commas. Only http(s) URLs are kept.
            </p>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="https://example.com/image-1.jpg&#10;https://example.com/image-2.jpg"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 resize-y"
        />
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
