# Warmup Quality Fixes

## Why
Re-running warmup on a real project exposed five gaps: (1) scrape returns zero characters on client-rendered sites, so every downstream distilled field (UVP, certifications, service areas) ends up empty and image count is 0; (2) the fetched logo is captured in `brand.logo_s3_url` but never displayed in the UI; (3) the captured `extracted_assets.images[]` is shown only as a count — there's no way to inspect what Claude-vision labeled or check whether each image is usable; (4) the Re-run warmup button wipes every input and forces the admin to re-enter URLs / texts / GBP profiles from scratch — painful when iterating; (5) the certifications distilled list misses obvious dental credentials. Items 1 and 5 are quality-of-data; 2–4 are admin-UX-of-identity.

## What
Six tasks, all inside the website builder:

1. **Images tab** in the Identity modal — grid view of every analyzed image with thumbnail, description, use_case, is_logo badge, and usability_rank.
2. **Logo thumbnail** surfaced in the Summary tab's Brand section with a "No logo detected" empty state.
3. **Re-run warmup with "Keep current sources"** — new confirm dialog offers two paths: replay the current identity's URLs/texts/place_ids verbatim, OR edit them first.
4. **Auto-escalate scrape strategy** when the fetch result has near-empty content. Ladder: `fetch` → if < 500 usable chars, `browser` → if still empty, `screenshot`. Bounded, logged, and surfaced in the `sources_used.urls` trace as the `strategy_used_final` field.
5. **Cert + service-area distillation prompt tune** — adds dental-specific examples to `IdentityDistiller.md` so the LLM catches common patterns ("DDS", "DMD", "Board Certified in Endodontics", "AAE member", "Invisalign Diamond+ Provider").
6. **URL Test button** — adopts the same 500-char content threshold so what admins test matches what warmup will consume. Today it already checks ≥ 200 chars; bump + add a visual "thin content" warning state distinct from "blocked."

## Context

