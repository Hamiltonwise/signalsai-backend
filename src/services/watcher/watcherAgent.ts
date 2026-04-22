/**
 * Manifest v2 Card 5 — Watcher Agent.
 *
 * Continuous monitoring agent that watches for meaningful changes across
 * practice signals and emits behavioral_events when patterns are detected.
 *
 * Two scan cadences:
 *   1. Hourly per-practice: review velocity, GBP completeness, ranking moves,
 *      competitor activity, Recognition Score regressions.
 *   2. Daily cross-practice: collisions, milestones, patterns.
 *
 * Pattern detection rules are config-driven via Notion page
 * "Watcher Agent — Pattern Rules v1".
 *
 * Feature flag: watcher_agent_enabled (default false).
 *
 * Shadow mode: when flag is off, watcher runs scans and archives signals
 * but does NOT emit behavioral_events to downstream consumers.
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { isEnabled } from "../featureFlags";
import {
  WATCHER_HOURLY_SCAN_STARTED,
  WATCHER_HOURLY_SCAN_COMPLETED,
  WATCHER_DAILY_SCAN_STARTED,
  WATCHER_DAILY_SCAN_COMPLETED,
  WATCHER_SIGNAL_DETECTED,
} from "../../constants/eventTypes";

// ── Types ────────────────────────────────────────────────────────────

export type SignalType =
  | "review_velocity_change"
  | "gbp_completeness_change"
  | "ranking_move"
  | "competitor_activity"
  | "recognition_score_regression"
  | "cross_practice_collision"
  | "milestone_detected"
  | "pattern_detected";

export type SignalSeverity = "info" | "warning" | "critical";

export interface WatcherSignal {
  orgId: number;
  signalType: SignalType;
  severity: SignalSeverity;
  title: string;
  detail: string;
  data: Record<string, unknown>;
  detectedAt: string;
}

export interface HourlyScanResult {
  orgId: number;
  signals: WatcherSignal[];
  durationMs: number;
}

export interface DailyScanResult {
  orgIds: number[];
  signals: WatcherSignal[];
  durationMs: number;
}

export interface PatternRule {
  id: string;
  name: string;
  signalType: SignalType;
  severity: SignalSeverity;
  condition: PatternCondition;
  messageTemplate: string;
}

export type PatternCondition =
  | { type: "threshold"; metric: string; operator: ">" | "<" | ">=" | "<="; value: number }
  | { type: "delta"; metric: string; periodDays: number; minDelta: number }
  | { type: "streak"; metric: string; direction: "up" | "down"; minDays: number }
  | { type: "absence"; metric: string; maxDaysSilent: number };

export interface PatternRulesConfig {
  rules: PatternRule[];
}

// ── Default pattern rules (fallback when Notion is unavailable) ──────

const DEFAULT_PATTERN_RULES: PatternRulesConfig = {
  rules: [
    {
      id: "review-velocity-spike",
      name: "Review Velocity Spike",
      signalType: "review_velocity_change",
      severity: "info",
      condition: { type: "delta", metric: "review_count_7d", periodDays: 7, minDelta: 3 },
      messageTemplate: "Review velocity changed by {delta} in the last 7 days",
    },
    {
      id: "review-velocity-drop",
      name: "Review Velocity Drop",
      signalType: "review_velocity_change",
      severity: "warning",
      condition: { type: "delta", metric: "review_count_7d", periodDays: 7, minDelta: -3 },
      messageTemplate: "Review velocity dropped by {delta} in the last 7 days",
    },
    {
      id: "ranking-significant-move",
      name: "Ranking Significant Move",
      signalType: "ranking_move",
      severity: "info",
      condition: { type: "delta", metric: "local_pack_rank", periodDays: 7, minDelta: 3 },
      messageTemplate: "Local pack ranking moved {delta} positions",
    },
    {
      id: "gbp-completeness-regression",
      name: "GBP Completeness Regression",
      signalType: "gbp_completeness_change",
      severity: "warning",
      condition: { type: "delta", metric: "gbp_completeness_pct", periodDays: 7, minDelta: -10 },
      messageTemplate: "GBP completeness dropped by {delta}%",
    },
    {
      id: "competitor-review-surge",
      name: "Competitor Review Surge",
      signalType: "competitor_activity",
      severity: "warning",
      condition: { type: "delta", metric: "competitor_review_count_7d", periodDays: 7, minDelta: 5 },
      messageTemplate: "Competitor gained {delta} reviews in 7 days",
    },
    {
      id: "recognition-score-drop",
      name: "Recognition Score Regression",
      signalType: "recognition_score_regression",
      severity: "critical",
      condition: { type: "delta", metric: "recognition_score", periodDays: 7, minDelta: -15 },
      messageTemplate: "Recognition Score dropped by {delta} points",
    },
    {
      id: "review-drought",
      name: "Review Drought",
      signalType: "review_velocity_change",
      severity: "warning",
      condition: { type: "absence", metric: "last_review_date", maxDaysSilent: 14 },
      messageTemplate: "No new reviews in {days} days",
    },
    {
      id: "ranking-streak-up",
      name: "Ranking Improvement Streak",
      signalType: "ranking_move",
      severity: "info",
      condition: { type: "streak", metric: "local_pack_rank", direction: "up", minDays: 21 },
      messageTemplate: "Ranking has improved for {days} consecutive days",
    },
  ],
};

// ── Pattern rules loader (Notion config-driven, cached 24h) ──────────

let cachedRules: PatternRulesConfig | null = null;
let rulesCacheExpiry = 0;
const RULES_CACHE_TTL = 24 * 60 * 60 * 1000;

async function loadPatternRules(): Promise<PatternRulesConfig> {
  if (cachedRules && Date.now() < rulesCacheExpiry) {
    return cachedRules;
  }

  try {
    // TODO: Load from Notion page "Watcher Agent — Pattern Rules v1"
    // when the page has a fenced JSON block tagged `alloro:pattern-rules`.
    // For now, fall back to defaults.
  } catch {
    // Notion unavailable — use defaults
  }

  cachedRules = DEFAULT_PATTERN_RULES;
  rulesCacheExpiry = Date.now() + RULES_CACHE_TTL;
  return cachedRules;
}

// ── Metric snapshots ─────────────────────────────────────────────────

interface OrgMetrics {
  orgId: number;
  orgName: string;
  reviewCount7d: number;
  reviewCountPrior7d: number;
  lastReviewDate: Date | null;
  gbpCompletenessPct: number;
  gbpCompletenessPctPrior: number;
  localPackRank: number | null;
  localPackRankPrior: number | null;
  competitorReviewCount7d: number;
  competitorReviewCountPrior7d: number;
  recognitionScore: number | null;
  recognitionScorePrior: number | null;
}

async function loadOrgMetrics(orgId: number): Promise<OrgMetrics | null> {
  try {
    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) return null;

    // Review velocity: count reviews in last 7d vs prior 7d
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [reviewCount7d] = await db("reviews")
      .where({ org_id: orgId })
      .where("created_at", ">=", sevenDaysAgo)
      .count("id as count");

    const [reviewCountPrior7d] = await db("reviews")
      .where({ org_id: orgId })
      .where("created_at", ">=", fourteenDaysAgo)
      .where("created_at", "<", sevenDaysAgo)
      .count("id as count");

    const lastReview = await db("reviews")
      .where({ org_id: orgId })
      .orderBy("created_at", "desc")
      .first("created_at");

    // Ranking snapshots: latest vs prior week
    const latestSnapshot = await db("ranking_snapshots")
      .where({ org_id: orgId })
      .orderBy("created_at", "desc")
      .first();

    const priorSnapshot = await db("ranking_snapshots")
      .where({ org_id: orgId })
      .where("created_at", "<", sevenDaysAgo)
      .orderBy("created_at", "desc")
      .first();

    // GBP completeness from latest snapshot
    const gbpPct = latestSnapshot?.gbp_completeness_pct ?? 0;
    const gbpPctPrior = priorSnapshot?.gbp_completeness_pct ?? gbpPct;

    // Local pack rank
    const localRank = latestSnapshot?.local_pack_rank ?? null;
    const localRankPrior = priorSnapshot?.local_pack_rank ?? null;

    // Competitor review count (aggregate across all competitors)
    const [compReviews7d] = await db("competitor_snapshots")
      .where({ org_id: orgId })
      .where("created_at", ">=", sevenDaysAgo)
      .sum("review_count as total");

    const [compReviewsPrior7d] = await db("competitor_snapshots")
      .where({ org_id: orgId })
      .where("created_at", ">=", fourteenDaysAgo)
      .where("created_at", "<", sevenDaysAgo)
      .sum("review_count as total");

    // Recognition score from latest scoring run
    const latestScore = await db("recognition_scores")
      .where({ org_id: orgId })
      .orderBy("scored_at", "desc")
      .first();

    const priorScore = await db("recognition_scores")
      .where({ org_id: orgId })
      .where("scored_at", "<", sevenDaysAgo)
      .orderBy("scored_at", "desc")
      .first();

    return {
      orgId,
      orgName: org.name ?? `Org ${orgId}`,
      reviewCount7d: Number(reviewCount7d?.count ?? 0),
      reviewCountPrior7d: Number(reviewCountPrior7d?.count ?? 0),
      lastReviewDate: lastReview?.created_at ?? null,
      gbpCompletenessPct: Number(gbpPct),
      gbpCompletenessPctPrior: Number(gbpPctPrior),
      localPackRank: localRank != null ? Number(localRank) : null,
      localPackRankPrior: localRankPrior != null ? Number(localRankPrior) : null,
      competitorReviewCount7d: Number(compReviews7d?.total ?? 0),
      competitorReviewCountPrior7d: Number(compReviewsPrior7d?.total ?? 0),
      recognitionScore: latestScore?.score ?? null,
      recognitionScorePrior: priorScore?.score ?? null,
    };
  } catch (err) {
    console.warn(`[WATCHER] Failed to load metrics for org ${orgId}:`, err);
    return null;
  }
}

// ── Rule evaluation ──────────────────────────────────────────────────

function evaluateRule(
  rule: PatternRule,
  metrics: OrgMetrics
): WatcherSignal | null {
  const { condition } = rule;

  const metricValue = getMetricValue(condition.metric ?? "", metrics);
  const priorValue = getMetricPriorValue(condition.metric ?? "", metrics);

  switch (condition.type) {
    case "threshold": {
      if (metricValue == null) return null;
      const pass = evaluateOperator(metricValue, condition.operator, condition.value);
      if (!pass) return null;
      return buildSignal(rule, metrics, { value: metricValue });
    }

    case "delta": {
      if (metricValue == null || priorValue == null) return null;
      const delta = metricValue - priorValue;
      // For negative minDelta (drops), check if delta is <= minDelta
      // For positive minDelta (spikes), check if delta is >= minDelta
      if (condition.minDelta < 0 && delta > condition.minDelta) return null;
      if (condition.minDelta >= 0 && delta < condition.minDelta) return null;
      return buildSignal(rule, metrics, { delta, current: metricValue, prior: priorValue });
    }

    case "streak": {
      // Streaks require historical data; for now check if direction matches
      if (metricValue == null || priorValue == null) return null;
      const improving = condition.direction === "up"
        ? metricValue > priorValue
        : metricValue < priorValue;
      if (!improving) return null;
      return buildSignal(rule, metrics, { direction: condition.direction, days: condition.minDays });
    }

    case "absence": {
      if (condition.metric === "last_review_date") {
        if (!metrics.lastReviewDate) {
          return buildSignal(rule, metrics, { days: "unknown" });
        }
        const daysSilent = Math.floor(
          (Date.now() - new Date(metrics.lastReviewDate).getTime()) /
            (24 * 60 * 60 * 1000)
        );
        if (daysSilent < condition.maxDaysSilent) return null;
        return buildSignal(rule, metrics, { days: daysSilent });
      }
      return null;
    }

    default:
      return null;
  }
}

function getMetricValue(metric: string, m: OrgMetrics): number | null {
  const map: Record<string, number | null> = {
    review_count_7d: m.reviewCount7d,
    gbp_completeness_pct: m.gbpCompletenessPct,
    local_pack_rank: m.localPackRank,
    competitor_review_count_7d: m.competitorReviewCount7d,
    recognition_score: m.recognitionScore,
  };
  return map[metric] ?? null;
}

function getMetricPriorValue(metric: string, m: OrgMetrics): number | null {
  const map: Record<string, number | null> = {
    review_count_7d: m.reviewCountPrior7d,
    gbp_completeness_pct: m.gbpCompletenessPctPrior,
    local_pack_rank: m.localPackRankPrior,
    competitor_review_count_7d: m.competitorReviewCountPrior7d,
    recognition_score: m.recognitionScorePrior,
  };
  return map[metric] ?? null;
}

function evaluateOperator(
  value: number,
  operator: ">" | "<" | ">=" | "<=",
  threshold: number
): boolean {
  switch (operator) {
    case ">": return value > threshold;
    case "<": return value < threshold;
    case ">=": return value >= threshold;
    case "<=": return value <= threshold;
  }
}

function buildSignal(
  rule: PatternRule,
  metrics: OrgMetrics,
  data: Record<string, unknown>
): WatcherSignal {
  let detail = rule.messageTemplate;
  for (const [key, val] of Object.entries(data)) {
    detail = detail.replace(`{${key}}`, String(val));
  }

  return {
    orgId: metrics.orgId,
    signalType: rule.signalType,
    severity: rule.severity,
    title: rule.name,
    detail,
    data: { ...data, orgName: metrics.orgName, ruleId: rule.id },
    detectedAt: new Date().toISOString(),
  };
}

// ── Archive signals ──────────────────────────────────────────────────

async function archiveSignals(
  signals: WatcherSignal[],
  scanType: "hourly" | "daily",
  mode: "live" | "shadow"
): Promise<void> {
  if (signals.length === 0) return;

  try {
    const rows = signals.map((s) => ({
      org_id: s.orgId,
      signal_type: s.signalType,
      severity: s.severity,
      title: s.title,
      detail: s.detail,
      data_json: JSON.stringify(s.data),
      scan_type: scanType,
      mode,
      detected_at: s.detectedAt,
    }));

    await db("watcher_signals").insert(rows);
  } catch {
    console.warn(
      `[WATCHER] Failed to archive ${signals.length} signals (${scanType})`
    );
  }
}

// ── Emit signals as behavioral_events ────────────────────────────────

async function emitSignals(signals: WatcherSignal[]): Promise<void> {
  for (const signal of signals) {
    await BehavioralEventModel.create({
      event_type: WATCHER_SIGNAL_DETECTED,
      org_id: signal.orgId,
      properties: {
        signal_type: signal.signalType,
        severity: signal.severity,
        title: signal.title,
        detail: signal.detail,
        data: signal.data,
      },
    }).catch(() => {});
  }
}

// ── Hourly per-practice scan ─────────────────────────────────────────

export async function runHourlyScan(orgId: number): Promise<HourlyScanResult> {
  const start = Date.now();
  const flagEnabled = await isEnabled("watcher_agent_enabled", orgId);
  const mode = flagEnabled ? "live" : "shadow";

  const metrics = await loadOrgMetrics(orgId);
  if (!metrics) {
    return { orgId, signals: [], durationMs: Date.now() - start };
  }

  const rules = await loadPatternRules();
  const signals: WatcherSignal[] = [];

  for (const rule of rules.rules) {
    const signal = evaluateRule(rule, metrics);
    if (signal) {
      signals.push(signal);
    }
  }

  // Archive always
  await archiveSignals(signals, "hourly", mode);

  // Emit only in live mode
  if (mode === "live" && signals.length > 0) {
    await emitSignals(signals);
  }

  return { orgId, signals, durationMs: Date.now() - start };
}

// ── Daily cross-practice scan ────────────────────────────────────────

export async function runDailyScan(): Promise<DailyScanResult> {
  const start = Date.now();

  // Load all active orgs
  const orgs = await db("organizations")
    .whereNull("deleted_at")
    .select("id", "name");

  const orgIds = orgs.map((o: { id: number }) => o.id);
  const allSignals: WatcherSignal[] = [];

  // Cross-practice collision detection
  const collisionSignals = await detectCollisions(orgs);
  allSignals.push(...collisionSignals);

  // Cross-practice milestone detection
  const milestoneSignals = await detectCrossPracticeMilestones(orgs);
  allSignals.push(...milestoneSignals);

  // Cross-practice pattern detection
  const patternSignals = await detectCrossPracticePatterns(orgs);
  allSignals.push(...patternSignals);

  // Determine mode per-org for archiving
  const flagEnabled = await isEnabled("watcher_agent_enabled");
  const mode = flagEnabled ? "live" : "shadow";

  await archiveSignals(allSignals, "daily", mode);

  if (mode === "live" && allSignals.length > 0) {
    await emitSignals(allSignals);
  }

  return { orgIds, signals: allSignals, durationMs: Date.now() - start };
}

// ── Cross-practice: collision detection ──────────────────────────────

async function detectCollisions(
  orgs: Array<{ id: number; name: string }>
): Promise<WatcherSignal[]> {
  const signals: WatcherSignal[] = [];

  try {
    // Find orgs that share the same city + specialty (potential keyword collision)
    const orgProfiles = await Promise.all(
      orgs.map(async (org) => {
        const data = await db("organizations")
          .where({ id: org.id })
          .first("business_data", "checkup_data");
        let city = "";
        let specialty = "";

        if (data?.business_data) {
          const bd =
            typeof data.business_data === "string"
              ? JSON.parse(data.business_data)
              : data.business_data;
          city = bd?.city ?? "";
          specialty = bd?.specialty ?? bd?.category ?? "";
        }

        return { orgId: org.id, orgName: org.name, city, specialty };
      })
    );

    // Group by city+specialty
    const groups: Record<string, typeof orgProfiles> = {};
    for (const profile of orgProfiles) {
      if (!profile.city || !profile.specialty) continue;
      const key = `${profile.city.toLowerCase()}:${profile.specialty.toLowerCase()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(profile);
    }

    // Emit collision signals for groups with 2+ orgs
    for (const [key, group] of Object.entries(groups)) {
      if (group.length < 2) continue;
      for (const org of group) {
        signals.push({
          orgId: org.orgId,
          signalType: "cross_practice_collision",
          severity: "warning",
          title: "Cross-Practice Keyword Collision",
          detail: `${org.orgName} shares market (${key}) with ${group.length - 1} other Alloro practice(s)`,
          data: {
            market: key,
            collidingOrgs: group
              .filter((g) => g.orgId !== org.orgId)
              .map((g) => ({ id: g.orgId, name: g.orgName })),
          },
          detectedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    console.warn("[WATCHER] Collision detection failed");
  }

  return signals;
}

// ── Cross-practice: milestone detection ──────────────────────────────

async function detectCrossPracticeMilestones(
  orgs: Array<{ id: number; name: string }>
): Promise<WatcherSignal[]> {
  const signals: WatcherSignal[] = [];

  try {
    for (const org of orgs) {
      // Check for review count milestones (50, 100, 200, 500)
      const [reviewCount] = await db("reviews")
        .where({ org_id: org.id })
        .count("id as count");

      const count = Number(reviewCount?.count ?? 0);
      const milestones = [50, 100, 200, 500, 1000];

      for (const milestone of milestones) {
        if (count >= milestone && count < milestone + 5) {
          // Check if we already emitted this milestone
          const existing = await db("watcher_signals")
            .where({ org_id: org.id, signal_type: "milestone_detected" })
            .whereRaw("data_json::text LIKE ?", [`%"milestone":${milestone}%`])
            .first();

          if (!existing) {
            signals.push({
              orgId: org.id,
              signalType: "milestone_detected",
              severity: "info",
              title: `${milestone} Reviews Milestone`,
              detail: `${org.name} reached ${count} total reviews`,
              data: { milestone, currentCount: count },
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch {
    console.warn("[WATCHER] Milestone detection failed");
  }

  return signals;
}

// ── Cross-practice: pattern detection ────────────────────────────────

async function detectCrossPracticePatterns(
  orgs: Array<{ id: number; name: string }>
): Promise<WatcherSignal[]> {
  const signals: WatcherSignal[] = [];

  try {
    // Detect if multiple orgs show the same trend (e.g., all ranking drops)
    const metricsAll = await Promise.all(
      orgs.map((org) => loadOrgMetrics(org.id))
    );

    const validMetrics = metricsAll.filter(
      (m): m is OrgMetrics => m !== null
    );

    // Check for systemic ranking drops (>50% of orgs declining)
    const rankingDeclines = validMetrics.filter(
      (m) =>
        m.localPackRank != null &&
        m.localPackRankPrior != null &&
        m.localPackRank > m.localPackRankPrior
    );

    if (
      validMetrics.length >= 3 &&
      rankingDeclines.length > validMetrics.length * 0.5
    ) {
      for (const m of rankingDeclines) {
        signals.push({
          orgId: m.orgId,
          signalType: "pattern_detected",
          severity: "critical",
          title: "Systemic Ranking Decline",
          detail: `${rankingDeclines.length}/${validMetrics.length} practices showing ranking declines — possible algorithm update`,
          data: {
            decliningCount: rankingDeclines.length,
            totalCount: validMetrics.length,
            orgName: m.orgName,
          },
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Check for systemic review drought (>50% of orgs with no reviews in 14d)
    const reviewDroughts = validMetrics.filter(
      (m) =>
        m.lastReviewDate &&
        Date.now() - new Date(m.lastReviewDate).getTime() >
          14 * 24 * 60 * 60 * 1000
    );

    if (
      validMetrics.length >= 3 &&
      reviewDroughts.length > validMetrics.length * 0.5
    ) {
      for (const m of reviewDroughts) {
        signals.push({
          orgId: m.orgId,
          signalType: "pattern_detected",
          severity: "warning",
          title: "Systemic Review Drought",
          detail: `${reviewDroughts.length}/${validMetrics.length} practices with no reviews in 14+ days`,
          data: {
            droughtCount: reviewDroughts.length,
            totalCount: validMetrics.length,
            orgName: m.orgName,
          },
          detectedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    console.warn("[WATCHER] Cross-practice pattern detection failed");
  }

  return signals;
}
