import React from "react";

/**
 * Parse text containing <hghlt> tags and render with appropriate styling
 * @param text - The text containing <hghlt> tags
 * @param variant - The styling variant:
 *   - 'underline' for standard underlined text
 *   - 'highlight-red' for critical priority
 *   - 'glow-blue' for glowing blue underlined text (proofline)
 * @returns JSX elements with styled highlighted text
 */
export function parseHighlightTags(
  text: string,
  variant: "underline" | "highlight-red" | "glow-blue" = "underline"
): React.ReactNode {
  if (!text || typeof text !== "string") return text;

  // Check if text contains <hghlt> or <hl> tags
  if (!text.includes("<hghlt>") && !text.includes("<hl>")) return text;

  // Normalize <hl> tags to <hghlt> for consistent processing
  const normalizedText = text
    .replace(/<hl>/g, "<hghlt>")
    .replace(/<\/hl>/g, "</hghlt>");

  // Split by <hghlt> and </hghlt> tags
  const parts = normalizedText.split(/(<hghlt>|<\/hghlt>)/);

  let isHighlighted = false;
  const result: React.ReactNode[] = [];

  parts.forEach((part, index) => {
    if (part === "<hghlt>") {
      isHighlighted = true;
      return;
    }
    if (part === "</hghlt>") {
      isHighlighted = false;
      return;
    }

    if (part.trim()) {
      if (isHighlighted) {
        if (variant === "highlight-red") {
          result.push(
            <span
              key={index}
              className="text-red-600 font-black underline decoration-red-600/30 underline-offset-4"
            >
              {part}
            </span>
          );
        } else if (variant === "glow-blue") {
          result.push(
            <span
              key={index}
              className="text-alloro-orange font-black underline underline-offset-4 decoration-alloro-orange/40 decoration-2"
            >
              {part}
            </span>
          );
        } else {
          result.push(
            <span key={index} className="underline underline-offset-4">
              {part}
            </span>
          );
        }
      } else {
        result.push(<React.Fragment key={index}>{part}</React.Fragment>);
      }
    }
  });

  return result.length > 0 ? <>{result}</> : text;
}

// Remove highlight tags from text entirely (for plain text contexts)
export function stripHighlightTags(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(/<\/?hghlt>/g, "");
}

// Check if text contains highlight tags
export function hasHighlightTags(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return text.includes("<hghlt>");
}
