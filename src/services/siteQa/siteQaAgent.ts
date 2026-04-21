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

export interface RunSiteQaOptions {
  collisionFetcher?: CollisionFetcher;
}

/**
 * Runs all 10 gates in parallel and returns a single pass/fail report with
 * every defect. The report is the unit of truth downstream: publish halt,
 * dream_team_task creation, behavioral_events logging.
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

  const gates = [...syncGates, ...asyncResults];
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
