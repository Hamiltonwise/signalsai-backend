import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractTextFragments, stripHtml } from "../util";

const YEAR_REGEX = /(?:©|\(c\)|copyright)[\s.]*([0-9]{4})(?:\s?[-–]\s?([0-9]{4}))?/gi;

export function runCopyrightYearGate(ctx: SiteQaContext): GateResult {
  const defects: Defect[] = [];
  const fragments = extractTextFragments(ctx.sections);
  const currentYear = ctx.currentYear;

  // Scan body sections
  for (const frag of fragments) {
    const plain = stripHtml(frag.text);
    if (!plain) continue;
    checkYears(plain, frag.sectionIndex, frag.sectionType, frag.field, defects, currentYear, ctx.pagePath);
  }

  // Footer passed separately (project.footer)
  if (ctx.footer) {
    const footerPlain = stripHtml(ctx.footer);
    checkYears(footerPlain, -1, "footer", "footer", defects, currentYear, ctx.pagePath);
  }

  return {
    gate: "copyrightYear",
    passed: defects.length === 0,
    defects,
  };
}

function checkYears(
  text: string,
  sectionIndex: number,
  sectionType: string | undefined,
  field: string,
  defects: Defect[],
  currentYear: number,
  pagePath?: string
): void {
  let match: RegExpExecArray | null;
  const regex = new RegExp(YEAR_REGEX.source, "gi");
  while ((match = regex.exec(text)) !== null) {
    const year = parseInt(match[2] ?? match[1], 10);
    if (Number.isFinite(year) && year !== currentYear) {
      defects.push({
        gate: "copyrightYear",
        severity: "blocker",
        message: `Copyright year ${year} does not equal current year ${currentYear}`,
        evidence: {
          text: match[0],
          sectionIndex,
          sectionType,
          field,
          pagePath,
        },
      });
    }
  }
}
