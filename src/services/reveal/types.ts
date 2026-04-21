/**
 * Card 4: Reveal Choreography types.
 */

export type RevealMode = "dry_run" | "live";

export interface RevealInput {
  orgId: number;
  sitePublishedEventId?: string | null;
  /**
   * When true, forces dry-run even if the org flag is on. Used by tests and
   * ad-hoc admin triggers that should not mutate external systems.
   */
  forceDryRun?: boolean;
}

export interface OrgRevealContext {
  id: number;
  name: string;
  siteUrl: string | null;
  shortSiteUrl: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  practiceAddress: PracticeAddress | null;
  flagEnabled: boolean;
  createdAt: Date | string | null;
  vertical: string | null;
  hasGbpData: boolean;
  hasCheckupData: boolean;
}

export interface PracticeAddress {
  line1: string;
  city: string;
  state: string;
  zip: string;
  valid: boolean;
  reason?: string;
}

export interface ComposedEmail {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  voiceCheck: VoiceCheckResult;
}

export interface ComposedLobPostcard {
  to: {
    name: string;
    address_line1: string;
    address_city: string;
    address_state: string;
    address_zip: string;
  };
  front: string;
  back: string;
  description: string;
  size: string;
  addressValid: boolean;
}

export interface ComposedDashboardTiles {
  tiles: DashboardTile[];
}

export interface DashboardTile {
  id: string;
  kind: "reveal_hero" | "reveal_competitor_context" | "reveal_impact_window";
  title: string;
  body: string;
  cta?: { label: string; href: string } | null;
  renderOrder: number;
}

export interface VoiceCheckResult {
  passed: boolean;
  violations: string[];
  recipeCompliance: {
    hasFinding: boolean;
    hasDollarOrGap: boolean;
    hasAction: boolean;
    complete: boolean;
  };
}

export interface RevealResult {
  mode: RevealMode;
  idempotent: boolean; // true when we skipped because a reveal already existed
  logId: string | null;
  composed: {
    email: ComposedEmail;
    lob: ComposedLobPostcard;
    dashboard: ComposedDashboardTiles;
  } | null;
  fanOut: {
    emailSentAt: Date | null;
    emailMessageId: string | null;
    lobSentAt: Date | null;
    lobPostcardId: string | null;
    dashboardRenderedAt: Date | null;
  };
  error?: string;
}
