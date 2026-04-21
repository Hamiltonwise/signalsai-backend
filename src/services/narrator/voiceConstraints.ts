/**
 * Voice Constraints
 *
 * Encodes Specialist Sentiment Lattice voice rules and the
 * human-authenticity mandate into a single pass/fail checker every
 * Narrator template runs against. A failing voice_check does NOT block
 * the output in Shadow mode — it's observability only — but it is
 * logged to narrator_outputs and used to grade the 10-output sample in
 * the weekly review cadence.
 *
 * The rules here are the encoded version of "the 10pm Test": would a
 * tired skeptical owner understand this immediately and know what to do?
 */

export interface VoiceCheckResult {
  passed: boolean;
  violations: string[];
  warnings: string[];
}

const BANNED_PHRASES: RegExp[] = [
  /\bstrategy\b/i,
  /\bgrowth\b/i,
  /\bbest-in-class\b/i,
  /\bbest in class\b/i,
  /\bworld-class\b/i,
  /\bworld class\b/i,
  /\bstate-of-the-art\b/i,
  /\bcutting-edge\b/i,
  /\bcutting edge\b/i,
  /\bleverage\b/i,
  /\bsynergy\b/i,
  /\bunlock\b/i,
  /\bsupercharge\b/i,
  /\belevate\b/i,
  /\bgame-changing\b/i,
  /\binnovative\s+solution/i,
  /\brevolutionary\b/i,
  /\bindustry-leading\b/i,
  /\bturnkey\b/i,
  /\bscale\s+(?:your|the)\b/i,
];

// "optimize" is allowed only when followed by a specific metric in the next 6 words
const OPTIMIZE_WITH_METRIC = /\boptimiz\w+\b[^.!?]{0,60}?\b(?:\d+%|\d+\s?(?:days?|weeks?|months?)|\$\d)/i;

const ALLORO_AS_HERO: RegExp[] = [
  /\bwe\s+saved\s+(?:you|your)/i,
  /\bwe\s+rescued\b/i,
  /\bAlloro\s+is\s+the\s+(?:best|only)/i,
  /\bour\s+revolutionary\b/i,
];

const SHAME_LANGUAGE: RegExp[] = [
  /\byou(?:'re|\s+are)\s+(?:behind|failing|losing)\b/i,
  /\byou\s+haven't\s+(?:even|yet)\b/i,
  /\b(?:missed\s+opportunity|falling\s+short)\b/i,
  /\byou\s+should\s+have\b/i,
];

const MISSING_SPACE = /([a-z])([.,!?])([A-Z])/;
const EM_DASH = /—/;

export function checkVoice(text: string): VoiceCheckResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  if (!text || text.trim().length === 0) {
    return { passed: false, violations: ["empty output"], warnings: [] };
  }

  for (const re of BANNED_PHRASES) {
    const match = text.match(re);
    if (match) violations.push(`banned phrase: "${match[0]}"`);
  }

  // "optimize" special case
  const hasOptimize = /\boptimiz\w+/i.test(text);
  if (hasOptimize && !OPTIMIZE_WITH_METRIC.test(text)) {
    violations.push('"optimize" used without a specific metric');
  }

  for (const re of ALLORO_AS_HERO) {
    const match = text.match(re);
    if (match) violations.push(`Alloro-as-hero framing: "${match[0]}"`);
  }

  for (const re of SHAME_LANGUAGE) {
    const match = text.match(re);
    if (match) violations.push(`shame language: "${match[0]}"`);
  }

  if (EM_DASH.test(text)) {
    violations.push("em-dash present (banned per standing rule)");
  }

  const missingSpace = text.match(MISSING_SPACE);
  if (missingSpace) {
    violations.push(`missing space after punctuation: "${missingSpace[0]}"`);
  }

  // 10pm Test proxies — warnings, not violations
  if (text.length > 800) warnings.push("output > 800 chars, consider tightening");
  const sentenceCount = (text.match(/[.!?]/g) ?? []).length;
  if (sentenceCount > 6) warnings.push("more than 6 sentences, tighten");

  return { passed: violations.length === 0, violations, warnings };
}

/**
 * Helper: extract the plain concatenation of finding + action + any
 * displayed dollar sentence. Used by Narrator service to voice-check the
 * composed output as one block before emit.
 */
export function composedText(parts: {
  finding: string;
  dollar?: string | null;
  action: string;
}): string {
  return [parts.finding, parts.dollar, parts.action].filter(Boolean).join(" ");
}
