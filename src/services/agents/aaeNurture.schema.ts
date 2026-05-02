/**
 * AAE Nurture — types and Notion DB schema constant.
 *
 * v1 scope: dry-run only. No DB creation here. The schema is exported
 * so a later one-time provisioning step can read it; nothing in this
 * file triggers a write.
 */

export type AaeSegment =
  | "professional_us"
  | "future_practice_owners"
  | "dsos"
  | "international";

export type ConfidenceLevel = "green" | "yellow" | "red";
export type SkipReason =
  | "no_personalization_data"
  | "draft_generation_failed"
  | "human_authenticity_failed_after_retry"
  | "voice_violation";

export interface AaeAttendee {
  attendeeId: string;
  name: string;
  practiceName?: string;
  city?: string;
  state?: string;
  segment: AaeSegment;
  conversationDate?: string;
  boothNotes?: string;
  vertical?: "endodontics" | "orthodontics" | "general_dentistry" | "other";
  /** Optional pre-existing diagnostic facts about the attendee that don't come from booth notes. */
  practiceFacts?: string[];
}

export interface NurtureDraft {
  attendeeId: string;
  touchNumber: 1 | 2 | 3 | 4;
  subject: string;
  body: string;
  personalizationElements: string[];
  personalizationSources: string[];
  confidence: ConfidenceLevel;
  confidenceReasons: string[];
  gates: {
    humanAuthenticity: { passed: boolean; score: number; flags: string[]; retried: boolean };
    voice: { passed: boolean; violations: string[]; warnings: string[] };
    readability: {
      passed: boolean;
      issues: string[];
      source: "haiku" | "skipped_no_api_key" | "skipped_error" | "stub";
    };
    crossPersonalization: { uniqueElementCount: number; sharedElements: string[] };
  };
  generatedBy: "sonnet" | "opus_fallback" | "template_fallback";
}

export interface SkippedAttendee {
  attendeeId: string;
  reason: SkipReason;
  detail?: string;
}

export interface NurtureRunSummary {
  drafted: number;
  skipped: number;
  jo_review_required: number;
  green: number;
  yellow: number;
}

/**
 * Notion database schema for the "AAE Nurture Draft Inbox" — exported as a
 * constant only. NOT created here. Provisioning is a separate authorized step.
 */
export const AAE_NURTURE_INBOX_SCHEMA = {
  databaseName: "AAE Nurture Draft Inbox",
  properties: {
    Title: { type: "title" },
    Attendee: { type: "relation", relatedDatabase: "Contacts" },
    "Touch Number": {
      type: "select",
      options: ["1", "2", "3", "4"],
    },
    "Subject Line": { type: "rich_text" },
    Body: { type: "rich_text" },
    "Personalization Source": { type: "rich_text" },
    Confidence: {
      type: "select",
      options: ["green", "yellow", "red"],
    },
    "Send Status": {
      type: "select",
      options: ["Draft", "Jo Reviewed", "Approved", "Sent", "Rejected"],
    },
    "Approved By": { type: "people" },
    "Sent At": { type: "date" },
    "Reply Received": { type: "checkbox" },
    "Reply Notes": { type: "rich_text" },
  },
} as const;
