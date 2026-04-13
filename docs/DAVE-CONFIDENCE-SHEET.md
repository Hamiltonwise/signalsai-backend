# Sandbox Confidence Sheet -- For Dave's Review

**Date:** April 12, 2026
**Branch:** sandbox (764 commits ahead of main)
**Frontend TypeScript:** CLEAN (zero errors)
**Last pattern audit:** Commits d4b0044f + 1fe758a1 (30 files aligned)

---

## Dave's Three Gates

### Gate 1: Design Consistent, Not Sloppy?

YES. Enforced globally:

- Min font: `text-xs` (12px). No `text-[10px]` or `text-[11px]` anywhere.
- Max weight: `font-semibold`. No `font-black` or `font-extrabold`.
- Text color: `#1A1D23`. `#212D40` used only for background fills (admin nav, sidebar) per design system -- never as text color.
- Tailwind CSS only. No inline styles except Leaflet map containers.
- shadcn/ui components for all form elements, modals, cards.
- No fabricated content. All dashboard data queries live database tables.

### Gate 2: Features and APIs Not Disrupted?

YES. Existing endpoints preserved:

- **48 existing route files modified.** Most changes are additive (JSDoc headers, extra endpoints appended). No existing endpoint signatures changed.
- **checkup.ts** is the largest change (+1,150 lines): new conference mode, QR flow, ClearPath builder. All original endpoints untouched -- new routes appended below existing ones.
- **billing.ts** adds subscription management endpoints. Original webhook handler unchanged.
- **73 new route files added.** All behind `authenticateToken` + `superAdminMiddleware` or public rate limiters matching existing patterns.
- **69 new migrations.** 50 are pure additive (CREATE TABLE, ADD COLUMN, seed data). 7 require manual review -- see `docs/SANDBOX-INVENTORY.md` "REQUIRES REVIEW" section. 2 contain hardcoded sandbox passwords (do not run on production).

### Gate 3: Output Code Consistent with Existing Codebase?

YES. Pattern audit completed April 12, 2026 (30 files fixed in 2 commits):

| Pattern | Main Branch | Sandbox Status |
|---------|------------|----------------|
| `{ success: boolean }` on every JSON response | Yes | **Yes** -- all routes |
| `[Tag]` prefix on console.error/log/warn | Yes | **Yes** -- 0 untagged statements |
| JSDoc purpose block at top of route files | Yes | **Yes** -- 73/73 new files |
| `export default router` (not module.exports) | Yes | **Yes** -- all routes |
| Knex query builder (not raw SQL strings) | Yes | **Yes** -- `db.raw()` only used inside Knex chains for PostgreSQL functions (gen_random_uuid, NOW(), COUNT). No standalone SQL strings. |
| ENV vars for URLs (not hardcoded localhost) | Yes | **Yes** -- `API_BASE_URL` fallback pattern on all internal HTTP calls |

**Known pattern difference (intentional, not a defect):**
New route files use a compact format (JSDoc header + routes + export) instead of `// ===` section dividers. Both are valid. Section dividers are better for large files (tasks.ts, checkup.ts). Compact format is intentional for smaller single-purpose route files.

---

## What Dave Needs to Do (Infrastructure Only)

These are the only items that require Dave's hands:

| Item | Blast Radius | Estimated Time |
|------|-------------|----------------|
| Set `SENTRY_DSN` env var on EC2 | Green | 5 min |
| Set `SLACK_WEBHOOK_URL` GitHub secret | Green | 5 min |
| Set `APP_URL` env var on EC2 (Card 4) | Green | 5 min |
| GBP OAuth callback URL update (Card 8) | Yellow | 15 min |
| Rotate Google Places API key | Yellow | 15 min |
| Cherry-pick sandbox onto main | Red | See Migration Manifest |

Everything else is built and deployed on sandbox already.

---

## What's NOT in This Merge

Explicitly excluded to reduce blast radius:

- 58-agent system (backlogged, not a card)
- PatientPath build pipeline (post-AAE)
- SMS review requests (needs Twilio creds)
- alloro.site subdomain (post-AAE)
- n8n Monday email webhook (post-AAE)

---

## Quick Reference

- **Migration Manifest:** 13 cards, ordered simplest-first, in #alloro-dev
- **Card 1:** Green, frontend-only, ~15 minutes
- **Cards 1-6:** Green blast radius, no DB/auth/billing changes
- **Cards 7-11:** Yellow, new services + migrations, notify #alloro-dev then deploy
- **Card 12:** Red (Trial + Billing Gate), requires Corey approval + Dave conversation
- **Card 13:** Yellow (Agent Canon + Identity System), backlog item
- **AAE conference:** April 15-18. Conference mode runs on sandbox with fallback data. No prod deploy needed for AAE.

---

*This sheet answers Dave's three validation criteria directly. For the full card-by-card migration plan, see the Migration Manifest in #alloro-dev.*
