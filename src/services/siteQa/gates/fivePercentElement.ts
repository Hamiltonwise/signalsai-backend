import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractTextFragments, stripHtml } from "../util";
import { askLlmGate } from "../llm";

const CRITERION =
  "Does the hero or about section contain at least one detail that is specific to this practice and could not be said about any other practice?";

function collectHeroOrAboutCopy(ctx: SiteQaContext): string {
  const fragments = extractTextFragments(ctx.sections);
  const parts: string[] = [];
  for (const frag of fragments) {
    const type = (frag.sectionType || "").toLowerCase();
    if (type.includes("hero") || type.includes("about") || type.includes("intro") || type.includes("banner")) {
      const plain = stripHtml(frag.text);
      if (plain) parts.push(plain);
    }
  }
  if (parts.length === 0) {
    // Fallback: use the first 1500 characters of any copy so the LLM has something to judge
    const plain = fragments.map((f) => stripHtml(f.text)).join("\n").slice(0, 1500);
    return plain;
  }
  return parts.join("\n").slice(0, 4000);
}

export async function runFivePercentElementGate(ctx: SiteQaContext): Promise<GateResult> {
  if (!ctx.useLlm) {
    return {
      gate: "fivePercentElement",
      passed: true,
      defects: [],
      reasoning: "LLM gates disabled for this run (useLlm=false)",
    };
  }

  const copy = collectHeroOrAboutCopy(ctx);
  const verdict = await askLlmGate(CRITERION, copy, ctx.orgName);

  const defects: Defect[] = [];
  if (!verdict.passed) {
    defects.push({
      gate: "fivePercentElement",
      severity: "blocker",
      message: "Hero/about section lacks a practice-specific detail (Five Percent Element)",
      evidence: {
        text: verdict.reasoning,
        pagePath: ctx.pagePath,
      },
    });
  }

  return {
    gate: "fivePercentElement",
    passed: verdict.passed,
    defects,
    reasoning: verdict.reasoning,
  };
}
