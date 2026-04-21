import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractAltTexts } from "../util";
import { askLlmGate } from "../llm";

const PATTERN_HINTS: RegExp[] = [
  /\bduplicate\b/i,
  /\bidentical composition\b/i,
  /\bsame as previous\b/i,
  /\bsame as above\b/i,
  /\bsame image\b/i,
  /\bcouldn't generate\b/i,
  /\bai failure\b/i,
  /\bgeneration (issue|failed|error)\b/i,
  /\bhallucinat/i,
];

const LLM_CRITERION =
  "Does any alt text describe AI failures, duplications, or generation issues, rather than describing the actual image? Reject only when alt text exposes the generation process.";

export async function runAltTextSanityGate(ctx: SiteQaContext): Promise<GateResult> {
  const defects: Defect[] = [];
  const alts = extractAltTexts(ctx.sections);

  // Deterministic pattern pass (always runs)
  for (const entry of alts) {
    for (const pattern of PATTERN_HINTS) {
      if (pattern.test(entry.alt)) {
        defects.push({
          gate: "altTextSanity",
          severity: "blocker",
          message: "Alt text describes AI failure / duplication",
          evidence: {
            text: entry.alt.slice(0, 200),
            sectionIndex: entry.sectionIndex,
            sectionType: entry.sectionType,
            field: entry.field,
            pagePath: ctx.pagePath,
          },
        });
      }
    }
  }

  // LLM verification on remaining alts (only when enabled and no deterministic hit)
  if (ctx.useLlm && defects.length === 0 && alts.length > 0) {
    const summary = alts.map((a, i) => `${i + 1}. ${a.alt}`).join("\n").slice(0, 4000);
    const verdict = await askLlmGate(LLM_CRITERION, summary, ctx.orgName);
    if (!verdict.passed) {
      defects.push({
        gate: "altTextSanity",
        severity: "blocker",
        message: "LLM flagged alt text as describing AI generation artifacts",
        evidence: {
          text: verdict.reasoning,
          pagePath: ctx.pagePath,
        },
      });
    }
    return {
      gate: "altTextSanity",
      passed: defects.length === 0,
      defects,
      reasoning: verdict.reasoning,
    };
  }

  return {
    gate: "altTextSanity",
    passed: defects.length === 0,
    defects,
  };
}
