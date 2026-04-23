import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import BulkPasteDialog from "../primitives/BulkPasteDialog";

interface UseBulkPasteParams {
  onAddUrls: (urls: string[]) => void;
}

export function useBulkPaste({ onAddUrls }: UseBulkPasteParams): {
  open: () => void;
  dialog: ReactNode;
} {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleSubmit = useCallback(
    (raw: string) => {
      const tokens = raw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//.test(s));
      if (tokens.length > 0) onAddUrls(tokens);
      setIsOpen(false);
    },
    [onAddUrls]
  );

  const dialog = isOpen ? (
    <BulkPasteDialog onClose={close} onSubmit={handleSubmit} />
  ) : null;

  return { open, dialog };
}
