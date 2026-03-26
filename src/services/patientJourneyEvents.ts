/**
 * Patient Journey Event Tracking -- WO-PATIENT-JOURNEY-TRACKING
 *
 * Tracks the patient journey from Checkup view through to booked appointment.
 * Creates the closed loop between Alloro's actions and patient outcomes.
 *
 * HIPAA note: session_id is anonymous, no patient names or PHI stored.
 * All identifiers are session-level, not patient-level.
 *
 * This data feeds:
 * - The 365-day progress report (conversion funnel section)
 * - The Purpose Agent weekly impact signal
 * - The Founder Mode Ledger panel (human stories)
 *
 * // T2 registers GET /api/admin/patient-journey/:orgId endpoint
 * // HIPAA note: session_id is anonymous, no patient names or PHI stored
 */

import { db } from "../database/connection";

// ─── Types ───

export type JourneyEventType =
  | "checkup_viewed"
  | "patientpath_visited"
  | "gp_referral_form_submitted"
  | "review_left"
  | "appointment_booked_via_referral";

export type JourneySource = "organic" | "gp_referral" | "review" | "direct";

export interface PatientJourneyEvent {
  org_id: number;
  event_type: JourneyEventType;
  source: JourneySource;
  session_id: string;
  occurred_at?: Date;
  metadata?: Record<string, unknown>;
}

export interface JourneyFunnel {
  checkup_views: number;
  patientpath_visits: number;
  gp_referral_forms: number;
  reviews_left: number;
  appointments_booked: number;
  conversion_rate: number; // referral_forms / checkup_views
}

// ─── Log Event ───

/**
 * Log a patient journey event. Fire-and-forget safe.
 * No PHI -- session_id is anonymous.
 */
export async function logJourneyEvent(
  event: Omit<PatientJourneyEvent, "occurred_at"> & { occurred_at?: Date },
): Promise<void> {
  const hasTable = await db.schema.hasTable("patient_journey_events");
  if (!hasTable) {
    console.warn("[PatientJourney] Table not yet created, skipping event");
    return;
  }

  await db("patient_journey_events").insert({
    org_id: event.org_id,
    event_type: event.event_type,
    source: event.source || "direct",
    session_id: event.session_id || null,
    occurred_at: event.occurred_at || new Date(),
    metadata: JSON.stringify(event.metadata || {}),
  });
}

// ─── Journey Funnel ───

/**
 * Get the conversion funnel for an org.
 * Counts events by type over the full history.
 * conversion_rate = gp_referral_forms / checkup_views (0 if no views).
 */
export async function getJourneyFunnel(orgId: number): Promise<JourneyFunnel> {
  const hasTable = await db.schema.hasTable("patient_journey_events");
  if (!hasTable) {
    return {
      checkup_views: 0,
      patientpath_visits: 0,
      gp_referral_forms: 0,
      reviews_left: 0,
      appointments_booked: 0,
      conversion_rate: 0,
    };
  }

  const counts = await db("patient_journey_events")
    .where({ org_id: orgId })
    .select("event_type")
    .count("id as count")
    .groupBy("event_type");

  const countMap: Record<string, number> = {};
  for (const row of counts) {
    countMap[row.event_type as string] = Number(row.count);
  }

  const checkupViews = countMap["checkup_viewed"] || 0;
  const patientpathVisits = countMap["patientpath_visited"] || 0;
  const gpReferralForms = countMap["gp_referral_form_submitted"] || 0;
  const reviewsLeft = countMap["review_left"] || 0;
  const appointmentsBooked = countMap["appointment_booked_via_referral"] || 0;

  return {
    checkup_views: checkupViews,
    patientpath_visits: patientpathVisits,
    gp_referral_forms: gpReferralForms,
    reviews_left: reviewsLeft,
    appointments_booked: appointmentsBooked,
    conversion_rate: checkupViews > 0
      ? Math.round((gpReferralForms / checkupViews) * 10000) / 100
      : 0,
  };
}

// ─── Funnel for Date Range ───

/**
 * Get funnel for a specific date range (e.g., last 30 days, last 365 days).
 */
export async function getJourneyFunnelForRange(
  orgId: number,
  startDate: Date,
  endDate: Date = new Date(),
): Promise<JourneyFunnel> {
  const hasTable = await db.schema.hasTable("patient_journey_events");
  if (!hasTable) {
    return {
      checkup_views: 0,
      patientpath_visits: 0,
      gp_referral_forms: 0,
      reviews_left: 0,
      appointments_booked: 0,
      conversion_rate: 0,
    };
  }

  const counts = await db("patient_journey_events")
    .where({ org_id: orgId })
    .where("occurred_at", ">=", startDate)
    .where("occurred_at", "<=", endDate)
    .select("event_type")
    .count("id as count")
    .groupBy("event_type");

  const countMap: Record<string, number> = {};
  for (const row of counts) {
    countMap[row.event_type as string] = Number(row.count);
  }

  const checkupViews = countMap["checkup_viewed"] || 0;
  const gpReferralForms = countMap["gp_referral_form_submitted"] || 0;

  return {
    checkup_views: checkupViews,
    patientpath_visits: countMap["patientpath_visited"] || 0,
    gp_referral_forms: gpReferralForms,
    reviews_left: countMap["review_left"] || 0,
    appointments_booked: countMap["appointment_booked_via_referral"] || 0,
    conversion_rate: checkupViews > 0
      ? Math.round((gpReferralForms / checkupViews) * 10000) / 100
      : 0,
  };
}
