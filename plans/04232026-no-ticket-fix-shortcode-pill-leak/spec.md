# Fix shortcode pill leaking to public pages

## Why
Editor-only "DOCTORS BLOCK" / "SERVICES BLOCK" / "REVIEWS" pill labels are rendering on published sites (e.g. calm-clinic-3597.sites.localhost:7777). Introduced by e1b8b043 (2026-04-21).

## What
- Pills stop polluting `website_builder.pages.sections[].content` at save time.
- Existing polluted rows get cleaned up via a one-shot script.
- Public-site output returns to clean shortcode-resolved HTML.

## Context

**Relevant files:**
- `frontend/src/utils/templateRenderer.ts` — `renderShortcodePlaceholders` emits the pill (editor preview only).
- `frontend/src/utils/htmlReplacer.ts` — `extractSectionsFromDom` + `restoreShortcodeTokens` is the save-path extractor that was supposed to strip any preview wrapper.
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts:907-914` — `wrapResolved`, the existing contract that emits `data-alloro-shortcode-original="ENCODED_TOKEN"` on resolved wrappers. This is the attribute `restoreShortcodeTokens` matches.
- `scripts/debug-warmup/fix-one-endo-homepage.ts` — reference analog for one-shot DB fix script style.
- `scripts/debug-warmup/audit-template-shortcodes.ts` — reference analog for cheerio-based section walker.

**Patterns to follow:**
- Scripts use `dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" })`, import `db` from `../../src/database/connection`, end with `await db.destroy()`, catch + `process.exit(1)`.
- Parse HTML with cheerio (already a dep), not regex, for anything nested.

**Reference file:** `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts:907-914` (`wrapResolved`) — defines the `data-alloro-shortcode-original` contract the pill needs to honor.

## Constraints

**Must:**
- Pill continues to look identical in the editor iframe (no visual regression).
- `restoreShortcodeTokens` handles nested divs correctly — fixes `wrapResolved` output path too as a necessary side-effect.
- Cleanup script defaults to dry-run; `--apply` flag required to mutate.

**Must not:**
- Touch the public-site renderer (`website-builder-rebuild/*`).
- Touch `wrapResolved` or any backend shortcode resolver logic.
- Add new dependencies.

**Out of scope:**
- Changing shortcode token syntax.
- Refactoring the preview pipeline generally.

## Risk

**Level:** 2

**Risks identified:**
- `restoreShortcodeTokens`'s lazy `[\s\S]*?</div>` regex is already broken for `wrapResolved` output (multi-div resolved post cards) → **Mitigation:** rewrite with `DOMParser` so both call paths get a correct implementation. This is the same function, not a drive-by.
- Cleanup script misfires against a non-polluted row (idempotency) → **Mitigation:** cleanup only matches rows where `<div ... data-alloro-shortcode="..." ...>` actually appears; no-op on clean rows. Multi-pass loop until fixed-point handles accidental nested pills from repeated saves.
- Script points at prod DB by mistake → **Mitigation:** require explicit `--apply`; print DB host + affected row count before mutating.

**Blast radius:**
- `renderShortcodePlaceholders` — called once, from `renderPage` in the same file (editor iframe only).
- `restoreShortcodeTokens` — called twice from `extractSectionsFromDom` (both editor DFYWebsite + admin PageEditor save flows).
- Cleanup script — reads/writes `website_builder.pages.sections` jsonb. No other tables.

## Tasks

### T1: Emit restorable attribute on pill
**Do:** In `renderShortcodePlaceholders`, add `data-alloro-shortcode-original="${escapedRawForAttr}"` to the outer wrapper div, where `escapedRawForAttr` also escapes `"` as `&quot;` (not just `& < >`).
**Files:** `frontend/src/utils/templateRenderer.ts`
**Depends on:** none
**Verify:** `cd frontend && npx tsc --noEmit` — zero errors.

### T2: Rewrite restorer to handle nested divs
**Do:** Replace the regex in `restoreShortcodeTokens` with a `DOMParser`-based walker: find every element with `[data-alloro-shortcode-original]`, replace it (outer node, including all children) with a text node carrying the decoded original token.
**Files:** `frontend/src/utils/htmlReplacer.ts`
**Depends on:** none (parallel-safe with T1)
**Verify:** `cd frontend && npx tsc --noEmit` — zero errors.

### T3: One-shot DB cleanup script
**Do:** Create `scripts/debug-warmup/unpollute-shortcode-pills.ts`. For each row in `website_builder.pages`, walk sections, strip every `<div ... data-alloro-shortcode="(post_block|review_block|menu)" ...>...</div>` pill wrapper via cheerio, restoring the inner raw `{{ ... }}` or `[...]` token (unescape `&amp; &lt; &gt;`). Loop per-section until fixed-point to handle double-pilled rows. Default dry-run; `--apply` to write. Log DB host + counts.
**Files:** `scripts/debug-warmup/unpollute-shortcode-pills.ts` (new)
**Depends on:** none (independent of frontend work)
**Verify:** Manual — `npx tsx scripts/debug-warmup/unpollute-shortcode-pills.ts` (dry-run) prints affected pages. User runs `--apply` when ready.

## Done
- [ ] `cd frontend && npx tsc --noEmit` — zero errors from these changes.
- [ ] Pill in `renderShortcodePlaceholders` carries `data-alloro-shortcode-original="…"` holding the encoded raw token.
- [ ] `restoreShortcodeTokens` unwraps any `[data-alloro-shortcode-original]` element (and all its children) to the decoded raw token string.
- [ ] Cleanup script exists under `scripts/debug-warmup/`, defaults to dry-run, requires `--apply` to mutate, prints affected row count.
- [ ] Manual: after the code fix, opening a polluted page in the editor and saving it again produces clean section HTML in the DB (the next save via the fixed restorer is the functional test).
