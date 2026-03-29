/**
 * Learning Agent -- Execution Service
 *
 * Runs weekly Sunday 9 PM PT. Queries behavioral_events for the
 * last 7 days and calculates 5 metrics with compound rates
 * (this week vs last week). Pure SQL aggregation, no AI needed.
 *
 * Writes "learning.weekly_calibration" event with all metrics.
 */

import { db } from "../../database/connection";

// ── Types ───────────────────────────────────────────────────────────

interface WeeklyMetric {
  name: string;
  thisWeek: number;
  lastWeek: number;
  compoundRate: number | null;
}

interface LearningCalibration {
  metrics: WeeklyMetric[];
  overallCompoundRate: number | null;
  calibratedAt: string;
}

// ── Core ────────────────────────────────────────────────────────────

/**
 * Run the Learning Agent weekly calibration.
 * Returns all 5 metrics with compound rates.
 */
export async function runLearningCalibration(): Promise<LearningCalibration> {
  const now = new Date();

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(thisWeekStart.getDate() - 7);

  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(lastWeekStart.getDate() - 14);

  const metrics: WeeklyMetric[] = [];

  // 1. Monday email open rate (email.opened / email.sent)
  const emailOpenThis = await computeRate(
    "email.opened",
    "email.sent",
    thisWeekStart,
    now,
  );
  const emailOpenLast = await computeRate(
    "email.opened",
    "email.sent",
    lastWeekStart,
    thisWeekStart,
  );
  metrics.push(buildMetric("monday_email_open_rate", emailOpenThis, emailOpenLast));

  // 2. Checkup completion rate (checkup.completed / checkup.started)
  const checkupThis = await computeRate(
    "checkup.completed",
    "checkup.started",
    thisWeekStart,
    now,
  );
  const checkupLast = await computeRate(
    "checkup.completed",
    "checkup.started",
    lastWeekStart,
    thisWeekStart,
  );
  metrics.push(buildMetric("checkup_completion_rate", checkupThis, checkupLast));

  // 3. One action completion rate (one_action.completed / one_action.assigned)
  const oneActionThis = await computeRate(
    "one_action.completed",
    "one_action.assigned",
    thisWeekStart,
    now,
  );
  const oneActionLast = await computeRate(
    "one_action.completed",
    "one_action.assigned",
    lastWeekStart,
    thisWeekStart,
  );
  metrics.push(
    buildMetric("one_action_completion_rate", oneActionThis, oneActionLast),
  );

  // 4. Review request conversion (review_request.completed / review_request.sent)
  const reviewThis = await computeRate(
    "review_request.completed",
    "review_request.sent",
    thisWeekStart,
    now,
  );
  const reviewLast = await computeRate(
    "review_request.completed",
    "review_request.sent",
    lastWeekStart,
    thisWeekStart,
  );
  metrics.push(
    buildMetric("review_request_conversion", reviewThis, reviewLast),
  );

  // 5. CS agent satisfaction (positive cs_agent events / total cs_agent events)
  const csSatThis = await computeCsSatisfaction(thisWeekStart, now);
  const csSatLast = await computeCsSatisfaction(lastWeekStart, thisWeekStart);
  metrics.push(buildMetric("cs_agent_satisfaction", csSatThis, csSatLast));

  // Overall compound rate: average of non-null compound rates
  const validRates = metrics
    .map((m) => m.compoundRate)
    .filter((r): r is number => r !== null);
  const overallCompoundRate =
    validRates.length > 0
      ? validRates.reduce((a, b) => a + b, 0) / validRates.length
      : null;

  // Write calibration event
  const calibration: LearningCalibration = {
    metrics,
    overallCompoundRate,
    calibratedAt: new Date().toISOString(),
  };

  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "learning.weekly_calibration",
      org_id: null,
      properties: JSON.stringify(calibration),
      created_at: new Date(),
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[LearningAgent] Failed to write calibration event:`,
        message,
      );
    });

  console.log(
    `[LearningAgent] Calibration complete. Overall compound rate: ${
      overallCompoundRate !== null ? overallCompoundRate.toFixed(3) : "N/A"
    }`,
  );

  return calibration;
}

// ── Helpers ─────────────────────────────────────────────────────────

async function countEvents(
  eventType: string,
  from: Date,
  to: Date,
): Promise<number> {
  const result = await db("behavioral_events")
    .where("event_type", eventType)
    .where("created_at", ">=", from)
    .where("created_at", "<", to)
    .count("* as cnt")
    .first();
  return Number(result?.cnt ?? 0);
}

async function computeRate(
  numeratorType: string,
  denominatorType: string,
  from: Date,
  to: Date,
): Promise<number> {
  const numerator = await countEvents(numeratorType, from, to);
  const denominator = await countEvents(denominatorType, from, to);
  if (denominator === 0) return 0;
  return numerator / denominator;
}

async function computeCsSatisfaction(from: Date, to: Date): Promise<number> {
  const total = await db("behavioral_events")
    .where("event_type", "like", "cs_agent.%")
    .where("created_at", ">=", from)
    .where("created_at", "<", to)
    .count("* as cnt")
    .first();

  const positive = await db("behavioral_events")
    .where("event_type", "like", "cs_agent.%")
    .where("created_at", ">=", from)
    .where("created_at", "<", to)
    .whereRaw("properties::text LIKE '%\"satisfaction\":\"positive\"%'")
    .count("* as cnt")
    .first();

  const totalCount = Number(total?.cnt ?? 0);
  const positiveCount = Number(positive?.cnt ?? 0);

  if (totalCount === 0) return 0;
  return positiveCount / totalCount;
}

function buildMetric(
  name: string,
  thisWeek: number,
  lastWeek: number,
): WeeklyMetric {
  const compoundRate = lastWeek > 0 ? thisWeek / lastWeek : null;
  return { name, thisWeek, lastWeek, compoundRate };
}
