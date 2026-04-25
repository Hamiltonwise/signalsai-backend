# Audit: Stage-Copy Honesty + Perf Tightening

## Why
Audit takes ~70 seconds end-to-end on Coastal Endo (and 50–55 of those seconds are spent looking like the UI is "Mapping competitors" while we're actually running Claude website analysis + the 5 GBP pillar agents). Two real costs and one fake-feeling cost:

1. **Real:** Branch B (Claude website analysis LLM) takes 34s and dominates the parallel-branch fan-out.
2. **Real:** The screenshot fed to Claude is ~80 kB at 1568 px; the markup is ~62 kB after current stripping. Both could be tighter without quality loss.
3. **Fake:** the user sees "Mapping 4 competitors. Analyzing review volume and market position…" for 50+ seconds even though competitor mapping itself finished in 0.5s. The label is lying.

## What
Three targeted changes, ordered by ROI:

- **(a)** Rewrite the `CompetitorMapStage` info-panel copy so it honestly reflects "cross-referencing competitors with your website + GBP signals" — no more "mapping N competitors" stuck on screen for a minute.
- **(b)** Make `stripMarkupForLLM` more aggressive — drop large class/id attribute strings, common framework boilerplate (Tailwind utility lists, data-* attrs the LLM ignores), and `<head>` link/meta noise that doesn't affect analysis. Target: 100 kB → ~30 kB (current is ~60 kB).
- **(c)** Lower `CLAUDE_MAX_DIMENSION` from 1568 → 1024 px in `resizeForClaude`. Sub-second savings on resize, smaller image → fewer image tokens, ~30–50 kB JPEG instead of ~80 kB.

Done when:
- Audit on `coastalendostudio.com` shows accurate "compiling/cross-referencing" copy during the post-fan-out tail (no more "Mapping 4 competitors" frozen on screen)
- `[B] WebsiteAnalysis LLM` time drops by ≥15% on Coastal Endo (~5–8s saved on input-token processing)
- Audit output quality (website grade, GBP analysis recommendations) is unchanged on a non-CF target (Artful) — empirical visual comparison
- TS clean both repos

## Context

**Relevant files:**

- `~/Desktop/alloro-leadgen-tool/src/components/stages/CompetitorMapStage.tsx` lines 226–243 — the misleading "Territory Analysis / Mapping N competitors / Analyzing review volume and market position…" copy. Both `isLoading` and the post-load branch need new copy that reflects the post-fan-out reality.
- `~/Desktop/alloro/src/controllers/audit/audit-utils/markupStripper.ts` — current stripper is conservative. Adds `<script>`, `<style>`, comment, SVG-body, base64-img, and inline-style removal. Need to extend with class/id/data-attribute removal and `<head>` cleanup.
- `~/Desktop/alloro/src/workers/processors/auditLeadgen.processor.ts` line 58 (`CLAUDE_MAX_DIMENSION = 1568`) — single constant change. Used by `resizeForClaude` at line 72.

**Patterns to follow:**

- Markup stripper uses `cheerio` for DOM walking. Extend the existing function in-place rather than splitting into multiple helpers — its job IS to be a one-stop bag of cleanup rules.
- Frontend copy lives inside JSX in the existing `<p>` element; one ternary branch (isLoading) and one default state. Match the existing voice (sentence-case, em-dashes acceptable, "your" not "the").

**Reference files:**
- Stripper analog: the existing `markupStripper.ts` body itself — extend its rules.
- Constant analog: `AUDIT_MODEL` and `COMPETITOR_LIMIT` constants at top of `auditLeadgen.processor.ts` (env-overridable). Consider making `CLAUDE_MAX_DIMENSION` env-overridable too for runtime tuning.

## Constraints

**Must:**
- Preserve all visible text content during stripping. The Claude website-analysis prompt scores based on copy/CTA/NAP — losing that loses quality.
- Preserve `meta`, schema.org microdata (`itemprop`, `itemscope`, `itemtype`), `aria-*`, `role`, `lang`, `content` — these signal accessibility/SEO rigor.
- Preserve `href`, `src`, `alt`, `title` on `<a>` and `<img>` — Claude reads these for link text + image semantics.
- Frontend copy must NOT introduce new translation strings if the project uses i18n (verify during execution — likely no i18n given prior code).
- Image resize must remain `fit: "inside"` + `withoutEnlargement: true` — never upscale.

**Must not:**
- Don't drop the `<head>` entirely. Title, description meta, viewport meta inform the analysis.
- Don't strip `class` attributes if they encode semantic info (e.g., `class="phone"`, `class="hours-friday"`). Heuristic: drop classes longer than 60 chars OR with >5 space-separated tokens (those are framework utility lists). Keep short, semantic-looking class values.
- Don't reduce `CLAUDE_MAX_DIMENSION` below 1024 — Anthropic's image-token cost is already minimal at that size, and going lower (768, 512) loses real layout detail.
- Don't change the WebsiteAnalysis prompt itself — only the input we feed it.

**Out of scope:**
- Adding a new `realtime_status` value for "post-fan-out, awaiting final analysis". Cleaner architecturally but multi-file. Separate `-s` if (a)'s copy fix doesn't land hard enough.
- Splitting `stripMarkupForLLM` into composable strategies. The repo's pattern is one function per file.
- Caching scrape results across audits of the same domain. Real perf win but bigger blast radius.

## Risk

**Level: 2** (Concern — input data shape changes affect LLM output quality in ways we can't compile-check).

**Risks identified:**

- **Markup stripping too aggressive → website-analysis quality regresses.** If we drop semantic class names that Claude was using (e.g., `class="hero-title"` informs that it's the H1's role), the website grade may shift. → **Mitigation:** keep the heuristic conservative — drop only obviously-framework-utility class strings (long, space-rich). A/B on Artful: run pre-change once, run post-change, manually compare website_analysis.pillars output. Bail and revert if scores diverge meaningfully.

- **Smaller screenshot → website-analysis vision grade regresses.** Claude's vision model uses screenshots for layout/hierarchy/CTA-prominence judgments. 1024 px should preserve all of that, but going lower would not. → **Mitigation:** stop at 1024. Verify post-change that desktop layout features (header, nav, hero CTA) are still visually distinguishable in the resized JPEG before sending. Keep `quality: 85` JPEG (current) — don't drop quality alongside dimension.

- **Frontend copy might mention things that aren't always true.** "Cross-referencing competitor data with your website" is misleading if the user has no website (no-website path). → **Mitigation:** Three-state copy already exists for `hasWebsiteData` / `websiteBlocked`. Mirror that here — pass the `websiteBlocked` / no-website flag into the substage copy and adjust accordingly. Or keep copy generic ("Compiling your analysis…") that's true in all three states.

- **CLAUDE_MAX_DIMENSION as env var (optional).** If we make it `process.env.CLAUDE_MAX_DIMENSION || 1024`, prod can tune without redeploy. Tradeoff: another env var to forget about. → **Mitigation:** include the env-overridable pattern but document; matches `AUDIT_MODEL` and `COMPETITOR_LIMIT` precedent.

**Blast radius:**
- (a) — frontend copy only. Affects all audits visually but no functional change.
- (b) — affects every audit's Branch B input. Quality-validate on real data before merging.
- (c) — affects every audit's Branch B input AND the screenshot stored in S3 (if it's the resized one). Verify what's in S3: the original or the resized image.

**Pushback:**

- **Should we A/B (b) and (c) before deploying?** Real answer: yes if we had a test harness; we don't. Manual visual comparison on 2-3 sites is the realistic check. Not a blocker but a flag.
- **Stage-copy fix alone might not be enough.** If users still feel the audit is hung after we fix the copy, we'll need to add granular substages or a progress bar within `competitor_map`. That's a separate `-s`. Ship (a) first, measure user feedback, then decide.
- **(c) screenshot dimension reduction's perf gain may be marginal.** Worth confirming before celebrating — maybe (b) alone gets us most of the way and (c) is a no-op.

## Tasks

### T1: (a) Rewrite CompetitorMapStage info-panel copy
**Do:**
- Edit `~/Desktop/alloro-leadgen-tool/src/components/stages/CompetitorMapStage.tsx` lines 226–243.
- Title stays: `Territory Analysis`.
- Replace the `isLoading` branch ("Scanning competitors in your area...") with copy that's true at the start of the stage.
- Replace the post-load branch ("Mapping {N} competitors in your area. Analyzing review volume and market position...") with copy that's true throughout the long tail. Suggested: `Cross-referencing your practice against {N} local competitors. Compiling website + GBP insights…` — works whether website is being analyzed, blocked, or absent.
- Confirm no i18n / translation file affected. If there is, update it too.

**Files:** `~/Desktop/alloro-leadgen-tool/src/components/stages/CompetitorMapStage.tsx`.
**Depends on:** none.
**Verify:** Local audit on Coastal Endo. Watch the competitor_map stage from when it appears (~14s) to dashboard transition (~70s). Copy should accurately describe what's happening for the entire window. `npx tsc --noEmit` passes.

### T2: (b) Tighten markup stripping
**Do:**
- Edit `~/Desktop/alloro/src/controllers/audit/audit-utils/markupStripper.ts`.
- Add rules (in order):
  1. Drop framework-utility `class` attributes — heuristic: if a class string is >60 chars OR has >5 space-separated tokens, remove it. Short semantic classes (e.g., `class="phone"`, `class="hero"`) survive.
  2. Drop `data-*` attributes that aren't `data-type`, `data-role`, `data-cy` (test ids stay; framework state doesn't).
  3. Drop `id` attributes longer than 30 chars (typically framework-generated). Short ids (`id="contact"`) survive.
  4. Drop `<head>` `<link>` tags except `<link rel="canonical">` and `<link rel="alternate">` (SEO signals).
  5. Drop `aria-hidden="true"` elements entirely (decorative, not semantic).
