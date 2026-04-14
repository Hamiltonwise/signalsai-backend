/**
 * CommentComposer — write a new comment (or edit an existing one) with
 * @-mention autocomplete sourced from /api/pm/users.
 *
 * Mentions are maintained as a controlled number[] on the side of the
 * body string. When the user selects a suggestion, we insert the
 * `@display_name` token into the body AND push the user's id into the
 * mentions array. The server persists the array verbatim — nothing is
 * re-parsed from the body text.
 *
 * The popup lives in a local absolutely-positioned div pinned under the
 * caret line. Arrow keys navigate, Enter/Tab selects, Escape closes.
 *
 * This file also exports `CommentEditor` — a slimmer variant used by
 * CommentsSection for inline edit of an existing comment.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PmUser {
  id: number;
  display_name: string;
  email: string;
}

interface CommentComposerProps {
  /**
   * Kept for caller convenience / future hooks — the composer itself is
   * presentational and never talks to the server; the parent handles I/O.
   */
  taskId?: string;
  users: PmUser[];
  initialBody?: string;
  initialMentions?: number[];
  submitting?: boolean;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (body: string, mentions: number[]) => Promise<void> | void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

interface PopupState {
  open: boolean;
  query: string;
  anchor: { top: number; left: number } | null;
  /** Text position of the `@` trigger (caret index at the start of the @) */
  triggerAt: number;
  selectedIndex: number;
}

const EMPTY_POPUP: PopupState = {
  open: false,
  query: "",
  anchor: null,
  triggerAt: -1,
  selectedIndex: 0,
};

