/**
 * System Conductor Agent -- Execution Service
 *
 * The quality gate before any agent output reaches a client.
 * Every agent calls conductorGate() before delivering output.
 * The Conductor does not originate content. It harmonizes,
 * adjusts, and clears.
 *
 * Six gates run in order:
 * 1. Accuracy: every claim backed by a dataPoint
 * 2. Timing: rate limit (max 3 agent actions per org per 24h)
 * 3. Consistency: no contradictions in last 7 days
 * 4. Voice: no em-dashes, no "practice", no jargon
 * 5. North Star: must have humanNeed OR economicConsequence
 * 6. Biological-Economic Lens: email/notification require both
 *
 * All gate decisions log to behavioral_events.
 * No client communication. No data mutations except logging.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

export interface ConductorInput {
  agentName: string;
  orgId: number;
  outputType: "notification" | "email" | "task" | "dashboard_card" | "slack";
  headline: string;
  body: string;
  dataPoints?: string[];
  humanNeed?: string;
  economicConsequence?: string;
}

export interface ConductorResult {
  cleared: boolean;
  reason?: string;
  gate?: string;
}

// ── Prohibited terms for Voice gate ─────────────────────────────────

const VOICE_VIOLATIONS: { pattern: RegExp; label: string }[] = [
  { pattern: /\u2014/, label: "em-dash" },
  { pattern: /\bpractice\b/i, label: '"practice" (use "business")' },
  { pattern: /\bpatient\b/i, label: '"patient" (use vertical-specific vocabulary)' },
  { pattern: /\bsynergy\b/i, label: 'jargon: "synergy"' },
  { pattern: /\bleverage\b/i, label: 'jargon: "leverage"' },
  { pattern: /\bparadigm\b/i, label: 'jargon: "paradigm"' },
];

// ── Gate helpers ────────────────────────────────────────────────────

async function logGateDecision(
  orgId: number,
  agent: string,
  gate: string,
  result: "pass" | "hold",
  reason: string,
): Promise<void> {
  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "conductor.gate_check",
      org_id: orgId,
      properties: JSON.stringify({
        agent,
        gate,
        result,
        reason,
      }),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[SystemConductor] Failed to log gate decision for org ${orgId}:`,
        message,
      );
    });
}

function hold(gate: string, reason: string): ConductorResult {
  return { cleared: false, gate, reason };
}

// ── Gate 1: Accuracy ────────────────────────────────────────────────

function checkAccuracy(input: ConductorInput): ConductorResult | null {
  const { headline, dataPoints } = input;

  // Extract numbers from the headline
  const numbersInHeadline = headline.match(/\d[\d,.]*%?/g) || [];

  if (numbersInHeadline.length === 0) {
    // No numeric claims, accuracy gate passes
    return null;
  }

  if (!dataPoints || dataPoints.length === 0) {
    return hold(
      "accuracy",
      `Headline contains numeric claims (${numbersInHeadline.join(", ")}) but no dataPoints provided to back them.`,
    );
  }

  // Every number in the headline must appear in at least one dataPoint
  const allDataText = dataPoints.join(" ");
  for (const num of numbersInHeadline) {
    if (!allDataText.includes(num)) {
      return hold(
        "accuracy",
        `Headline claims "${num}" but no dataPoint contains this figure.`,
      );
    }
  }

  return null;
}

// ── Gate 2: Timing ──────────────────────────────────────────────────

async function checkTiming(
  orgId: number,
): Promise<ConductorResult | null> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const recentActions = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("event_type", "like", "agent.%")
    .where("created_at", ">=", twentyFourHoursAgo)
    .count("id as count")
    .first();

  const count = Number(recentActions?.count ?? 0);

  if (count >= 3) {
    return hold(
      "timing",
      `Rate limit reached: ${count} agent actions on this org in the last 24 hours. Maximum is 3.`,
    );
  }

  return null;
}

// ── Gate 3: Consistency ─────────────────────────────────────────────

async function checkConsistency(
  orgId: number,
  headline: string,
): Promise<ConductorResult | null> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentEvents = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("event_type", "like", "agent.%")
    .where("created_at", ">=", sevenDaysAgo)
    .orderBy("created_at", "desc")
    .select("event_type", "properties", "created_at")
    .limit(50);

  // Check for contradiction patterns
  const headlineLower = headline.toLowerCase();

  // Pattern pairs that contradict each other
  const contradictionPairs: [RegExp, RegExp, string][] = [
    [
      /competitor.*(gaining|rising|growing|surging)/i,
      /competitor.*(stalling|declining|falling|dropping)/i,
      "Contradictory competitor signals within 7 days",
    ],
    [
      /steady|stable|consistent/i,
      /drop|decline|fell|plummet/i,
      "Contradictory stability signals within 7 days",
    ],
    [
      /improving|growth|increase/i,
      /worsen|decline|decrease|deteriorat/i,
      "Contradictory trend signals within 7 days",
    ],
  ];

  for (const event of recentEvents) {
    let props: Record<string, unknown> = {};
    try {
      props =
        typeof event.properties === "string"
          ? JSON.parse(event.properties)
          : event.properties ?? {};
    } catch {
      continue;
    }

    const pastHeadline = String(props.headline ?? props.message ?? "").toLowerCase();
    if (!pastHeadline) continue;

    for (const [patternA, patternB, reason] of contradictionPairs) {
      const currentMatchesA = patternA.test(headlineLower);
      const currentMatchesB = patternB.test(headlineLower);
      const pastMatchesA = patternA.test(pastHeadline);
      const pastMatchesB = patternB.test(pastHeadline);

      if ((currentMatchesA && pastMatchesB) || (currentMatchesB && pastMatchesA)) {
        return hold(
          "consistency",
          `${reason}. Current: "${headline}". Previous: "${pastHeadline}".`,
        );
      }
    }
  }

  return null;
}

// ── Gate 4: Voice ───────────────────────────────────────────────────

function checkVoice(input: ConductorInput): ConductorResult | null {
  const fullText = `${input.headline} ${input.body}`;

  for (const { pattern, label } of VOICE_VIOLATIONS) {
    if (pattern.test(fullText)) {
      return hold("voice", `Output contains prohibited term: ${label}.`);
    }
  }

  return null;
}

// ── Gate 5: North Star ──────────────────────────────────────────────

function checkNorthStar(input: ConductorInput): ConductorResult | null {
  if (!input.humanNeed && !input.economicConsequence) {
    return hold(
      "north_star",
      "Output has neither humanNeed nor economicConsequence. Information without direction is noise.",
    );
  }

  return null;
}

// ── Gate 6: Biological-Economic Lens ────────────────────────────────

function checkBioEconLens(input: ConductorInput): ConductorResult | null {
  if (input.outputType === "email" || input.outputType === "notification") {
    if (!input.humanNeed) {
      return hold(
        "bio_econ_lens",
        `Output type "${input.outputType}" requires humanNeed but none provided.`,
      );
    }
    if (!input.economicConsequence) {
      return hold(
        "bio_econ_lens",
        `Output type "${input.outputType}" requires economicConsequence but none provided.`,
      );
    }
  }

  return null;
}

// ── Main export ─────────────────────────────────────────────────────

/**
 * Run all six conductor gates in order.
 * Returns { cleared: true } if all pass.
 * Returns { cleared: false, gate, reason } on first failure.
 */
