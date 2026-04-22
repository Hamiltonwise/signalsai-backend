/**
 * Shared types for The Standard — Runtime Principle Rubric v1.
 *
 * The rubric is the single engine every doctor-facing output is scored
 * against at runtime. Source of truth: Notion page 349fdaf120c48170acfaef33f723e957.
 * Weights loaded at runtime and cached 24h. See standardRubric.ts.
 */

export type ScoringMode = "runtime" | "seo" | "aeo" | "cro";

export interface ScoringMetadata {
  practice?: string;
  specialty?: string;
  location?: string;
  url?: string;
  patientReviewText?: string[];
  competitorContext?: string;
}

export interface ScoringContext {
  mode: ScoringMode;
  metadata?: ScoringMetadata;
}

export type DimensionVerdict = "scored" | "n_a" | "pass_gate" | "fail_gate";

export interface DimensionResult {
  name: string;
  score: number;
  max: number;
  verdict: DimensionVerdict;
  reasoning: string;
}

export interface RepairInstruction {
  dimension: string;
  instruction: string;
}

export interface ScoreResult {
  composite: number;
  dimensions: Record<string, DimensionResult>;
  repair_instructions: RepairInstruction[];
  rubric_version_id: string;
  mode: ScoringMode;
  judge_model: string;
  loaded_from: "notion" | "fallback";
  scored_at: string;
}

export interface DimensionSpec {
  key: string;
  name: string;
  max: number;
  description: string;
  isPass: boolean;
  patientFacingOnly: boolean;
  redistributeOnNa: boolean;
}

export interface ModeWeights {
  /** map of dimension.key → multiplier applied to raw score. 1.0 = use spec default. */
  dimensionWeights: Record<string, number>;
  /** threshold under which a score is considered failing for this mode. */
  passThreshold: number;
  /** one-line posture shown to the judge to bias its emphasis. */
  emphasis: string;
}

export interface RubricConfig {
  versionId: string;
  metaDimension: DimensionSpec;
  subDimensions: DimensionSpec[];
  modeWeights: Record<ScoringMode, ModeWeights>;
  source: "notion" | "fallback";
  loadedAt: string;
}
