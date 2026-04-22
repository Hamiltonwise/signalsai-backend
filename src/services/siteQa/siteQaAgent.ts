import type { GateResult, SiteQaContext, SiteQaReport, Defect } from "./types";
import { runAiContentArtifactGate } from "./gates/aiContentArtifact";
import { runPlaceholderTextGate } from "./gates/placeholderText";
import { runBannedPhraseGate } from "./gates/bannedPhrase";
import { runPunctuationFormattingGate } from "./gates/punctuationFormatting";
import { runCopyrightYearGate } from "./gates/copyrightYear";
import { runTemplateCollisionGate, type CollisionFetcher } from "./gates/templateCollision";
import { runStructuralCompletenessGate } from "./gates/structuralCompleteness";
import { runFivePercentElementGate } from "./gates/fivePercentElement";
import { runRecognitionTestGate } from "./gates/recognitionTest";
import { runAltTextSanityGate } from "./gates/altTextSanity";
import { runFreeformConcernGate } from "./gates/freeformConcernGate";
import { isFreeformConcernGateEnabled } from "../rubric/gateFlag";
import { extractTextFragments, stripHtml } from "./util";

export interface RunSiteQaOptions {
  collisionFetcher?: CollisionFetcher;
}

function ctxToPlainText(ctx: SiteQaContext): string {
  const fragments = extractTextFragments(ctx.sections);
  return fragments
    .map((f) => stripHtml(f.text))
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
}

/**
 * Runs all 10 deterministic gates in parallel and returns a single pass/fail
 * report with every defect. When the freeform_concern_gate flag is on for
 * this org, also runs the Standard Rubric as the 11th — final — pass.
 * Flag-off: the rubric gate runs in shadow (scores, logs, does not block).
 */
export async function runSiteQa(
  ctx: SiteQaContext,
  options: RunSiteQaOptions = {}
): Promise<SiteQaReport> {
  const syncGates: GateResult[] = [
    runAiContentArtifactGate(ctx),
    runPlaceholderTextGate(ctx),
    runBannedPhraseGate(ctx),
    runPunctuationFormattingGate(ctx),
    runCopyrightYearGate(ctx),
    runStructuralCompletenessGate(ctx),
  ];

  const asyncResults = await Promise.all([
    runTemplateCollisionGate(ctx, options.collisionFetcher),
    runFivePercentElementGate(ctx),
    runRecognitionTestGate(ctx),
    runAltTextSanityGate(ctx),
  ]);

  const gates: GateResult[] = [...syncGates, ...asyncResults];

  // Freeform Concern Gate — the rubric-driven final pass. Runs only after
  // deterministic gates because a failing deterministic gate already blocks
  // publish, and scoring wastes a judge call on content that won't ship.
  const deterministicPassed = gates.every((g) => g.passed);
  const flagOn = await isFreeformConcernGateEnabled(ctx.orgId);
  if (deterministicPassed && ctx.useLlm !== false) {
    const plainText = ctxToPlainText(ctx);
    if (plainText.length > 0) {
      const gateResult = await runFreeformConcernGate({
        content: plainText,
        orgId: ctx.orgId,
        surface: "siteQa",
        metadata: {
          practice: ctx.orgName,
          url: ctx.pagePath,
        },
      });
      const defects: Defect[] = [];
      // Only produce blocker defects in live mode. Shadow mode records the
      // score but never blocks the publish.
      if (flagOn && gateResult.blocked) {
        defects.push({
          gate: "freeformConcern",
          severity: "blocker",
          message: `Freeform Concern Gate blocked (composite ${gateResult.score.composite} < ${gateResult.score.rubric_version_id ? 80 : 80}). Failing: ${gateResult.failingDimensions.map((d) => d.key).join(", ")}`,
          evidence: {
            text: plainText.slice(0, 300),
            pagePath: ctx.pagePath,
          },
        });
      } else if (!gateResult.passed) {
        defects.push({
          gate: "freeformConcern",
          severity: "warning",
          message: `Rubric composite ${gateResult.score.composite} below threshold (shadow mode — flag off)`,
          evidence: {
            text: plainText.slice(0, 300),
            pagePath: ctx.pagePath,
          },
        });
      }
      gates.push({
        gate: "freeformConcern",
        passed: gateResult.passed || !flagOn,
        defects,
        reasoning: `composite=${gateResult.score.composite} rubric=${gateResult.score.rubric_version_id} mode=${flagOn ? "live" : "shadow"}`,
      });
    }
  }

  const defects: Defect[] = gates.flatMap((g) => g.defects);
  const passed = defects.every((d) => d.severity !== "blocker");

  return {
    projectId: ctx.projectId,
    pagePath: ctx.pagePath,
    passed,
    gates,
    defects,
    ranAt: new Date().toISOString(),
  };
}

export type { SiteQaReport, GateResult, Defect } from "./types";
