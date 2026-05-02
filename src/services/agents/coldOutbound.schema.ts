/**
 * Cold Outbound — types and Notion DB schema constant.
 *
 * v0 scope: dry-run only. No DB creation here, no production strings,
 * no real Practice Analyzer call, no real PatientPath build, no Mailgun,
 * no Notion writes. The schema is exported as a future provisioning
 * reference; nothing in this file triggers a write.
 */

export type Vertical = "endodontist" | "orthodontist";

/** Tier-A wedges are vertical-specific. Tier B/C are vertical-neutral. */
export type Tier = "A" | "B" | "C";

export type ConfidenceLevel = "green" | "yellow" | "red";

export type SkipReason =
  | "no_personalization_data"
  | "draft_generation_failed"
  | "human_authenticity_failed_after_retry"
  | "voice_violation"
  | "tier_assignment_conflict";

/**
 * The agency-footer signal we detect on a prospect's website. PBHS and TDO
 * are the two endodontic/orthodontic-heavy template-shop footers. "other"
 * means a footer was found but not one we recognize. null means no agency
 * signal at all.
 */
export type AgencyFooter = "PBHS" | "TDO" | "other" | null;

/**
 * GP referral pattern signal (endo-only, optional).
 * In production this comes from the Recognition Tri-Score / referral
 * inference layer. In v0 it is supplied directly on fixtures.
 */
export interface ReferralPatternSignal {
  gpName: string;
  gpPracticeName: string;
  /** Plain-English timeframe, e.g. "in February 2026" or "for 90 days". */
  timeframe: string;
  /** Conservative dollar figure, integer dollars. */
  estimatedAnnualValue: number;
}

/**
 * Practice Analyzer findings (Tier B wedge). v0: supplied on fixture.
 * Production: returned by runPracticeAnalyzer({orgGbp}).
 */
export interface AnalyzerFindings {
  /** Local-search rank for "[specialty] [city]". */
  rankPosition: number;
  /** Specialty term used in the search ("endodontist" or "orthodontist"). */
  specialty: string;
  /** Competitor occupying rank #1 (or #(rankPosition-1)). */
  competitorName: string;
  /** Competitor review-count delta. Positive = competitor has more. */
  competitorReviewDelta: number;
}

/**
 * Auto-built preview metadata (ortho Tier A wedge). v0: supplied on
 * fixture. Production: returned by runPatientPathBuild({orgGbp, prospectData}).
 */
export interface AutoBuildPreview {
  /** URL of the auto-built preview site. */
  previewUrl: string;
  /** Build timestamp (ISO). */
  builtAt: string;
}

export interface ColdOutboundProspect {
  prospectId: string;
  /** Doctor name. "Dr. Smith" form acceptable. */
  name: string;
  practiceName?: string;
  city?: string;
  state?: string;
  vertical: Vertical;

  // ── Tier-assignment signals ────────────────────────────────────────
  /** Detected website-footer agency. Drives Tier A/B eligibility. */
  pmsAgencyFooter?: AgencyFooter;
  /** 0..100. Used for ortho Tier A "auto-build" eligibility (low score = wedge fits). */
  gbpCompletenessScore?: number;
  /** Endo-only flag: do we have a GP referral pattern shift to cite? */
  hasReferralData?: boolean;
  /** Endo-only payload: referral data details (only consulted when hasReferralData=true). */
  referralData?: ReferralPatternSignal;

  // ── Wedge-specific data ────────────────────────────────────────────
  /** Tier B wedge: prebuilt analyzer findings. v0 fixture. v1+ runPracticeAnalyzer. */
  analyzerFindings?: AnalyzerFindings;
  /** Ortho Tier A: pre-built site preview. v0 fixture. v1+ runPatientPathBuild. */
  autoBuildPreview?: AutoBuildPreview;

  // ── Public-data anchors (for cross-personalization uniqueness) ─────
  gbpReviewCount?: number;
  gbpRating?: number;
  /** Distinctive practice facts (technology mentions, ABE/ABO, services). */
  practiceFacts?: string[];
}

/** Tier-A ortho fires when GBP completeness is at or below this threshold. */
export const ORTHO_TIER_A_GBP_COMPLETENESS_MAX = 60;

export interface TierAssignment {
  tier: Tier;
  reason: string;
  /** Set when the originally-requested tier fell back. */
  fallbackFrom?: Tier;
}

export interface ColdOutboundDraft {
  prospectId: string;
  vertical: Vertical;
  touchNumber: 1 | 2 | 3 | 4;
  tier: Tier;
  tierAssignment: TierAssignment;
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
  /** Audit trail of the stubs/services consulted on this draft. */
  stubsCalled: ("runPracticeAnalyzer" | "runPatientPathBuild")[];
}

export interface SkippedProspect {
  prospectId: string;
  reason: SkipReason;
  detail?: string;
}

export interface ColdOutboundRunSummary {
  drafted: number;
  skipped: number;
  green: number;
  yellow: number;
  red: number;
  byTier: { A: number; B: number; C: number };
  fallbacks: number;
}

/**
 * Notion database schema for the "Cold Outbound Draft Inbox" — exported
 * as a constant only. NOT created here. Provisioning is a future
 * authorized step. Same schema as AAE Nurture Draft Inbox plus a
 * Source filter so Jo's morning routine can split by source.
 */
export const COLD_OUTBOUND_INBOX_SCHEMA = {
  databaseName: "Cold Outbound Draft Inbox",
  properties: {
    Title: { type: "title" },
    Prospect: { type: "rich_text" },
    Source: { type: "select", options: ["cold_outbound"] },
    Vertical: { type: "select", options: ["endodontist", "orthodontist"] },
    Tier: { type: "select", options: ["A", "B", "C"] },
    "Touch Number": { type: "select", options: ["1", "2", "3", "4"] },
    "Subject Line": { type: "rich_text" },
    Body: { type: "rich_text" },
    "Personalization Source": { type: "rich_text" },
    Confidence: { type: "select", options: ["green", "yellow", "red"] },
    "Send Status": {
      type: "select",
      options: [
        "Draft",
        "Corey Voice Review",
        "Jo Reviewed",
        "Approved",
        "Sent",
        "Rejected",
      ],
    },
    "Approved By": { type: "people" },
    "Sent At": { type: "date" },
    "Reply Received": { type: "checkbox" },
    "Reply Notes": { type: "rich_text" },
  },
} as const;
