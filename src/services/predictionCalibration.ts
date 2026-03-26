/**
 * Prediction Calibration Service -- WO-PREDICTION-CALIBRATION
 *
 * Reads prediction_outcomes to surface calibration data.
 * Determines confidence level and generates calibration notes
 * for the Monday email.
 *
 * // T2 registers GET /api/user/prediction-calibration if needed
 */

import { db } from "../database/connection";

// ─── Types ───

export interface CalibrationSummary {
  total_predictions: number;
  verified_predictions: number;
  accuracy_rate: number;
  confidence_level: "building" | "calibrating" | "calibrated";
  calibration_note: string | null;
}

// ─── Main Function ───

/**
 * Get calibration summary for an org.
 *
 * confidence_level thresholds:
 * - 'building': < 4 verified predictions
 * - 'calibrating': 4-11 verified
 * - 'calibrated': 12+ verified AND accuracy >= 0.75
 */
export async function getCalibrationSummary(orgId: number): Promise<CalibrationSummary> {
  const hasTable = await db.schema.hasTable("prediction_outcomes");
  if (!hasTable) {
    return {
      total_predictions: 0,
      verified_predictions: 0,
      accuracy_rate: 0,
      confidence_level: "building",
      calibration_note: null,
    };
  }

  // Total predictions for this org
  const totalResult = await db("prediction_outcomes")
    .where({ org_id: orgId })
    .count("id as count")
    .first();
  const totalPredictions = Number(totalResult?.count || 0);

  // Verified predictions (was_correct is not null)
  const verifiedResult = await db("prediction_outcomes")
    .where({ org_id: orgId })
    .whereNotNull("was_correct")
    .count("id as count")
    .first();
  const verifiedPredictions = Number(verifiedResult?.count || 0);

  // Correct predictions
  const correctResult = await db("prediction_outcomes")
    .where({ org_id: orgId, was_correct: true })
    .count("id as count")
    .first();
  const correctPredictions = Number(correctResult?.count || 0);

  // Accuracy rate
  const accuracyRate = verifiedPredictions > 0
    ? Math.round((correctPredictions / verifiedPredictions) * 10000) / 10000
    : 0;

  // Confidence level
  let confidenceLevel: "building" | "calibrating" | "calibrated" = "building";
  if (verifiedPredictions >= 12 && accuracyRate >= 0.75) {
    confidenceLevel = "calibrated";
  } else if (verifiedPredictions >= 4) {
    confidenceLevel = "calibrating";
  }

  // Calibration note (only shown in Monday email when relevant)
  let calibrationNote: string | null = null;
  if (accuracyRate < 0.6 && verifiedPredictions > 4) {
    calibrationNote = "This finding is based on early data for your market. Confidence improves each week.";
  } else if (accuracyRate >= 0.85 && verifiedPredictions >= 4) {
    calibrationNote = `Our predictions for your market have been highly accurate over the last ${verifiedPredictions} weeks.`;
  }
  // null otherwise -- most common case, don't add noise

  return {
    total_predictions: totalPredictions,
    verified_predictions: verifiedPredictions,
    accuracy_rate: accuracyRate,
    confidence_level: confidenceLevel,
    calibration_note: calibrationNote,
  };
}

// ─── Update org accuracy after reconciliation ───

/**
 * Persist accuracy_rate on the org after every prediction_outcomes reconciliation.
 */
export async function updateOrgPredictionAccuracy(orgId: number): Promise<void> {
  const summary = await getCalibrationSummary(orgId);

  if (summary.verified_predictions > 0) {
    await db("organizations")
      .where({ id: orgId })
      .update({ prediction_accuracy: summary.accuracy_rate });
  }
}

/**
 * Run calibration update for all orgs with prediction_outcomes.
 * Called after weekly reconciliation cron.
 */
export async function updateAllPredictionAccuracy(): Promise<{ updated: number }> {
  const hasTable = await db.schema.hasTable("prediction_outcomes");
  if (!hasTable) return { updated: 0 };

  const orgIds = await db("prediction_outcomes")
    .distinct("org_id")
    .select("org_id");

  let updated = 0;
  for (const row of orgIds) {
    try {
      await updateOrgPredictionAccuracy(row.org_id);
      updated++;
    } catch (err: any) {
      console.error(`[PredictionCal] Failed for org ${row.org_id}:`, err.message);
    }
  }

  console.log(`[PredictionCal] Updated accuracy for ${updated} orgs`);
  return { updated };
}
