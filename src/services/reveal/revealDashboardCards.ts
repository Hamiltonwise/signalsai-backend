import type { ImpactEstimate } from "../economic/economicCalc";
import type {
  ComposedDashboardTiles,
  DashboardTile,
  OrgRevealContext,
} from "./types";
import { APP_URL } from "../../emails/templates/base";

/**
 * Card 4: dashboard reveal tile generator.
 *
 * Produces the tiles that render on the owner's next dashboard login:
 *   1. Hero tile: site-is-live anchor.
 *   2. Competitor context: why your site was benchmarked, not who lost.
 *   3. Impact window: 30-day expected lift framed with confidence caveat.
 *
 * In dry-run the tiles are composed and archived to reveal_log.composed_payload
 * but NOT written to any owner-facing surface. Live-mode persists to the
 * dashboard_tiles row on the next render (the render path reads reveal_log
 * once the flag is on).
 */

function usd(cents: number | null): string | null {
  if (cents == null) return null;
  if (cents >= 1000) return `$${Math.round(cents / 1000)}k`;
  return `$${Math.round(cents)}`;
}

export function composeRevealTiles(
  org: OrgRevealContext,
  impact: ImpactEstimate | null
): ComposedDashboardTiles {
  const href = org.siteUrl ?? `${APP_URL}/dashboard`;

  const heroTile: DashboardTile = {
    id: `reveal_hero_${org.id}`,
    kind: "reveal_hero",
    title: "Your practice home is ready.",
    body: "Seven pages, written in your voice. Built while you worked.",
    cta: { label: "View your site", href },
    renderOrder: 1,
  };

  const competitorTile: DashboardTile = {
    id: `reveal_competitors_${org.id}`,
    kind: "reveal_competitor_context",
    title: "Benchmarked against the three practices patients compare you to.",
    body:
      "We looked at who your patients check before they pick. Your pages are written to hold their attention against those three, not against the open internet.",
    cta: null,
    renderOrder: 2,
  };

  let impactBody: string;
  if (impact && impact.dollar30d != null && impact.dollar365d != null) {
    impactBody = `Category-benchmark lift near ${usd(impact.dollar30d)} in the first thirty days and ${usd(impact.dollar365d)} year-one. Conservative read, not a promise.`;
  } else {
    const gap = impact?.dataGapReason ?? "full signal not connected yet";
    impactBody = `Year-one impact window will sharpen once your patient and referral data is connected (${gap}). For now, the site earns the room to breathe.`;
  }

  const impactTile: DashboardTile = {
    id: `reveal_impact_${org.id}`,
    kind: "reveal_impact_window",
    title: "30-day impact window",
    body: impactBody,
    cta: null,
    renderOrder: 3,
  };

  return { tiles: [heroTile, competitorTile, impactTile] };
}

export interface RenderRevealTilesResult {
  rendered: boolean;
  renderedAt: Date | null;
  skipped?: "dry_run";
}

/**
 * Render-intent marker. In live mode the dashboard tiles are marked "ready";
 * the actual owner-visible surface reads reveal_log composed_payload.tiles
 * at next login. In dry-run we only compose (no render marker).
 */
export async function renderRevealTiles(
  _org: OrgRevealContext,
  _tiles: ComposedDashboardTiles,
  mode: "dry_run" | "live"
): Promise<RenderRevealTilesResult> {
  if (mode === "dry_run") {
    return { rendered: false, renderedAt: null, skipped: "dry_run" };
  }
  // In live mode, marking rendered is sufficient — the owner dashboard reads
  // composed_payload.tiles from reveal_log when present. No separate write
  // path needed (keeps the fan-out idempotent and repo-shaped).
  return { rendered: true, renderedAt: new Date() };
}