- Keep all existing rules.
- Update the JSDoc header to document the new rules.

**Files:** `~/Desktop/alloro/src/controllers/audit/audit-utils/markupStripper.ts`.
**Depends on:** none.
**Verify:**
1. `npx tsc --noEmit` passes.
2. Run a local audit on Artful (`artfulorthodontics.com` — clean baseline). Check worker logs for `stripMarkup` line. Expect `kB → kB (-X%)` reduction to climb from ~39% to ~70%+. Original 100 kB → stripped should be ~30 kB.
3. Compare audit output JSON `step_website_analysis.pillars` between pre/post change. Pillar grades should not shift more than one letter (e.g., B+ → B is acceptable; B → D is a quality regression and means we cut something important).

### T3: (c) Lower CLAUDE_MAX_DIMENSION + make env-overridable
**Do:**
- Edit `~/Desktop/alloro/src/workers/processors/auditLeadgen.processor.ts` line 58.
- Replace `const CLAUDE_MAX_DIMENSION = 1568;` with:
  ```ts
  const CLAUDE_MAX_DIMENSION = parseInt(
    process.env.CLAUDE_MAX_DIMENSION || "1024",
    10
  );
  ```
- Update the existing JSDoc comment about Claude's sweet spot to note the new default and env-override.

**Files:** `~/Desktop/alloro/src/workers/processors/auditLeadgen.processor.ts`.
**Depends on:** none.
**Verify:**
1. `npx tsc --noEmit` passes.
2. Local audit on Artful. Worker log line `[B] image resized for Claude: desktop=NkB` should drop from ~80 kB → ~30–50 kB.
3. Branch B LLM duration (`✓ [B] WebsiteAnalysis complete (Xms)`) should drop noticeably — target ≥10% improvement.
4. Same quality check as T2: pillar grades should not shift more than one letter on the same target.