export async function conductorGate(
  input: ConductorInput,
): Promise<ConductorResult> {
  const gates: {
    name: string;
    check: () => ConductorResult | null | Promise<ConductorResult | null>;
  }[] = [
    { name: "accuracy", check: () => checkAccuracy(input) },
    { name: "timing", check: () => checkTiming(input.orgId) },
    {
      name: "consistency",
      check: () => checkConsistency(input.orgId, input.headline),
    },
    { name: "voice", check: () => checkVoice(input) },
    { name: "north_star", check: () => checkNorthStar(input) },
    { name: "bio_econ_lens", check: () => checkBioEconLens(input) },
  ];

  for (const gate of gates) {
    const result = await gate.check();

    if (result) {
      // Gate failed: log and return hold
      await logGateDecision(
        input.orgId,
        input.agentName,
        gate.name,
        "hold",
        result.reason ?? "No reason provided",
      );

      console.log(
        `[SystemConductor] HELD: ${input.agentName} output for org ${input.orgId} at gate "${gate.name}": ${result.reason}`,
      );

      return result;
    }

    // Gate passed: log success
    await logGateDecision(
      input.orgId,
      input.agentName,
      gate.name,
      "pass",
      "Cleared",
    );
  }

  console.log(
    `[SystemConductor] CLEARED: ${input.agentName} output for org ${input.orgId}. 6/6 gates passed.`,
  );

  return { cleared: true };
}
