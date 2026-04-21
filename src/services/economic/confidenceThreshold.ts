/**
 * Theranos guardrail.
 *
 * The number one rule of the Economic Calc: if we don't have the data to
 * support a dollar figure with at least 80% confidence, we do not make one up.
 * We emit a data-gap reason instead. The Recipe asks for one finding + one
 * dollar + one action. When the dollar isn't earned, the Narrator renders the
 * data-gap variant (finding + "upload data" action) rather than fabricating.
 *
 * This file owns the threshold and the guardrail's single canonical check so
 * every caller is aligned.
 */

export const CONFIDENCE_THRESHOLD = 80;

export interface GuardrailInput {
  dollar30d?: number | null;
  dollar90d?: number | null;
  dollar365d?: number | null;
  confidence: number;
  dataGapReason?: string | null;
}

export interface GuardrailedImpact {
  dollar30d: number | null;
  dollar90d: number | null;
  dollar365d: number | null;
  confidence: number;
  dataGapReason: string | null;
  allowedToShowDollar: boolean;
}

export function applyGuardrail(input: GuardrailInput): GuardrailedImpact {
  const passes =
    input.confidence >= CONFIDENCE_THRESHOLD &&
    input.dollar30d != null &&
    input.dollar30d >= 0;

  if (!passes) {
    return {
      dollar30d: null,
      dollar90d: null,
      dollar365d: null,
      confidence: input.confidence,
      dataGapReason:
        input.dataGapReason ??
        `Confidence ${input.confidence}% below threshold ${CONFIDENCE_THRESHOLD}%`,
      allowedToShowDollar: false,
    };
  }

  return {
    dollar30d: input.dollar30d ?? null,
    dollar90d: input.dollar90d ?? null,
    dollar365d: input.dollar365d ?? null,
    confidence: input.confidence,
    dataGapReason: null,
    allowedToShowDollar: true,
  };
}
