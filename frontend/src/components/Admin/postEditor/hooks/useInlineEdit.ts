import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

type EditableEl = HTMLInputElement | HTMLTextAreaElement;

interface UseInlineEditParams<T> {
  value: T;
  onCommit: (next: T) => void;
  onCancel?: () => void;
  multiline?: boolean;
}

export function useInlineEdit<T>({
  value,
  onCommit,
  onCancel,
  multiline,
}: UseInlineEditParams<T>) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<T>(value);
  const elRef = useRef<EditableEl | null>(null);

  useEffect(() => {
    if (!editing) setDraftValue(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && elRef.current) {
      const el = elRef.current;
      el.focus();
      // Select text when editing begins — textareas and inputs both support select()
      if (typeof el.select === "function") el.select();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    setDraftValue(value);
    setEditing(true);
  }, [value]);

  const cancel = useCallback(() => {
    setDraftValue(value);
    setEditing(false);
    onCancel?.();
  }, [value, onCancel]);

  const commit = useCallback(
    (next?: T) => {
      const candidate = (next === undefined ? draftValue : next) as T;
      setEditing(false);
      if (Object.is(candidate, value)) return;
      onCommit(candidate);
    },
    [draftValue, value, onCommit]
  );

  const bindInput = useCallback(() => {
    const ref = (node: EditableEl | null) => {
      elRef.current = node;
    };

    const onKeyDown = (e: KeyboardEvent<EditableEl>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === "Enter") {
        if (multiline) {
          // In multiline, plain Enter adds newline; Cmd/Ctrl+Enter commits
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            commit();
          }
          return;
        }
        e.preventDefault();
        commit();
      }
    };

    const onBlur = () => {
      if (editing) commit();
    };

    return { ref, onKeyDown, onBlur };
  }, [multiline, editing, cancel, commit]);

  return {
    editing,
    startEdit,
    cancel,
    commit,
    bindInput,
    draftValue,
    setDraftValue,
  };
}
