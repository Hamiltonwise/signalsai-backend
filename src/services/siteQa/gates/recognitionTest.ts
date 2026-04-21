import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractTextFragments, stripHtml } from "../util";
import { askLlmGate } from "../llm";

const CRITERION =
  "Would a staff member of this practice read this and say 'yes, that's specifically us'? Reject if the copy could plausibly describe any practice in this vertical.";

function collectPageCopy(ctx: SiteQaContext): string {
  const fragments = extractTextFragments(ctx.sections);
  return fragments
    .map((f) => stripHtml(f.text))
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
}

export async function runRecognitionTestGate(ctx: SiteQaContext): Promise<GateResult> {
  if (!ctx.useLlm) {
    return {
      gate: "recognitionTest",
      passed: true,
      defects: [],
      reasoning: "LLM gates disabled for this run (useLlm=false)",
    };
  }

  const copy = collectPageCopy(ctx);
  const verdict = await askLlmGate(CRITERION, copy, ctx.orgName);

  const defects: Defect[] = [];
  if (!verdict.passed) {
    defects.push({
      gate: "recognitionTest",
      severity: "blocker",
      message: "Page copy fails the Recognition Test",
      evidence: {
        text: verdict.reasoning,
        pagePath: ctx.pagePath,
      },
    });
  }

  return {
    gate: "recognitionTest",
    passed: verdict.passed,
    defects,
    reasoning: verdict.reasoning,
  };
}
