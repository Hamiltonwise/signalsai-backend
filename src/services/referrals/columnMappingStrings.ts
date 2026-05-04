/**
 * Card E (May 4 2026, re-scoped) — Approved customer-visible strings for the
 * referral column mapping confirmation modal, adjusted to the 7-field schema
 * shipped April 24 (single patient field, no first/last split).
 *
 * Centralizing the strings here lets the voice-constraints test gate them
 * before the React component renders. If any string fails Brand Voice or
 * Em-Dash validators, the playlist's Standing Approvals direct CC to
 * report rather than silently rewrite.
 */

export const CARD_E_STRINGS = {
  // Title rendered when a {practice_display_name} is available.
  modal_title: "Confirm referral column mapping",
  modal_title_with_practice: (practiceName: string): string =>
    `Confirm referral column mapping for ${practiceName}`,

  // Helper shown on first-time confirmation (no prior mapping stored).
  helper_first_time: (n: number, practiceName: string): string =>
    `Alloro detected ${n} columns in your upload. Suggested mapping shown below. Adjust any field that doesn't match, then confirm. This mapping is saved for future uploads from ${practiceName}.`,

  // Helper shown on re-confirmation (header structure changed since last upload).
  helper_re_confirmation: (
    practiceName: string,
    previousColumnCount: number,
    currentColumnCount: number,
  ): string =>
    `Your last upload for ${practiceName} had ${previousColumnCount} columns. This upload has ${currentColumnCount} columns. Confirm the new column mapping below before Alloro ingests this data.`,

  // Notification surfaced after the retroactive cleanup script runs.
  retroactive_cleanup_notification: (rowsRewritten: number): string =>
    `Alloro re-processed your historical referral data using the new column mapping. ${rowsRewritten} rows were re-attributed to correct source values. Review the updated referral hub at /referrals.`,

  // 7 canonical roles + their human-readable labels (kept aligned with
  // referralColumnMapping.ts MappingTarget union).
  role_label_source: "Referral source",
  role_label_date: "Date",
  role_label_amount: "Amount",
  role_label_count: "Referral count",
  role_label_patient: "Patient",
  role_label_procedure: "Procedure",
  role_label_provider: "Provider",

  // Per-role description shown beneath the dropdown.
  role_desc_source: "Who sent the patient (a person, practice, or campaign).",
  role_desc_date: "When the visit or referral happened.",
  role_desc_amount: "Production, revenue, or fee per row.",
  role_desc_count: "Number of referrals if the row aggregates.",
  role_desc_patient: "Patient or client name or ID, used for deduplication.",
  role_desc_procedure: "Procedure or service code.",
  role_desc_provider: "Treating doctor or provider.",

  // Buttons.
  save_button: "Looks right, ingest",
  cancel_button: "Cancel",

  // Inline validation when source role is unmapped.
  validation_source_required:
    "Pick the column that names the referrer before confirming.",
};
