/**
 * Card H — Customer-visible UI strings (May 4 2026).
 *
 * Single source of truth for the approved Card H strings. The settings
 * page renders these literally; the strings test runs them through
 * checkVoice to confirm AR-002 compliance (Brand Voice + Em-Dash).
 *
 * Per Card H Customer-Visible Strings Approval section. Standing
 * authorization in the playlist applies; the strings test exists to
 * catch regressions, not as a re-approval gate.
 */

export const CARD_H_STRINGS = {
  warning_no_per_location_config:
    "No location-specific routing configured. Notifications routed to practice global list. Configure routing in Settings, Locations, this location, Notifications.",
  page_title: "Notification Routing",
  section_form_submission: "Form submissions",
  section_referral_received: "Referral notifications",
  section_review_alert: "Review alerts",
  helper_text:
    "Email addresses below receive notifications for this location. Add multiple addresses separated by commas. The practice global list still receives notifications until a location-specific list is configured here.",
  bulk_copy_label: "Copy routing from another location",
  save_button: "Save",
  saved_confirmation: "Saved.",
  empty_state:
    "No addresses configured yet. Add one or more addresses below to route this notification type to this location's inbox.",
};
