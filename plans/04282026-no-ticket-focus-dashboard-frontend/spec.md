---
id: spec-focus-dashboard-frontend
created: 2026-04-28
ticket: no-ticket
mode: --start
status: planning
depends_on: plans/04282026-no-ticket-monthly-agents-v2-backend
---

# Focus Dashboard — Frontend Redesign

## Why
The current `/dashboard` route renders `DashboardOverview.tsx` (~1700 lines) — an unfocused mix of metric cards, banners, callouts, and partial AI outputs that doesn't communicate a clear monthly priority. The dashboard layout depends on a left sidebar (`Sidebar.tsx`) shared across all authenticated pages. The hi-fi design at `~/Desktop/another-design/project/Focus Dashboard.html` (with supporting JSX components) replaces both: a top-bar nav (sidebar gone globally), a single dominant Hero card surfacing Summary v2's `top_actions[0]`, a Trajectory + Action Queue row, and three product cards (Website / Local Ranking / PMS) that surface real grounded metrics with month-over-month context. Plan 1 (Backend) ships the data the redesign requires (`top_actions`, `dashboard_metrics`, `form-submissions/timeseries`, `practice-ranking/history`). This plan ships the visual.

## What
A frontend rebuild that:

1. Replaces the global sidebar with a top-bar nav across all authenticated pages. Other pages keep their inner content design.
2. Replaces `DashboardOverview.tsx` with a new composition: Hero (Summary's `top_actions[0]`) → Trajectory + Action Queue row → Website + Local Ranking + PMS cards row.
3. Adopts the design's typography: Fraunces (display), Inter (body), JetBrains Mono (numerics) — additive to existing fonts.
4. Adds a `mark.hl` CSS class (light + dark variants) for inline emphasis. Used by Hero, Trajectory, and (existing) onboarding wizard.
5. Wires the redesign to the new backend endpoints (`/api/dashboard/metrics`, `/api/user/website/form-submissions/timeseries`, `/api/practice-ranking/history`) and the new `tasks.metadata` shape carrying `top_actions[i]`.
6. Surfaces setup-progress incompleteness as a thin banner above the hero (only when org is incomplete) — replaces the legacy alert bar pattern.
7. Retains the Proofline "Read full explanation →" modal pattern.
8. Updates the onboarding wizard `wizard-highlight` outline to use brand orange `#D66853` (currently uses `rgb(255, 138, 61)` — off-brand).
9. Preserves `MobileBottomNav.tsx` for the mobile breakpoint; TopBar collapses to a brand + avatar + hamburger on mobile.
10. Removes per-page sidebar dependencies. Sidebar component preserved on disk for revert path.

**Done when:**
- TopBar renders on all authenticated pages (Dashboard, Settings, Help, Notifications, DFY Website). Sidebar no longer mounted.
- On dashboard routes (`/dashboard`, `/patientJourneyInsights`, `/pmsStatistics`, `/rankings`, `/tasks`, `/referralEngine`-equiv), the active tab is highlighted in TopBar.
- On non-dashboard routes (Settings, Help, Notifications, DFY Website), TopBar shows but no tab is highlighted.
- Dashboard route renders the new layout: TopBar → Ticker → Focus header → Hero → Trajectory + Queue → 3 product cards.
- Hero pulls from `tasks` table where `agent_type='SUMMARY' AND priority_score=max`. Renders title, urgency, domain pill, rationale (with `<mark class="hl">` for `metadata.highlights[]`), 3 supporting metrics, outcome.deliverables (bold green) + outcome.mechanism, primary/secondary CTAs, due_at.
- Trajectory pulls from `agents.proofline.results[0]`, renders salutation + body with `<mark class="hl">` for `highlights[]`, "Read full explanation →" link opens existing modal pattern, 3 mini-stats with trend indicators.
- Action Queue pulls remaining tasks from `/api/tasks`, renders 3-5 rows each with domain icon (lucide-react via `DOMAIN_ICONS` map), title, urgency, due, agent-pill, chevron.
- Website card pulls from existing form-submissions stats + new timeseries endpoint. Renders verified-leads count, MoM trend, 12-month sparkline, secondary stats, "Coming soon: Rybbit" annotation.
- Local Ranking card pulls from existing latest endpoint + new history endpoint. Renders rank position headline, MoM trend, two factor sub-sections (Google Search, Practice Health) each with 4 weighted bars + sub-score, lowest-factor annotation.
- PMS Summary card pulls from existing keyData. Renders production headline, MoM trend, 12-month sparkline, referral mix bar, top-3 sources list.
- Onboarding wizard's `wizard-highlight` outline uses `#D66853` (brand) instead of the off-brand orange.
- Setup-progress banner appears above the hero only when org is incomplete.
- TypeScript check passes both frontend and backend.
- Visual smoke confirms hero looks like the design at 1320px desktop width; mobile (<lg) still works without sidebar; MobileBottomNav functional.

## Context

**Files modified or read:**

Layout shell:
- `frontend/src/components/PageWrapper.tsx:15-149` — currently renders `<Sidebar>` at line 87. Replaces with `<TopBar>` and (on dashboard routes) `<Ticker>`. Mobile header (line 46) absorbed into the new TopBar's mobile variant.
- `frontend/src/components/Sidebar.tsx` — preserved, no longer rendered. Comment at top noting deprecation + plan reference.
- `frontend/src/components/MobileBottomNav.tsx:35-76` — preserved as-is.

Dashboard:
- `frontend/src/pages/Dashboard.tsx:28-445` — tab logic and dispatch unchanged. Internal "Dashboard" tab renders the new `<DashboardOverview>` (rewritten).
- `frontend/src/components/dashboard/DashboardOverview.tsx:138-1710` — full rewrite. Drops 1500+ lines of legacy sections; new file composes the new card components. Length target: ~250 lines (composition only).

Existing API clients (consumed):
- `frontend/src/api/pms.ts:542-553` — `fetchPmsKeyData` (existing, unchanged).
- `frontend/src/api/tasks.ts:15-25` — `fetchClientTasks` (existing, unchanged in shape; new metadata fields on rows).
- `frontend/src/hooks/useAgentData.ts:8-22` — `useAgentData` (existing; provides Proofline + legacy Summary; legacy Summary fields ignored, only Proofline used by new layout).
- `frontend/src/api/index.ts` — generic `apiGet` (existing).

New API clients:
- `frontend/src/api/dashboardMetrics.ts` (NEW) — `fetchDashboardMetrics(orgId, locationId)` → `DashboardMetrics`.
- `frontend/src/api/formSubmissionsTimeseries.ts` (NEW) — wraps `/timeseries`.
- `frontend/src/api/rankingHistory.ts` (NEW) — wraps `/history`.

Onboarding wizard:
- `frontend/src/components/onboarding-wizard/SpotlightOverlay.tsx:170-202` — `wizard-highlight` CSS injected via `<style>` block. Update orange RGB from `rgb(255, 138, 61)` to brand orange.

Index / styling:
- `frontend/index.html` — add Google Fonts links for Fraunces, Inter, JetBrains Mono (alongside existing Plus Jakarta Sans + Literata).
- `frontend/src/index.css:206-250` — additive: `mark.hl` class (light + dark variants), `--font-display`, `--font-mono` CSS vars wired to the new fonts. Existing Tailwind theme tokens unchanged (`--color-alloro-orange: #D66853` reused everywhere).

New components (all under `frontend/src/components/`):
- `layout/TopBar.tsx` — brand · tabs · location selector · refresh · live indicator · avatar · mobile hamburger.
- `layout/Ticker.tsx` — today strip with 3 ambient signals + refresh timestamp. Renders only on dashboard routes.
- `dashboard/focus/Hero.tsx` — Summary's `top_actions[0]` rendering.
- `dashboard/focus/Trajectory.tsx` — Proofline's narrative + mini stats + Read-full-explanation modal trigger.
- `dashboard/focus/ActionQueue.tsx` — remaining `top_actions[1..n]` + RE ALLORO tasks.
- `dashboard/focus/WebsiteCard.tsx` — form-submissions stats + 12mo timeseries sparkline.
- `dashboard/focus/LocalRankingCard.tsx` — rank position + factor split (Google Search / Practice Health).
- `dashboard/focus/PMSCard.tsx` — production + mix + top-3 sources + 12mo sparkline.
- `dashboard/focus/HighlightedText.tsx` — deterministic substring → `<mark class="hl">` wrapper. Pure-text operations; no raw-HTML injection.
- `dashboard/focus/Sparkline.tsx` — area + line + last-point dot SVG component.
- `dashboard/focus/FactorBar.tsx` — labeled horizontal progress bar with score and color tier.
- `dashboard/focus/SetupProgressBanner.tsx` — thin banner above hero when org isn't complete.
- `dashboard/focus/ProoflineModal.tsx` — extracted from existing DashboardOverview, retained in new flow.
- `dashboard/focus/icons.ts` — `DOMAIN_ICONS` lookup map keyed by domain enum, returning `{ Comp: LucideIcon, cls: string }`.

**Patterns to follow:**

- **Tailwind utility-first**: project standard. No CSS modules, no styled-components. Inline classNames; design tokens from `index.css` variables.
- **Lucide icons**: already installed (`lucide-react@0.541.0`). Direct imports per icon.
- **TanStack React Query**: existing pattern. New API clients ship with corresponding `useQuery` hooks (in `frontend/src/hooks/queries/`).
- **`apiGet` from `src/api/index.ts`**: standard fetch wrapper. New API clients use it for consistency.
- **framer-motion**: already installed; use for the existing modal patterns (Proofline modal stays as-is).
- **react-hot-toast**: already installed; not introduced new but kept for any inline interaction feedback.
- **Component file structure**: one component per file. Display name = filename (PascalCase). Props interface above component, named `<ComponentName>Props`.

**Reference files (closest analogs):**
- `~/Desktop/another-design/project/Focus Dashboard.html` — pixel-level visual reference (do not literally render in browser; read CSS directly).
- `~/Desktop/another-design/project/cards.jsx` — component structure reference (Hero/Trajectory/ActionQueue/Website/LocalRanking/PMS shapes are mocked here in JSX).
- `~/Desktop/another-design/project/parts.jsx` — `HighlightedText`, `Sparkline`, `FactorBar`, `Trend` reference implementations.
- `~/Desktop/another-design/project/icons.jsx` — `DOMAIN_ICONS` lookup map; we'll port to lucide-react proper.
- `~/Desktop/another-design/project/data.jsx` — example data shapes (note: scenario data is illustrative; real data shapes come from Plan 1's Zod).
- `frontend/src/components/PMS/ColumnMappingDrawer.tsx` — recent example of a complex Tailwind-styled component matching our project conventions.
- `frontend/src/components/dashboard/DashboardOverview.tsx:1604-1651` — existing Proofline modal markup; extract verbatim into `ProoflineModal.tsx`.

## Constraints

**Must:**
- Wait until Plan 1 (`plans/04282026-no-ticket-monthly-agents-v2-backend/spec.md`) is fully executed and verified before this plan starts. The new layout has no fallback shape for the legacy Summary output.
- Use existing brand orange token `--color-alloro-orange: #D66853` everywhere. Do not introduce a new orange.
- Adopt new fonts (Fraunces, Inter, JetBrains Mono) via Google Fonts. Existing Plus Jakarta Sans + Literata remain loaded for non-dashboard pages and any inherited components.
- Use existing color tokens defined in `frontend/src/index.css:206-250`. The redesign's `--bg`, `--card`, etc. names map to existing Alloro tokens — do not introduce duplicate tokens.
- Replace the sidebar with the TopBar in `PageWrapper.tsx` such that ALL pages wrapped in `ProtectedLayout` use the new top-bar layout. Sidebar component itself stays on disk; just unmounted.
- TopBar must work on all authenticated pages even when no tab is "active" (Settings, Help, Notifications, DFY Website). Visual: brand + tabs (none highlighted) + right cluster.
- Mobile (<lg breakpoint): TopBar shows brand + avatar + hamburger. Tabs collapse into a drawer or accordion opened by the hamburger. `MobileBottomNav` continues to render.
- Dashboard reads from `/api/tasks` for Hero + Queue. Hero = the single SUMMARY-authored task with the highest `metadata.priority_score`. Queue = remaining SUMMARY tasks (sorted desc by priority_score) interleaved with RE ALLORO tasks.
- Hero, Trajectory, and queue items render `<mark class="hl">` only via `HighlightedText` deterministic substring wrap. Pure-text operations: no raw-HTML injection from agent output anywhere in the new code.
- Wizard `wizard-highlight` outline color updates to brand orange (or its rgba equivalents at the same alpha levels: `rgba(214, 104, 83, 0.9)`, etc.). The pulse animation pattern stays.
- Setup-progress banner uses the existing onboarding-completion check from the auth flow. Render only when `isOnboardingComplete === false`.
- All cards have explicit loading, error, and empty states. Loading: skeleton or muted shimmer. Error: small inline message + retry button. Empty: doctor-readable hint.
- Keep all routes and route-to-tab mappings as they exist today (`Dashboard.tsx:67-75`).

**Must not:**
- Touch backend code. Plan 1 is the backend plan.
- Introduce a new state-management library. Existing TanStack Query + React state suffices.
- Modify `Sidebar.tsx` source (other than adding the deprecation comment). Preserve for revert.
- Modify routes in `App.tsx` beyond the layout-related changes (no route additions, no route removals — Plan 1 added new endpoints; this plan consumes them).
- Introduce CSS-in-JS, CSS modules, or new styling primitives. Tailwind + index.css vars only.
- Remove `MobileBottomNav.tsx` or its rendering logic.
- Hardcode Summary v2 data into the dashboard for testing. All data comes from real backend endpoints (Plan 1 shipped them).
- Rebrand or change `--color-alloro-orange` value from `#D66853`.
- Inject raw HTML strings derived from agent output anywhere. The `HighlightedText` helper performs pure-text splits and wraps; no HTML strings flow from agent output to the DOM. (See risk #8.)

**Out of scope:**
- Mobile-first redesign of the new layout. Mobile is "works, doesn't crash". Polished mobile is a follow-up plan.
- Touch device interaction patterns (hover-only affordances are kept).
- Accessibility full audit — basic keyboard + focus rings included; full WCAG audit deferred.
- Dark mode (entire app stays light unless inside Hero card which is intrinsically dark).
- Animation polish beyond what's in the design CSS (subtle pulse, sparkline transition). No new motion sequences.
- Per-card configuration (which factors to show, etc.). Static for v1.
- `pms-data-quality` domain rendering on the hero — supported in schema but no specific UX beyond the generic template. If it surfaces, default styling kicks in.
- Multi-location aware chrome on TopBar beyond the existing location selector pattern.
- Refresh-button interaction beyond what already exists in `DashboardOverview.tsx:899` `handleRefresh()`. The new TopBar's refresh icon dispatches the same handler.
- Settings page header changes. The page keeps its own internal header; just gains the global TopBar above.

## Risk

**Level:** 3 (Structural Risk — global layout shell change, removes a top-level navigation primitive used by every authenticated user)

**Risks identified:**

1. **Removing the sidebar is a one-way visual change.** Every existing user sees a different app on next load. → **Mitigation:** Sidebar component preserved on disk. Revert path: revert `PageWrapper.tsx` to the prior commit. No data lost.

2. **Other pages depend on layout dimensions assumed by the sidebar.** Settings / Help / Notifications / DFY Website were designed for content area shifted right by ~288px (sidebar width). With TopBar on top, content reflows to full width. → **Mitigation:** Smoke-test each non-dashboard page during T23 verification. If a page looks broken, scope minimal `max-w-` constraint per page (out-of-scope for this plan; raise as Rev item).

3. **Plan 1 must land first.** Hero + Queue render nothing without `top_actions` data shape. → **Mitigation:** Plan dependency declared in frontmatter; verify via `git log --oneline | grep monthly-agents-v2-backend` before starting Plan 2.

4. **New fonts add ~150KB initial page weight.** Google Fonts loaded synchronously delays first paint. → **Mitigation:** Use `font-display: swap` on all three families. Load Fraunces only at the weights actually used (400, 500, 600). Inter at 400/500/600/700 only.

5. **Wizard's `wizard-highlight` orange change may not match all wizard steps' visual contexts.** Steps that highlight against light cards work; steps that highlight against dark hero background may look subdued at the new orange. → **Mitigation:** Walk each wizard step on the new layout during T23 smoke. Adjust outline alpha if needed.

6. **TanStack Query cache invalidation on the new endpoints.** When the user refreshes (existing button), all 6 fetches must invalidate together. → **Mitigation:** Keep existing `handleRefresh()` pattern from `DashboardOverview.tsx:656-669`; extend the `queryClient.invalidateQueries` call to cover the new query keys.

7. **`top_actions[0]` may not exist** on a fresh org with no monthly run yet. Hero renders empty. → **Mitigation:** Empty state for Hero: "Your first monthly priority will appear once your data finishes processing." Plus the setup-progress banner above the hero acting as the placeholder action.

8. **Highlight-substring matching is locale-sensitive.** If the agent outputs "Three" but the rationale rendered with escaped HTML entities, the regex match fails. → **Mitigation:** `HighlightedText` operates on pure text only (text → split by regex → wrap matches in `<mark className="hl">`). It never accepts or emits raw HTML. If a phrase doesn't match, it's silently dropped with a logged warning. Reference implementation in `~/Desktop/another-design/project/parts.jsx:4-19`.

9. **`MobileBottomNav` and the new TopBar both visible on mobile.** Without a dedicated breakpoint check, mobile gets two navs. → **Mitigation:** TopBar collapses to brand + hamburger on mobile (no tabs visible). Hamburger drawer shows the same tab list. MobileBottomNav remains as the primary mobile nav. Acceptable redundancy until full mobile redesign.

10. **Existing routes' rendering relies on Sidebar's `selectedLocation` interaction.** Sidebar exposes location switching via `useLocationContext`. New TopBar must wire the same context. → **Mitigation:** TopBar's location selector consumes `useLocationContext()` exactly as Sidebar does. Verified during T4.

**Blast radius:**
- Frontend code: ~16 files modified or created (PageWrapper, Sidebar comment, DashboardOverview rewrite, 13 new components, 3 new API clients, index.html font links, index.css additions, wizard CSS update).
- Layout: every authenticated page sees a new top-of-page chrome. Inner content of non-dashboard pages unchanged.
- API contracts: zero changes (only consumes Plan 1's new endpoints).
- Database: zero changes.
- LLM behavior: zero changes.

**Pushback:**
- This is a much bigger UX change than the previous frontend work in this branch. Recommend a feature flag or staged rollout for the layout shell change — even though this codebase generally avoids feature flags, the global sidebar→top-bar swap warrants a kill switch. Minimal: an env-flag `VITE_USE_TOPBAR_LAYOUT` defaulting to true, that PageWrapper checks. If something breaks for a real user, flip the flag and revert visually. Tracked as Rev item if not adopted.
- The non-dashboard pages may need light adjustments to look right under the new chrome (different top spacing, narrower content). Keeping those in this plan would explode scope; recommend deferring to a future plan if smoke reveals issues.

## Decisions

**D1. TopBar replaces Sidebar globally in `PageWrapper.tsx`.** All authenticated pages use the new layout. Sidebar component preserved on disk.

**D2. TopBar is consistent across pages.** Tabs always visible; only highlighted when on a dashboard route. Settings/Help/etc. show TopBar but no active tab.

**D3. Mobile keeps MobileBottomNav.** TopBar on mobile shows brand + avatar + hamburger only. Hamburger drawer = tabs. Acceptable redundancy with bottom nav until mobile redesign.

**D4. New components live in `frontend/src/components/dashboard/focus/` (focus subfolder).** Layout primitives in `frontend/src/components/layout/`. Each component one file; PascalCase filename = component name.

**D5. Hero + Queue read from `/api/tasks`.** No new endpoint. Frontend filters by `agent_type='SUMMARY'`, sorts by `metadata.priority_score desc`, slices [0] = hero, [1..n] = queue. RE ALLORO tasks merge into the queue with their own ordering.

**D6. Trajectory consumes existing Proofline output** via `useAgentData()` — same hook, same data path. New: render `metadata.highlights[]` if present (Plan 1 added the field; missing field still renders fine).

**D7. WebsiteCard, LocalRankingCard, PMSCard each manage their own data fetches via dedicated hooks.** Avoids prop-drilling from DashboardOverview.

**D8. New fonts loaded once in `index.html`.** Available globally. Existing fonts kept (other components in the app may use them).

**D9. Onboarding wizard `wizard-highlight` outline updated to `#D66853`** (brand). Pulse animation pattern unchanged.

**D10. Setup-progress banner above the hero, only when org incomplete.** Reuses existing onboarding-completion logic.

**D11. Refresh button in TopBar dispatches the same handler as the existing dashboard refresh.** Behavior preserved.

**D12. No feature flag for the layout swap.** Revert path is git-only. (Pushback in Risk section if you want to reconsider.)

**D13. `HighlightedText` operates on pure text only.** It splits by a regex compiled from the highlights array, wraps each match in a `<mark className="hl">` JSX element, and emits the result as a fragment of React children. No raw-HTML injection paths exist anywhere in the new component tree.

## Tasks

Tasks split into five groups: **A (foundation, sequential)**, **B (layout primitives, parallel)**, **C (cards, parallel)**, **D (wiring + cleanup)**, **E (verification)**.

### Group A — Foundation (sequential)

#### T1: Add fonts in `index.html`
**Do:** Add Google Fonts `<link>` for Fraunces (weights 400, 500, 600), Inter (400, 500, 600, 700), JetBrains Mono (400, 500, 600). All with `display=swap`.
**Files:** `frontend/index.html`
**Depends on:** none
**Verify:** `npx tsc --noEmit` (no TS impact). Browser DevTools Network: confirm fonts load.

#### T2: Add `mark.hl` CSS + font-family vars to `index.css`
**Do:** Append to `frontend/src/index.css`: `mark.hl` class (light + dark variants per the design's contract), CSS vars `--font-display: 'Fraunces', serif`, `--font-mono: 'JetBrains Mono', ui-monospace`. Body font-family stays as-is (Inter loads but isn't applied globally — only used by new components via Tailwind class).
**Files:** `frontend/src/index.css`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`. Visual: a hand-rendered `<mark class="hl">test</mark>` in a sandbox shows orange-tinted background + brand orange text.

#### T3: Update wizard `wizard-highlight` to brand orange
**Do:** In `frontend/src/components/onboarding-wizard/SpotlightOverlay.tsx:170-202`, replace `rgba(255, 138, 61, X)` with `rgba(214, 104, 83, X)` (= `#D66853` at the same alphas).
**Files:** `frontend/src/components/onboarding-wizard/SpotlightOverlay.tsx`
**Depends on:** none (parallel, but bundled with foundation for atomic land)
**Verify:** `npx tsc --noEmit`. Manually trigger the wizard; confirm outline matches brand orange.

### Group B — Layout primitives (parallelizable after A)

#### T4: `TopBar.tsx`
**Do:** Create `frontend/src/components/layout/TopBar.tsx`. Props: `{ taskCount: number, currentTab?: string }`. Renders brand mark + tab nav (Focus / Journey / PMS / Rankings / Tasks · count / Referral Engine; map to dashboard routes) using `<NavLink>` for URL-driven active state. Right cluster: `<LivePill>`, refresh `<button>`, `<LocationSelector>` (existing pattern from Sidebar — extract or re-implement using `useLocationContext`), avatar. Mobile breakpoint: collapse tabs into hamburger.
**Files:** `frontend/src/components/layout/TopBar.tsx`
**Depends on:** T1, T2 (for fonts + tokens)
**Verify:** `npx tsc --noEmit`. Visual: render in isolation; resize to mobile width; confirm hamburger appears.

#### T5: `Ticker.tsx`
**Do:** Create `frontend/src/components/layout/Ticker.tsx`. Props: `{ items: string[], refreshedAt?: Date }`. Renders the today strip with the first label "Today" in orange and N items separated by dots. Right-aligned timestamp. Renders only on dashboard routes (gated by parent).
**Files:** `frontend/src/components/layout/Ticker.tsx`
**Depends on:** T1, T2
**Verify:** `npx tsc --noEmit`. Visual: render with 3 sample items.

#### T6: `HighlightedText.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/HighlightedText.tsx`. Props: `{ text: string, highlights?: string[] }`. Pure-text implementation per `~/Desktop/another-design/project/parts.jsx:4-19` — sort highlights longest-first, build escaped regex, split, wrap matches in `<mark className="hl">` JSX. Decode HTML entities before matching (using `DOMParser` or a small entity-decode helper). If no highlights, return text as-is. No raw-HTML injection anywhere.
**Files:** `frontend/src/components/dashboard/focus/HighlightedText.tsx`
**Depends on:** T2 (for `mark.hl` class)
**Verify:** `npx tsc --noEmit`. Unit-style spot-test: passing `text="hello world"` with `highlights=["hello"]` returns the expected JSX.

#### T7: `Sparkline.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/Sparkline.tsx`. Props: `{ data: number[], color: string, fillId: string, height?: number, width?: number }`. Implementation per `parts.jsx:22-52`. Renders area + line + last-point dot SVG. Self-contained. No animation library — pure SVG paths.
**Files:** `frontend/src/components/dashboard/focus/Sparkline.tsx`
**Depends on:** none (parallel)
**Verify:** `npx tsc --noEmit`. Visual: render with `data=[1,3,2,5,4]`, confirm shape.

#### T8: `FactorBar.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/FactorBar.tsx`. Props: `{ label: string, score: number }`. Renders label (left) + horizontal bar (color tier: green ≥0.7, orange 0.5-0.7, red <0.5) + score (right, mono, 2 decimals). Score clamps to [0, 1].
**Files:** `frontend/src/components/dashboard/focus/FactorBar.tsx`
**Depends on:** T2 (for colors)
**Verify:** `npx tsc --noEmit`. Visual: render with `score=0.65`, confirm orange bar.

### Group C — Dashboard cards (parallelizable after B + new API clients)

#### T9: API clients for new endpoints
**Do:** Create three new files:
- `frontend/src/api/dashboardMetrics.ts` — `fetchDashboardMetrics(orgId, locationId): Promise<DashboardMetrics>` calling `/api/dashboard/metrics`. Type imported from a new `frontend/src/types/dashboardMetrics.ts` mirroring Plan 1's backend type.
- `frontend/src/api/formSubmissionsTimeseries.ts` — `fetchFormSubmissionsTimeseries(range='12m'): Promise<TimeseriesPoint[]>`.
- `frontend/src/api/rankingHistory.ts` — `fetchRankingHistory(orgId, locationId, range='6m'): Promise<RankingHistoryPoint[]>`.
Plus matching React Query hooks under `frontend/src/hooks/queries/`.
**Files:** `frontend/src/api/dashboardMetrics.ts`, `frontend/src/api/formSubmissionsTimeseries.ts`, `frontend/src/api/rankingHistory.ts`, `frontend/src/types/dashboardMetrics.ts`, `frontend/src/hooks/queries/useDashboardMetrics.ts`, `frontend/src/hooks/queries/useFormSubmissionsTimeseries.ts`, `frontend/src/hooks/queries/useRankingHistory.ts`
**Depends on:** Plan 1 endpoints live
**Verify:** `npx tsc --noEmit`. Spot-call each from a sandbox component.

#### T10: `Hero.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/Hero.tsx`. Reads from `useTopAction()` hook (new — derived from existing `fetchClientTasks` filtered by `agent_type='SUMMARY' AND priority_score=max`). Renders pills row, headline (text-only with HighlightedText for highlights), rationale (HighlightedText), CTA buttons, due footer; right panel with eyebrow row, 3-stat grid (each stat from `metadata.supporting_metrics`), divider, "What this does" block (deliverables in green-bold via plain `<strong>` styling, mechanism muted). Domain icon in domain pill via `DOMAIN_ICONS` (T11). Loading: skeleton. Empty: "Your first monthly priority will appear once your data finishes processing." Error: inline + retry.
**Files:** `frontend/src/components/dashboard/focus/Hero.tsx`, `frontend/src/hooks/queries/useTopAction.ts`
**Depends on:** T6 HighlightedText, T9 API clients (for icon map indirectly)
**Verify:** `npx tsc --noEmit`. Visual against design.

#### T11: `dashboard/focus/icons.ts` — DOMAIN_ICONS map
**Do:** Create `frontend/src/components/dashboard/focus/icons.ts`. Export `DOMAIN_ICONS: Record<DomainEnum, { Comp: LucideIcon, cls: string }>` mapping domain → lucide icon component + Tailwind class for the icon-tile background. Icons: `MessageSquare`, `MapPin`, `TrendingUp`, `Inbox`, `Database`, `UserPlus`. Tile classes per design: `di-review`, `di-gbp`, `di-ranking`, `di-form`, `di-pms`, `di-referral` — defined as Tailwind utilities or in `index.css`.
**Files:** `frontend/src/components/dashboard/focus/icons.ts`
**Depends on:** T2 (for tile class definitions in CSS)
**Verify:** `npx tsc --noEmit`. Render-spot a sample tile.

#### T12: `Trajectory.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/Trajectory.tsx`. Reads from `useAgentData()` (existing). Renders pills row (Trajectory · Latest update + Growth status), salutation, body (HighlightedText for `metadata.highlights[]`), "Read full explanation →" link triggering `<ProoflineModal>`, mini stats (3 columns: Production MTD / New patient starts / Visibility score). Mini stats consume `dashboardMetrics` from T9.
**Files:** `frontend/src/components/dashboard/focus/Trajectory.tsx`
**Depends on:** T6, T9
**Verify:** `npx tsc --noEmit`. Visual against design.

#### T13: `ActionQueue.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/ActionQueue.tsx`. Reads from `fetchClientTasks` (existing). Filters: `agent_type='SUMMARY' OR agent_type='REFERRAL_ENGINE_ANALYSIS'`. Excludes `priority_score=max` SUMMARY (that's Hero). Sorts by priority_score desc. Renders 3-5 rows. Each row: domain icon (DOMAIN_ICONS), title, urgency text (color-coded), "Due {date}", agent pill (Summary / Referral Engine), chevron.
**Files:** `frontend/src/components/dashboard/focus/ActionQueue.tsx`, `frontend/src/hooks/queries/useActionQueue.ts`
**Depends on:** T11
**Verify:** `npx tsc --noEmit`. Visual.

#### T14: `WebsiteCard.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/WebsiteCard.tsx`. Headline: verified count + sub. Trend: computed from timeseries (last 30d vs prior 30d). Sparkline: 12-month timeseries from T9. Annotation: "Coming soon: Rybbit". Footer: "View submissions →" link.
**Files:** `frontend/src/components/dashboard/focus/WebsiteCard.tsx`
**Depends on:** T7 Sparkline, T9 API clients
**Verify:** `npx tsc --noEmit`. Visual.

#### T15: `LocalRankingCard.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/LocalRankingCard.tsx`. Headline: rank position + total competitors. Trend: position change from T9 history. Two factor sub-sections: "Google Search" (avg of category_match, keyword_name, gbp_activity, nap_consistency) and "Practice Health" (avg of star_rating, review_count, review_velocity, sentiment), each with 4 `<FactorBar>` rows. Lowest-factor annotation derived from `dashboardMetrics.ranking.lowest_factor`.
**Files:** `frontend/src/components/dashboard/focus/LocalRankingCard.tsx`
**Depends on:** T8, T9
**Verify:** `npx tsc --noEmit`. Visual.

#### T16: `PMSCard.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/PMSCard.tsx`. Headline: production this month from `pmsKeyData.totals.totalProduction`. Trend from `dashboardMetrics.pms.production_change_30d`. 12-month sparkline from `pmsKeyData.months[].productionTotal`. Mix bar: doctor vs self from latest month. Top-3 sources from `pmsKeyData.sources[]`.
**Files:** `frontend/src/components/dashboard/focus/PMSCard.tsx`
**Depends on:** T7, T9
**Verify:** `npx tsc --noEmit`. Visual.

#### T17: `ProoflineModal.tsx` extracted
**Do:** Extract the existing Proofline details modal (currently inline in `DashboardOverview.tsx:1604-1651`) into `frontend/src/components/dashboard/focus/ProoflineModal.tsx`. Same framer-motion pattern. Triggered by Trajectory's "Read full explanation →".
**Files:** `frontend/src/components/dashboard/focus/ProoflineModal.tsx`
**Depends on:** none (parallel)
**Verify:** `npx tsc --noEmit`. Open the modal; confirm content + close behavior unchanged.

#### T18: `SetupProgressBanner.tsx`
**Do:** Create `frontend/src/components/dashboard/focus/SetupProgressBanner.tsx`. Consumes existing onboarding-completion logic from the auth/onboarding flow. Renders only when `isOnboardingComplete === false`. Visual: thin orange-tinted banner above the hero with progress steps + a CTA to continue setup.
**Files:** `frontend/src/components/dashboard/focus/SetupProgressBanner.tsx`
**Depends on:** none (parallel)
**Verify:** `npx tsc --noEmit`. Toggle the auth state in dev; banner shows/hides correctly.

### Group D — Wiring + cleanup

#### T19: Update `PageWrapper.tsx` — replace Sidebar with TopBar + Ticker
**Do:** In `frontend/src/components/PageWrapper.tsx:15-149`, replace `<Sidebar ... />` rendering (line 87) with `<TopBar taskCount={...} />` at the top of the layout. Add `<Ticker items={...} />` immediately below TopBar, but render only when current route matches a dashboard tab (use `useLocation()`). Update the main content `<main>` wrapper to no longer reserve sidebar width (`md:ml-72` → no margin). Remove mobile header (line 46) — TopBar's mobile variant absorbs it. Add comment at top noting the refactor and the deprecated `Sidebar.tsx`.
**Files:** `frontend/src/components/PageWrapper.tsx`, `frontend/src/components/Sidebar.tsx` (deprecation comment only)
**Depends on:** T4 TopBar, T5 Ticker
**Verify:** `npx tsc --noEmit`. Browser smoke: visit `/dashboard`, `/settings`, `/help`, `/notifications` — TopBar renders on all; Ticker only on dashboard routes.

#### T20: Rewrite `DashboardOverview.tsx`
**Do:** Replace the entire content of `frontend/src/components/dashboard/DashboardOverview.tsx` with a thin composition (target length ~250 lines):

```
<SetupProgressBanner />
<FocusHeader />     {# small "Focus — April 2026 / One priority. Everything else, in order." #}
<Hero />
<div grid 2/1>
  <Trajectory />
  <ActionQueue />
</div>
<div grid 3>
  <WebsiteCard />
  <LocalRankingCard />
  <PMSCard />
</div>
```

Drop legacy sections: alert bar, professional header, monthly metric grid, ranking carousel, intelligence briefing, action needed, wins/risks two-column, 3 strategic fixes, fix details modal, data hub. Keep ProoflineModal accessible via Trajectory's link.
**Files:** `frontend/src/components/dashboard/DashboardOverview.tsx`
**Depends on:** T10-T18
**Verify:** `npx tsc --noEmit`. Browser: dashboard renders end-to-end with real data.

#### T21: Refresh handler wiring
**Do:** Connect TopBar's refresh button to the dashboard's existing refresh logic. Extract the `handleRefresh()` from the legacy DashboardOverview (lines 656-669) into a hook `useDashboardRefresh()` that invalidates all relevant query keys. TopBar consumes it.
**Files:** `frontend/src/hooks/useDashboardRefresh.ts`, `frontend/src/components/layout/TopBar.tsx`, `frontend/src/components/dashboard/DashboardOverview.tsx`
**Depends on:** T19, T20
**Verify:** Click refresh in TopBar → confirm all 6+ query refetches fire (Network tab).

### Group E — Verification

#### T22: TypeScript check
**Do:** Run `npx tsc --noEmit` from `frontend/` and project root. Zero new errors.
**Files:** none (operational)
**Depends on:** T1-T21
**Verify:** Clean output.

#### T23: Visual smoke at desktop width
**Do:** Run `npm run dev` from `frontend/`. In Chrome at 1320-1440px viewport:
- (a) `/dashboard`: TopBar visible, Focus tab highlighted, Ticker visible, Hero loads with real Summary v2 data, Trajectory loads with real Proofline data, Action Queue shows 3-5 rows, all 3 product cards render with real data.
- (b) `/settings` (or any non-dashboard route): TopBar visible, no tab highlighted, Ticker hidden, page content loads as before.
- (c) Hover states: tabs change color, queue rows highlight, CTA buttons lift.
- (d) Click "Read full explanation →": Proofline modal opens with content; close works.
- (e) Click TopBar refresh: network tab shows 6+ requests fire.
- (f) Trigger onboarding wizard: confirm `wizard-highlight` outline is brand orange and looks correct against the new layout (especially over the dark hero card).
- (g) Empty state: temporarily clear tasks for the test org; confirm Hero shows the empty-state message gracefully.
**Files:** none (operational)
**Depends on:** T22
**Verify:** Document each sub-check pass/fail in execution summary.

#### T24: Mobile smoke (best-effort)
**Do:** Resize Chrome to <lg breakpoint (~1023px and below). Confirm:
- TopBar collapses to brand + avatar + hamburger
- MobileBottomNav still renders
- Hero, Trajectory, Queue, 3 cards stack vertically
- No horizontal scroll
- No content cut off
**Files:** none (operational)
**Depends on:** T22
**Verify:** Document.

## Done

- [ ] Plan 1 (Backend) committed and verified.
- [ ] T1-T21 complete and TypeScript clean (frontend + backend).
- [ ] All 7 sub-checks in T23 pass.
- [ ] Mobile smoke (T24) passes — no broken layout, no overlapping nav.
- [ ] Onboarding wizard outline now brand orange `#D66853`.
- [ ] No regression in non-dashboard pages: Settings, Help, Notifications, DFY Website all render under the new TopBar without crashes (acceptable spacing differences are tracked as Rev items, not blockers).
- [ ] CHANGELOG.md updated to v0.0.34 with summary.
- [ ] Commit author `LagDave <laggy80@gmail.com>` (no Claude attribution).

## Out-of-Spec Follow-ups (not this plan)

- Plan 3 (per-page reflow): adjust Settings, Help, Notifications, DFY Website inner layouts if T23 sub-check (b) reveals broken spacing.
- Mobile-first redesign of the new layout (current mobile is "works, doesn't crash").
- Touch device interaction patterns (hover affordances).
- Full WCAG accessibility audit.
- Component library extraction: turn Hero/Trajectory/Queue into a shared "FocusUI" component library if other surfaces want them.
- TopBar feature flag `VITE_USE_TOPBAR_LAYOUT` for staged rollout (recommended in Risk; not adopted unless explicitly requested).
- Sidebar component full removal (file deletion). Keep on disk for revert path until v2 layout is proven over ~2 release cycles.
- Localization of TopBar tab labels and Ticker text.
- Performance optimization: lazy-load Sparkline / FactorBar charts; defer Trajectory mini-stats below the fold.
- Animation polish: tab underline-slide on click, hero card entrance, queue row stagger.