### T4: End-to-end verification + before/after timing comparison
**Do:**
- Run a local audit on Coastal Endo (CF-protected) and one on Artful (clean baseline) BEFORE applying T2/T3 — capture the time breakdown for each.
- Apply T1, T2, T3.
- Run the same two audits again.
- Compare:
  - `[B] WebsiteAnalysis LLM` time delta (should drop ≥15% combined from T2+T3).
  - `stripMarkup` reduction percentage (target ≥70%, was 39%).
  - Pillar grades on the dashboard — should be the same or within one letter.
- TS check both repos.

**Files:** none modified.
**Depends on:** T1, T2, T3.
**Verify:** All Done items below pass.

## Done

- [ ] `npx tsc --noEmit` — zero errors in `~/Desktop/alloro`
- [ ] `npx tsc --noEmit` — zero errors in `~/Desktop/alloro-leadgen-tool`
- [ ] Manual: local audit on Coastal Endo. The `competitor_map` stage shows "Cross-referencing your practice against N local competitors. Compiling website + GBP insights…" (or equivalent honest copy) for the entire 50-second tail. No more "Mapping 4 competitors / Analyzing review volume and market position" once the map is on screen.
- [ ] Manual: local audit on Artful. Worker log shows `stripMarkup` reduction ≥70% (target 30 kB or smaller stripped).
- [ ] Manual: local audit on Artful. Worker log shows `[B] image resized for Claude: desktop=NkB` where N ≤ 50 (down from ~80).
- [ ] Manual: local audit on Artful. `[B] WebsiteAnalysis LLM` time drops ≥15% vs baseline (baseline ~26s → target ≤22s).
- [ ] Manual: pillar grades on Artful's dashboard match the pre-change baseline within one letter grade per pillar (no quality regression).
- [ ] No regression on Coastal Endo's stealth-fallback flow — still completes via stealth, dashboard renders correctly.

## Revision Log

(empty — to be added if scope changes during execution)
