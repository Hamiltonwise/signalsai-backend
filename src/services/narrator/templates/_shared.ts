import { calculateImpact, type OrgSnapshot } from "../../economic/economicCalc";
import { checkVoice, composedText } from "../voiceConstraints";
import { tagOutput, type GuidaraTier } from "../guidara95_5";
import type { NarratorEvent, NarratorOutput } from "../types";

/**
 * Format a dollar sentence that sits alongside finding + action.
 * Never fabricate. If dollarValue is null, return null.
 */
export function formatDollarSentence(
  label: string,
  dollar: number | null
): string | null {
  if (dollar == null || !Number.isFinite(dollar)) return null;
  const figure = dollar >= 1000
    ? `$${Math.round(dollar).toLocaleString("en-US")}`
    : `$${Math.round(dollar)}`;
  return `${label} ${figure}.`;
}

/**
 * Compose a finished NarratorOutput from the template parts. Centralizes the
 * economic call, guardrail handling, voice check, and Guidara tier tagging
 * so every template has identical behavior on those axes.
 */
export interface ComposeInput {
  templateName: string;
  event: NarratorEvent;
  org: OrgSnapshot;
  finding: string;
  actionIfDollar: string;
  actionIfDataGap: string;
  dollarLabel?: string;
  forceTier?: GuidaraTier;
  surfaces?: NarratorOutput["surfaces"];
}

export function composeOutput(input: ComposeInput): NarratorOutput {
  const impact = calculateImpact(
    input.event.eventType,
    { eventType: input.event.eventType, properties: input.event.properties },
    input.org
  );

  let dollarSentence: string | null = null;
  let action: string;
  let dataGapReason: string | null = null;

  if (impact.allowedToShowDollar) {
    dollarSentence = formatDollarSentence(
      input.dollarLabel ?? "Estimated 90-day impact:",
      impact.dollar90d
    );
    action = input.actionIfDollar;
  } else {
    dollarSentence = null;
    action = input.actionIfDataGap;
    dataGapReason = impact.dataGapReason;
  }

  const voice = checkVoice(
    composedText({ finding: input.finding, dollar: dollarSentence, action })
  );

  return {
    emit: true,
    finding: input.finding,
    dollar: dollarSentence,
    action,
    tier: tagOutput(input.event.eventType, { forceTier: input.forceTier }),
    template: input.templateName,
    dataGapReason,
    confidence: impact.confidence,
    voiceCheckPassed: voice.passed,
    voiceViolations: voice.violations,
    surfaces: input.surfaces,
  };
}

/**
 * Many templates want to read a specific property from the event payload.
 * Centralized for typing + safety.
 */
export function readProp<T = unknown>(
  event: NarratorEvent,
  key: string,
  fallback?: T
): T | undefined {
  const val = event.properties?.[key];
  if (val === undefined || val === null) return fallback;
  return val as T;
}
