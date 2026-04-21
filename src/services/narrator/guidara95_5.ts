/**
 * Guidara 95/5 Tagger
 *
 * Every Narrator output is tagged one of:
 *   - "expected"                 (95% of the time — routine intelligence)
 *   - "unreasonable_hospitality" (5% — clean-week exhale, milestones, unprompted delight)
 *
 * The weekly review cadence samples both tiers to verify Alloro maintains the
 * Will Guidara 95/5 split in real output. If expected drifts below 90% or
 * above 98%, the ratio alert fires.
 */

export type GuidaraTier = "expected" | "unreasonable_hospitality";

const UNREASONABLE_EVENTS = new Set<string>([
  "clean_week",
  "milestone.achieved",
  "first_win.achieved",
  "site.published",
  "dreamweaver.moment_created",
]);

/**
 * Deterministic tagger. Fed by event_type; a caller can override with a
 * forced tier for manually-composed unreasonable moments (e.g. anniversary
 * detection surfacing via a different event type).
 */
export function tagOutput(
  eventType: string,
  opts: { forceTier?: GuidaraTier } = {}
): GuidaraTier {
  if (opts.forceTier) return opts.forceTier;
  return UNREASONABLE_EVENTS.has(eventType) ? "unreasonable_hospitality" : "expected";
}

/**
 * Observes the tier distribution across a batch of narrator_outputs. Returns
 * whether the ratio is in the Guidara band. Caller reads narrator_outputs
 * weekly and pipes the result here.
 */
export interface RatioReport {
  total: number;
  expected: number;
  unreasonable: number;
  expectedPct: number;
  inBand: boolean;
}

export function reportRatio(tags: GuidaraTier[]): RatioReport {
  const total = tags.length;
  const expected = tags.filter((t) => t === "expected").length;
  const unreasonable = total - expected;
  const expectedPct = total === 0 ? 0 : (expected / total) * 100;
  // Guidara band: 90-98% expected. Below 90% = over-delighting, above 98% = sterile.
  const inBand = total === 0 ? true : expectedPct >= 90 && expectedPct <= 98;
  return { total, expected, unreasonable, expectedPct, inBand };
}
