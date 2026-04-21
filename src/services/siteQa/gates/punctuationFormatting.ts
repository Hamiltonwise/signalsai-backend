import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractTextFragments, stripHtml } from "../util";

const URL_REGEX = /\bhttps?:\/\/\S+|www\.\S+|[a-zA-Z0-9.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Detect missing space after a comma or period that separates two words with
 * an initial capital letter. Excludes URLs, emails, and decimal numbers.
 */
const MISSING_SPACE_REGEX = /([a-z])([.,])([A-Z])/g;

export function runPunctuationFormattingGate(ctx: SiteQaContext): GateResult {
  const defects: Defect[] = [];
  const fragments = extractTextFragments(ctx.sections);

  for (const frag of fragments) {
    const plain = stripHtml(frag.text);
    if (!plain) continue;

    // Em-dashes
    if (/—/.test(plain)) {
      defects.push({
        gate: "punctuationFormatting",
        severity: "blocker",
        message: "Em-dash present (banned per standing rule)",
        evidence: {
          text: plain.slice(0, 200),
          sectionIndex: frag.sectionIndex,
          sectionType: frag.sectionType,
          field: frag.field,
          pagePath: ctx.pagePath,
        },
      });
    }

    // Scrub URLs/emails before missing-space check to avoid false positives
    const scrubbed = plain.replace(URL_REGEX, " ");
    const match = scrubbed.match(MISSING_SPACE_REGEX);
    if (match) {
      for (const hit of match) {
        defects.push({
          gate: "punctuationFormatting",
          severity: "blocker",
          message: `Missing space after punctuation: "${hit}"`,
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
  }

  return {
    gate: "punctuationFormatting",
    passed: defects.length === 0,
    defects,
  };
}
