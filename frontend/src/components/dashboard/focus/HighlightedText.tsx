import React from "react";

interface HighlightedTextProps {
  text: string;
  highlights?: string[];
}

/**
 * HighlightedText — wraps occurrences of `highlights` phrases inside `text`
 * with `<mark className="hl">` JSX nodes. Pure-text only: never accepts or
 * emits raw HTML, so agent-authored output cannot inject markup.
 *
 * Algorithm (port of ~/Desktop/another-design/project/parts.jsx:4-19):
 *   1. No highlights → return text as-is.
 *   2. Filter empties, sort longest-first so overlapping prefixes match the
 *      longer phrase (e.g. "form submissions" beats "form").
 *   3. Escape regex specials in each phrase.
 *   4. Build a single grouped alternation `/(a|b|c)/g`. Splitting on a regex
 *      with a capture group keeps the matches in the resulting array.
 *   5. Walk the parts; if a part exactly matches a sorted highlight, wrap it
 *      in `<mark className="hl">`, else render the plain string.
 *
 * Phrases that don't appear in `text` are silent no-ops — the regex simply
 * never matches them, so they don't affect output.
 */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  highlights,
}) => {
  if (!highlights || highlights.length === 0) {
    return <>{text}</>;
  }

  const sorted = highlights
    .filter((h): h is string => Boolean(h && h.length))
    .sort((a, b) => b.length - a.length);

  if (sorted.length === 0) {
    return <>{text}</>;
  }

  const escaped = sorted.map((s) => s.replace(REGEX_SPECIALS, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(re);

  return (
    <>
      {parts.map((part, i) => {
        if (sorted.includes(part)) {
          return (
            <mark key={i} className="hl">
              {part}
            </mark>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
};

export default HighlightedText;