**Relevant files:**
- `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts:46–86` — `scrapeUrl(url, strategy)` currently returns exactly what the caller asks for. No auto-escalation. Main lever for T4.
- `src/controllers/admin-websites/feature-utils/util.url-block-detector.ts:51–373` — `detectBlock(url)` already enforces body ≥ 200 chars at line 357. Small tweak for T6.
- `src/controllers/admin-websites/AdminWebsitesController.ts:575–599` — `testUrl` handler wrapping `detectBlock`. UI polish for T6.
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` — the warmup pipeline. T4 plugs into its URL loop (lines 169–202). T5 updates the distillation call wiring.
- `src/agents/websiteAgents/builder/IdentityDistiller.md` — distillation prompt owning `certifications[]`, `service_areas[]`, `doctors[]`, `services[]`. T5 surgical edit.
- `frontend/src/components/Admin/IdentityModal.tsx` — owns:
  - Summary tab (`IdentitySummary` line 1226–1286) — logo thumbnail lands in Brand block.
  - Tab bar (line 984) — new Images tab registered.
  - Re-run handler (line 627–631) — current behavior: confirm → wipe state. T3 replaces with a mode picker.
- `frontend/src/components/Admin/DynamicSlotInputs.tsx:259` — renders the URL test result pill. Needs the new "thin content" warning variant.
- `frontend/src/api/websites.ts` — `testUrl` response type may need a new `thin_content: boolean` flag.

**Patterns to follow:**
- New tab: mirror the existing `Doctors`/`Services`/`Locations` tab registration in `IdentityModal.tsx` (added in 0.0.21).
- Image grid: no existing analog in `/Admin/*Tab.tsx`. Closest pattern is `MediaBrowser.tsx` (tile grid with metadata). Reference it.
- Confirm dialog with two paths: reuse `useConfirm` from `frontend/src/components/ui/ConfirmModal.tsx` if it supports custom content. If not (likely plain yes/no), build a small dedicated `RerunWarmupDialog.tsx`.
- Strategy escalation: no existing analog. Lives in `service.url-scrape-strategies.ts` as a new wrapper function, preserving the existing single-strategy entrypoint for callers that explicitly want one mode.

**Reference file:** `frontend/src/components/Admin/MediaBrowser.tsx` — closest analog for the Images grid. `frontend/src/components/ui/ConfirmModal.tsx` — closest analog for a two-path dialog.

## Constraints

**Must:**
- Auto-escalation must bound by strategy ladder (`fetch` → `browser` → `screenshot`) and never loop. Max 3 attempts per URL, total.
- Escalation must still respect user intent: if the admin explicitly picked `browser` or `screenshot` in the warmup form, skip `fetch` entirely and start from their choice. Only auto-escalate downstream if the chosen strategy also returns thin content.
- "Keep current sources" must rehydrate from `identity.sources_used.urls`, `identity.raw_inputs.user_text_inputs`, and `project.selected_place_ids` — not from the visible form state (which is already empty after warmup completes).
- Images tab must not fetch anything — pure read of `identity.extracted_assets.images`.
- Logo thumbnail must gracefully handle `brand.logo_s3_url = null` with a "No logo detected" row.
- URL Test: the new "thin content" state must be visually distinct from "blocked" (different icon + amber vs red). Same HTTP call; only the verdict rendering changes.
- Auto-escalation logs each step (`log("Scrape escalated", { url, from, to, chars })`) so the Cost/telemetry trail is complete.

**Must not:**
- Don't reorder the existing warmup pipeline beyond adding the escalation wrapper. The 3b → 4 → 5 → 6 → 7 → 8 sequence stays.
- Don't add a new DB column or migration. All changes land in JSONB (`strategy_used_final` inside `sources_used.urls[]`).
- Don't re-architect `scrapeUrl` — keep its contract. The escalation logic is a new helper `scrapeUrlWithEscalation` that calls `scrapeUrl` repeatedly.
- Don't bundle onboarding flow changes. If admins need a better first-run experience it's a separate plan.
- Don't rewrite the whole distillation prompt. Surgical: add 6–8 dental-specific example patterns to the certifications + service-area rules.

**Out of scope:**
- Full redesign of the Identity modal. Minimal additions only.
- Image editing / cropping / reordering inside the new Images tab — read-only.
- "Keep sources and also add new ones" — pick one mode. If admin needs both, they can reuse-then-edit in two clicks.
- Per-image re-analysis from the Images tab. Future plan.
- Scheduled scrape re-runs or cron-based refresh.

## Risk

**Level:** 3 — auto-escalation (T4) touches every warmup's URL loop and can triple per-URL latency in worst case. Everything else is Level 1–2.

**Risks identified:**
- **Browser/screenshot strategies are slow.** Auto-escalating a 5-URL warmup could push warmup from 30s to 2+ minutes in worst case. → **Mitigation:** hard timeout per strategy (10s fetch, 20s browser, 30s screenshot). Cap total per-URL budget at 45s. Emit telemetry so we can watch P95 latency.
- **`useConfirm` may not support multi-button dialogs.** → **Mitigation:** build a standalone `RerunWarmupDialog.tsx` if the existing confirm is boolean-only. Check during execution.
- **Rehydration can surface stale data.** If `identity.sources_used.urls` has URLs the admin removed manually, "Keep sources" could resurrect them. → **Mitigation:** rehydrate verbatim. Document behavior. Admin's escape hatch is the "Edit sources" option in the same dialog.
- **Certification prompt tune regresses other fields.** Adding dental-specific examples to distillation could bias it toward dental patterns even for non-dental projects. → **Mitigation:** frame the examples as "common dental credential patterns (if applicable)" so the LLM doesn't fabricate them for non-dental projects. This codebase is primarily dental, so the tradeoff is acceptable.
- **Auto-escalation confused with user's explicit strategy choice.** → **Mitigation:** if admin explicitly chose `browser`, never fall back to `fetch` — only escalate upward (`browser` → `screenshot`).

**Blast radius:**
- Every warmup run touches T4 (new wrapper). Rollback: flip a feature flag or revert the single commit.
- IdentityModal gains two tabs + rehydration logic. Existing tabs untouched.
- Distillation prompt change ships globally to every warmup. No runtime toggle.

**Pushback:**
- **T4 is doing a lot of work to paper over a scrape helper that could simply be smarter on its own.** Consider: instead of wrapping `scrapeUrl`, push the escalation into `scrapeUrl` itself and deprecate `strategy` as an explicit param (always auto). Cleaner architecture. Tradeoff: breaks any caller that needs a specific strategy. Recommend keeping the wrapper approach; deprecation is a separate plan.
- **"Keep sources" is a testing convenience, not a production feature.** Worth it for Dave's iteration speed (he's clearly stress-testing), and it's 1 UI component + rehydration logic. Ship it.
- **Images tab is the lowest-value item** — if warmup is broken (T4 unfixed), there are no images to display. Keep it in scope because it's also useful when warmup works.

## Tasks

Wave 1 (parallel): Group A (frontend IdentityModal batch), Group B (backend scrape + prompt).

All 6 tasks fit in 2 sub-agent assignments by file ownership:
- Agent 1 owns `frontend/src/components/Admin/IdentityModal.tsx`, new `ImagesTab.tsx`, new `RerunWarmupDialog.tsx`, `frontend/src/api/websites.ts` (append), `frontend/src/components/Admin/DynamicSlotInputs.tsx` (T6 visual polish only).
- Agent 2 owns `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts`, `src/controllers/admin-websites/feature-services/service.identity-warmup.ts`, `src/controllers/admin-websites/feature-utils/util.url-block-detector.ts`, `src/agents/websiteAgents/builder/IdentityDistiller.md`, `src/controllers/admin-websites/AdminWebsitesController.ts` (appended `testUrl` response shape if needed).

No shared files between agents.

---

### Group A — Frontend IdentityModal batch (Agent 1)

#### T1: Images tab
**Do:** Add a new "Images" tab to the Identity modal tab bar (placed after Locations, before Re-run warmup). Tab body renders a responsive grid (3 cols desktop, 2 mobile) of every `identity.extracted_assets.images` entry. Each tile:
- Thumbnail at `s3_url` with `loading="lazy"` (aspect-ratio 1:1, object-cover, rounded corners).
- Overlay on hover: description, use_case, resolution.
- Corner badges: `is_logo` (tiny "LOGO" pill) + `usability_rank` as a 1-5 dot scale.
- Click opens the image in a new tab (`target="_blank"`).
- Empty state: "No images captured during warmup. Re-run warmup with the Google Business Profile + website URL to collect photos."
- Header row: `{N} images analyzed` + dominant use_case badges (hero, gallery, team, office).

**Files:** `frontend/src/components/Admin/IdentityModal.tsx` (tab registration), new `frontend/src/components/Admin/IdentityImagesTab.tsx`.
**Depends on:** none.
**Verify:** Open identity modal on a project with ≥ 1 image → grid renders → click thumbnail → opens full size.

#### T2: Logo thumbnail in Summary
**Do:** In `IdentitySummary` (`IdentityModal.tsx` line 1226–1286), extend the Brand block with a top-row `<img src={identity.brand.logo_s3_url}>` rendered at 48×48 (object-contain) with a rounded border. When `logo_s3_url` is falsy: render a dashed placeholder with text "No logo detected — upload in Brand edit mode."
**Files:** `frontend/src/components/Admin/IdentityModal.tsx`.
**Depends on:** none.
**Verify:** Project with captured logo shows thumbnail in Summary → project without shows dashed placeholder.

#### T3: Re-run warmup dialog with "Keep current sources"
**Do:** Replace the existing `confirm()` call (line 627–631) with a new two-path dialog:
- Title: "Re-run warmup?"
- Body: "This rebuilds the entire project identity. Existing manual edits will be lost."
- Primary action: "Keep current sources" → rehydrate the `EmptyWarmupForm` state from:
  - `selectedPlaces` ← project.selected_place_ids (resolved via Place Details API or stored names on `identity.locations[]`).
  - `urlInputs` ← `identity.sources_used.urls[]` (take `url` + any prior `strategy` if stored; default to `fetch`).
  - `textInputs` ← `identity.raw_inputs.user_text_inputs[]` (full text; confirmed present during exploration).
  - Then auto-submit `handleGenerate()`.
- Secondary action: "Edit sources" → existing wipe-and-reenter behavior.
- Tertiary: "Cancel."

New file: `frontend/src/components/Admin/RerunWarmupDialog.tsx`. Check whether `useConfirm` supports this shape; if boolean-only, build the dedicated dialog and drop the old `confirm()`.

**Files:** `frontend/src/components/Admin/IdentityModal.tsx`, `frontend/src/components/Admin/RerunWarmupDialog.tsx` (new).
**Depends on:** none.
**Verify:** Identity with captured sources → click Re-run → see 3-button dialog → "Keep current sources" replays warmup with same inputs → "Edit sources" clears and reopens form.

#### T6 (UI half): Thin-content warning in URL Test button
**Do:** In `frontend/src/components/Admin/DynamicSlotInputs.tsx` (around line 240–265 where the test result renders), add a third visual state beyond "OK" and "Blocked":
- New state "thin" (amber): `<AlertTriangle />` icon + text "Looks thin (N chars). This may scrape empty — try a different URL."
- Triggered when `result.ok === true && result.thin_content === true`.

Also in `frontend/src/api/websites.ts`, extend the `BlockCheckResult` type with `thin_content?: boolean` and `preview_chars: number` (already present).
**Files:** `frontend/src/components/Admin/DynamicSlotInputs.tsx`, `frontend/src/api/websites.ts`.
**Depends on:** none frontend-side, but only meaningful after Agent 2's T6 backend half lands.
**Verify:** Call testUrl API on a client-rendered React site → receives `{ok: true, thin_content: true, preview_chars: <500}` → UI shows amber warning.

---

### Group B — Backend scrape + distillation (Agent 2)

#### T4: Auto-escalating scrape
**Do:** New exported helper in `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts`:

```ts
export async function scrapeUrlWithEscalation(
  url: string,
  initialStrategy: ScrapeStrategy = "fetch",
  signal?: AbortSignal,
): Promise<ScrapeResult & { strategy_used_final: ScrapeStrategy; escalations: Array<{from: ScrapeStrategy; to: ScrapeStrategy; reason: "thin_content" | "error"}> }>
```

Behavior:
- Strategy ladder: `fetch` → `browser` → `screenshot`. Start from `initialStrategy`.
- After each attempt, compute combined `pages` char count. If `< 500` non-whitespace chars, escalate to the next rung. If the admin picked `browser`/`screenshot` explicitly, never regress to `fetch` — only escalate upward.
- Per-strategy timeout: `fetch` 10s, `browser` 20s, `screenshot` 30s.
- Total budget per URL: 45s (hard cap; abort remaining strategies if exceeded).
- Record each escalation with `log("Scrape escalated", {url, from, to, reason, chars})`.
- Return the final result + telemetry.

Update `service.identity-warmup.ts` URL scrape loop (lines 169–202) to call `scrapeUrlWithEscalation` instead of `scrapeUrl`. Persist `strategy_used_final` into each `sources_used.urls[i]` object so admins can see which strategy actually produced content.

**Files:** `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts`, `src/controllers/admin-websites/feature-services/service.identity-warmup.ts`.
**Depends on:** none.
**Verify:** Warmup on a known client-rendered site (Wix / Squarespace app) → logs show `Scrape escalated fetch→browser (thin_content)` → `sources_used.urls[].char_length > 500` → `strategy_used_final === "browser"`.

#### T5: Distillation prompt tune for certs + service areas
**Do:** Surgical edits to `src/agents/websiteAgents/builder/IdentityDistiller.md`:
- In the `certifications[]` section of the output schema, add examples of common dental credentials: "DDS", "DMD", "Board Certified in [specialty]", "AAE member" (American Association of Endodontists), "AAO member" (orthodontists), "Invisalign Diamond+ Provider", "Fellowship in AAID" (implant dentistry). Frame as "look for patterns like…" not "always include these."
- In the `service_areas[]` section, add: look for city names + ZIP codes near the practice address. Parse from "serving X, Y, Z" / "proudly serving" / footer blocks.
- Do not change the doctors/services extraction rules from 0.0.21.
**Files:** `src/agents/websiteAgents/builder/IdentityDistiller.md`.
**Depends on:** T4 (for meaningful content to distill from).
**Verify:** Warmup with T4 landed → certifications array is non-empty on a dental site that mentions credentials.

#### T6 (backend half): Thin-content flag on URL Test
**Do:** In `src/controllers/admin-websites/feature-utils/util.url-block-detector.ts`, extend the final result shape at line ~357 with `thin_content: preview.trim().length < 500` (when `ok === true`). Keep the existing `ok` and block detection logic unchanged — `thin_content` is orthogonal signal.

Update `BlockCheckResult` type in the backend (wherever it's defined, likely `util.url-block-detector.ts` or a shared types file) to include the new field.
**Files:** `src/controllers/admin-websites/feature-utils/util.url-block-detector.ts` + (if needed) the types file.
**Depends on:** none.
**Verify:** Hit `testUrl` on a known thin-content React SPA → response includes `{ok: true, thin_content: true}`.

## Done
- [ ] `npx tsc --noEmit` clean in both `/` and `/frontend`.
- [ ] Warmup a client-rendered React site → backend logs show `Scrape escalated fetch→browser` → resulting identity has non-zero `sources_used.urls[].char_length` and non-empty `content_essentials.unique_value_proposition`.
- [ ] Identity modal Summary shows the logo thumbnail (or a dashed "No logo detected" placeholder).
- [ ] Identity modal Images tab renders a grid of labeled thumbnails with use_case + is_logo badges.
- [ ] Re-run warmup click → new dialog → "Keep current sources" replays the warmup verbatim → "Edit sources" clears and reopens the form.
- [ ] URL Test on a thin-content site renders the amber "Looks thin" warning distinct from the red "Blocked" warning.
- [ ] Distillation prompt tune verified: warmup a dental practice with known credentials → `certifications[]` catches at least one DDS/DMD/AAE/board-cert mention.
- [ ] No regression: existing warmup flow with `fetch` strategy on a server-rendered site still works without escalating.

## Revision Log
_(empty — populate during --continue if scope changes)_
