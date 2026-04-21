import { db } from "../../database/connection";

/**
 * Silent Quitter Detector — Mehta rule.
 *
 * The ambiguous pattern: the owner's login frequency has dropped. If you only
 * watch logins, you emit a churn alert and send an unwanted "please come back"
 * email, which is exactly how you turn a grateful owner into a pissed one.
 *
 * The rule: combine login frequency with email engagement.
 *   - Login drop AND email engagement stays high → success.relief_of_knowing
 *     (they trust Alloro to run while they work)
 *   - Both drop → churn.silent_quitter_risk (they have disengaged)
 *   - Login normal → no signal
 *
 * Emits into behavioral_events so the Narrator itself processes the result.
 */

export interface SilentQuitterInput {
  /** Baseline logins per week (30-day trailing avg). */
  baselineLoginsPerWeek: number;
  /** Most recent week's logins. */
  recentLoginsPerWeek: number;
  /** Baseline monday-email open rate (0-1). */
  baselineEmailOpenRate: number;
  /** Most recent week's monday-email open rate (0-1). */
  recentEmailOpenRate: number;
}

export type SilentQuitterClassification =
  | "success.relief_of_knowing"
  | "churn.silent_quitter_risk"
  | "no_signal";

export interface SilentQuitterResult {
  classification: SilentQuitterClassification;
  loginDrop: boolean;
  emailHeld: boolean;
  reasoning: string;
}

const LOGIN_DROP_RATIO = 0.5; // recent is under half the baseline
const EMAIL_STRONG_THRESHOLD = 0.6; // recent open rate still ≥60% of baseline-or-better
const EMAIL_WEAK_THRESHOLD = 0.35; // open rate collapsed

export function classify(input: SilentQuitterInput): SilentQuitterResult {
  const baselineLogins = Math.max(input.baselineLoginsPerWeek, 0.01);
  const baselineEmail = Math.max(input.baselineEmailOpenRate, 0.01);

  const loginRatio = input.recentLoginsPerWeek / baselineLogins;
  const emailRatio = input.recentEmailOpenRate / baselineEmail;

  const loginDrop = loginRatio < LOGIN_DROP_RATIO;

  if (!loginDrop) {
    return {
      classification: "no_signal",
      loginDrop: false,
      emailHeld: emailRatio >= EMAIL_STRONG_THRESHOLD,
      reasoning: `Logins ${input.recentLoginsPerWeek} against baseline ${baselineLogins}, no drop.`,
    };
  }

  // Relative check — recent must retain at least 60% of baseline open rate.
  // An absolute floor alone would misclassify a clear drop (0.72 → 0.35) as
  // "held" when it is actually a halving of engagement.
  const emailHeld = input.recentEmailOpenRate >= baselineEmail * EMAIL_STRONG_THRESHOLD;

  if (emailHeld) {
    return {
      classification: "success.relief_of_knowing",
      loginDrop: true,
      emailHeld: true,
      reasoning: `Logins dropped ${Math.round((1 - loginRatio) * 100)}% but email open rate stayed ${Math.round(
        input.recentEmailOpenRate * 100
      )}%. They trust Alloro to run while they work.`,
    };
  }

  const emailWeak = input.recentEmailOpenRate < baselineEmail * EMAIL_WEAK_THRESHOLD;
  return {
    classification: "churn.silent_quitter_risk",
    loginDrop: true,
    emailHeld: false,
    reasoning: emailWeak
      ? `Logins dropped and email open rate collapsed to ${Math.round(input.recentEmailOpenRate * 100)}%.`
      : `Logins dropped and email engagement weakened below threshold.`,
  };
}

export interface WeeklySweepResult {
  orgId: number;
  classification: SilentQuitterClassification;
  eventEmitted: string | null;
}

/**
 * Weekly cron driver. Reads login + email-engagement signals for every org
 * from behavioral_events over the trailing windows, classifies each, and
 * emits the derived event into behavioral_events so the Narrator processes
 * it on the next tick (creating the feedback loop described in Card 3).
 *
 * Signals read:
 *   - baselineLoginsPerWeek: count of 'ui.login' events in trailing 30d ÷ 4
 *   - recentLoginsPerWeek:   count of 'ui.login' events in last 7d
 *   - baselineEmailOpenRate: monday_email.opened / monday_email.sent, 30d
 *   - recentEmailOpenRate:   same ratio, last 7d (fallback to baseline if zero sends)
 *
 * Emits into behavioral_events using the existing 'behavioral_events' table
 * shape (event_type, org_id, properties).
 */
export async function runSilentQuitterSweep(): Promise<WeeklySweepResult[]> {
  const results: WeeklySweepResult[] = [];
  const nowMs = Date.now();
  const sevenDaysAgo = new Date(nowMs - 7 * 86400000);
  const thirtyDaysAgo = new Date(nowMs - 30 * 86400000);

  const orgs = await db("organizations").select("id");

  for (const org of orgs) {
    const orgId = Number(org.id);

    const [loginsRecentRow, loginsBaselineRow] = await Promise.all([
      db("behavioral_events")
        .where({ org_id: orgId, event_type: "ui.login" })
        .where("created_at", ">=", sevenDaysAgo)
        .count<{ count: string }>("id as count")
        .first(),
      db("behavioral_events")
        .where({ org_id: orgId, event_type: "ui.login" })
        .where("created_at", ">=", thirtyDaysAgo)
        .count<{ count: string }>("id as count")
        .first(),
    ]);

    const recentLogins = Number(loginsRecentRow?.count ?? 0);
    const baselineLogins = Number(loginsBaselineRow?.count ?? 0) / 4;

    const [sentRecent, openedRecent, sent30, opened30] = await Promise.all([
      countEvents(orgId, "monday_email.sent", sevenDaysAgo),
      countEvents(orgId, "monday_email.opened", sevenDaysAgo),
      countEvents(orgId, "monday_email.sent", thirtyDaysAgo),
      countEvents(orgId, "monday_email.opened", thirtyDaysAgo),
    ]);

    const baselineEmail = sent30 === 0 ? 0 : opened30 / sent30;
    const recentEmail = sentRecent === 0 ? baselineEmail : openedRecent / sentRecent;

    const verdict = classify({
      baselineLoginsPerWeek: baselineLogins,
      recentLoginsPerWeek: recentLogins,
      baselineEmailOpenRate: baselineEmail,
      recentEmailOpenRate: recentEmail,
    });

    if (verdict.classification === "no_signal") {
      results.push({ orgId, classification: verdict.classification, eventEmitted: null });
      continue;
    }

    try {
      await db("behavioral_events").insert({
        org_id: orgId,
        event_type: verdict.classification,
        properties: JSON.stringify({
          loginDrop: verdict.loginDrop,
          emailHeld: verdict.emailHeld,
          reasoning: verdict.reasoning,
          recentLoginsPerWeek: recentLogins,
          baselineLoginsPerWeek: baselineLogins,
          recentEmailOpenRate: recentEmail,
          baselineEmailOpenRate: baselineEmail,
        }),
      });
      results.push({
        orgId,
        classification: verdict.classification,
        eventEmitted: verdict.classification,
      });
    } catch {
      results.push({
        orgId,
        classification: verdict.classification,
        eventEmitted: null,
      });
    }
  }

  return results;
}

async function countEvents(orgId: number, eventType: string, since: Date): Promise<number> {
  const row = await db("behavioral_events")
    .where({ org_id: orgId, event_type: eventType })
    .where("created_at", ">=", since)
    .count<{ count: string }>("id as count")
    .first();
  return Number(row?.count ?? 0);
}
