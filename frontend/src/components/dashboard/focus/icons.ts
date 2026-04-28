/**
 * Domain → icon lookup table for the Focus dashboard.
 *
 * Frontend derives the icon from each TopAction's `domain` field — the agent
 * never picks an icon. This keeps the icon palette under engineering control
 * (one constant to update for design changes) and prevents the model from
 * drifting outside our supported set.
 *
 * The CSS classes (`di-review`, `di-gbp`, etc.) live in
 * `frontend/src/index.css` — they style the small tile that wraps each icon
 * in the action queue.
 *
 * Plan: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T11)
 */

import type { LucideIcon } from "lucide-react";
import {
  MessageSquare,
  MapPin,
  TrendingUp,
  Inbox,
  Database,
  UserPlus,
} from "lucide-react";

export type Domain =
  | "review"
  | "gbp"
  | "ranking"
  | "form-submission"
  | "pms-data-quality"
  | "referral";

export interface DomainIconEntry {
  Comp: LucideIcon;
  /** Tailwind/CSS class for the tile background. Defined in index.css. */
  cls: string;
}

export const DOMAIN_ICONS: Record<Domain, DomainIconEntry> = {
  review: { Comp: MessageSquare, cls: "di-review" },
  gbp: { Comp: MapPin, cls: "di-gbp" },
  ranking: { Comp: TrendingUp, cls: "di-ranking" },
  "form-submission": { Comp: Inbox, cls: "di-form" },
  "pms-data-quality": { Comp: Database, cls: "di-pms" },
  referral: { Comp: UserPlus, cls: "di-referral" },
};

/**
 * Safe lookup — returns the ranking entry as a fallback if the domain string
 * doesn't match (e.g. agent invents a new value despite the schema enum).
 */
export function getDomainIcon(domain: string): DomainIconEntry {
  return DOMAIN_ICONS[domain as Domain] ?? DOMAIN_ICONS.ranking;
}
