import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractTextFragments, stripHtml } from "../util";

const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bDoctors?\s+Block\b/i, label: "Placeholder \"Doctors Block\"" },
  { pattern: /\bServices?\s+Block\b/i, label: "Placeholder \"Services Block\"" },
  { pattern: /\bLocations?\s+Block\b/i, label: "Placeholder \"Locations Block\"" },
  { pattern: /\bHero\s+Block\b/i, label: "Placeholder \"Hero Block\"" },
  { pattern: /\bLorem ipsum\b/i, label: "Lorem ipsum placeholder" },
  { pattern: /\{\{?\s*[A-Z_][A-Z0-9_]*\s*\}?\}/, label: "Unrendered template token" },
  { pattern: /\{[A-Z_][A-Z0-9_]*\}/, label: "Unrendered {PLACEHOLDER} token" },
  { pattern: /\bTODO\b/, label: "TODO left in copy" },
  { pattern: /\bFIXME\b/, label: "FIXME left in copy" },
  { pattern: /\bINSERT [A-Z]/, label: "INSERT placeholder in copy" },
];

export function runPlaceholderTextGate(ctx: SiteQaContext): GateResult {
  const defects: Defect[] = [];
  const fragments = extractTextFragments(ctx.sections);

  for (const frag of fragments) {
    const plain = stripHtml(frag.text);
    if (!plain) continue;

    for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
      if (pattern.test(plain)) {
        defects.push({
          gate: "placeholderText",
          severity: "blocker",
          message: label,
          evidence: {
            text: plain.slice(0, 200),
            sectionIndex: frag.sectionIndex,
            sectionType: frag.sectionType,
            field: frag.field,
            pagePath: ctx.pagePath,
          },
        });
      }
    }

    // Duplicate consecutive word pairs that indicate the renderer printed the
    // placeholder key twice (e.g. "Block Block", "Doctors Doctors").
    const dupMatch = plain.match(/\b(\w{3,})\s+\1\b/);
    if (dupMatch) {
      defects.push({
        gate: "placeholderText",
        severity: "blocker",
        message: `Duplicate consecutive words: "${dupMatch[0]}"`,
        evidence: {
          text: plain.slice(0, 200),
          sectionIndex: frag.sectionIndex,
          sectionType: frag.sectionType,
          field: frag.field,
          pagePath: ctx.pagePath,
        },
      });
    }
  }

  return {
    gate: "placeholderText",
    passed: defects.length === 0,
    defects,
  };
}