export function CommentComposer({
  users,
  initialBody = "",
  initialMentions = [],
  submitting = false,
  placeholder = "Write a comment… (markdown supported, use @ to mention)",
  submitLabel = "Comment",
  onSubmit,
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const [body, setBody] = useState<string>(initialBody);
  const [mentions, setMentions] = useState<number[]>(initialMentions);
  const [popup, setPopup] = useState<PopupState>(EMPTY_POPUP);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filtered = useMemo(() => {
    if (!popup.open) return [];
    const q = popup.query.toLowerCase();
    return users
      .filter((u) => u.display_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [popup.open, popup.query, users]);

  useEffect(() => {
    if (!popup.open) return;
    // If the selected index is out of range after filter, clamp.
    if (popup.selectedIndex >= filtered.length) {
      setPopup((p) => ({
        ...p,
        selectedIndex: Math.max(0, filtered.length - 1),
      }));
    }
  }, [popup.open, filtered.length, popup.selectedIndex]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const closePopup = useCallback(() => setPopup(EMPTY_POPUP), []);

  const evaluatePopup = useCallback(
    (value: string, caret: number) => {
      // Walk backwards from the caret to find an @ not preceded by a
      // letter/number/_. If we hit whitespace before @, no match.
      let i = caret - 1;
      while (i >= 0) {
        const ch = value[i];
        if (ch === "@") {
          // Confirm @ is at string start or preceded by whitespace/punctuation
          const prev = i === 0 ? " " : value[i - 1];
          if (/\s|[,.;:!?()[\]{}]/.test(prev) || i === 0) {
            const query = value.slice(i + 1, caret);
            // If query has whitespace, close.
            if (/\s/.test(query)) {
              closePopup();
              return;
            }
            // Compute anchor position relative to the textarea. We use
            // bottom-left of the textarea as the anchor — simpler than
            // measuring caret pixel position and plenty good for our UX.
            const ta = textareaRef.current;
            if (!ta) return;
            const rect = ta.getBoundingClientRect();
            const parent =
              ta.parentElement?.getBoundingClientRect() ?? rect;
            setPopup({
              open: true,
              query,
              anchor: {
                top: rect.bottom - parent.top + 4,
                left: rect.left - parent.left + 12,
              },
              triggerAt: i,
              selectedIndex: 0,
            });
            return;
          }
        }
        if (/\s/.test(ch)) {
          break;
        }
        i--;
      }
      closePopup();
    },
    [closePopup]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setBody(value);
    const caret = e.target.selectionStart ?? value.length;
    evaluatePopup(value, caret);
  };

  const handleSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    evaluatePopup(ta.value, ta.selectionStart ?? ta.value.length);
  };

  const insertMention = useCallback(
    (user: PmUser) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const caret = ta.selectionStart ?? body.length;
      const start = popup.triggerAt;
      if (start < 0) return;
      const before = body.slice(0, start);
      const after = body.slice(caret);
      const insert = `@${user.display_name} `;
      const next = `${before}${insert}${after}`;
      setBody(next);
      if (!mentions.includes(user.id)) {
        setMentions((prev) => [...prev, user.id]);
      }
      closePopup();
      // Restore caret after the inserted token.
      const nextCaret = start + insert.length;
      // Defer to let React flush the new value.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.selectionStart = el.selectionEnd = nextCaret;
      });
    },
    [body, mentions, popup.triggerAt, closePopup]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popup.open && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPopup((p) => ({
          ...p,
          selectedIndex: (p.selectedIndex + 1) % filtered.length,
        }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPopup((p) => ({
          ...p,
          selectedIndex:
            (p.selectedIndex - 1 + filtered.length) % filtered.length,
        }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filtered[popup.selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closePopup();
        return;
      }
    }

    // Cmd/Ctrl+Enter submit shortcut
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    // Prune mention ids that are no longer referenced in the body to
    // reflect deletions made by the user between typing and submit.
    const present = mentions.filter((id) => {
      const u = users.find((x) => x.id === id);
      if (!u) return false;
      return body.includes(`@${u.display_name}`);
    });
    await onSubmit(trimmed, present);
    setBody("");
    setMentions([]);
  }, [body, mentions, onSubmit, submitting, users]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleChange}
        onSelect={handleSelect}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay close so clicks on popup items land before we close.
          setTimeout(() => closePopup(), 120);
        }}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        style={{
          borderColor: "var(--color-pm-border)",
          backgroundColor: "var(--color-pm-bg-primary)",
          color: "var(--color-pm-text-primary)",
        }}
      />

      {popup.open && filtered.length > 0 && popup.anchor && (
        <div
          className="absolute z-40 max-h-52 min-w-[220px] overflow-y-auto rounded-lg border shadow-lg"
          style={{
            top: popup.anchor.top,
            left: popup.anchor.left,
            backgroundColor: "var(--color-pm-bg-secondary)",
            borderColor: "var(--color-pm-border)",
            boxShadow: "var(--pm-shadow-elevated)",
          }}
        >
          <ul className="py-1 text-sm">
            {filtered.map((u, idx) => (
              <li key={u.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // prevent textarea blur before click registers
                    e.preventDefault();
                    insertMention(u);
                  }}
                  onMouseEnter={() =>
                    setPopup((p) => ({ ...p, selectedIndex: idx }))
                  }
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
                  style={{
                    backgroundColor:
                      idx === popup.selectedIndex
                        ? "var(--color-pm-bg-hover)"
                        : "transparent",
                    color: "var(--color-pm-text-primary)",
                  }}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: "var(--color-pm-bg-primary)",
                      color: "#D66853",
                      border: "1px solid var(--color-pm-border)",
                    }}
                  >
                    {u.display_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate">{u.display_name}</span>
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--color-pm-text-muted)" }}
                  >
                    {u.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ color: "var(--color-pm-text-muted)" }}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "#D66853" }}
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * CommentEditor — inline edit shell that reuses CommentComposer. Kept as a
 * named export so the CommentsSection list item can render it in place.
 */
export function CommentEditor(props: CommentComposerProps) {
  return <CommentComposer {...props} autoFocus submitLabel="Save" />;
}
