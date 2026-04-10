# Conditional Rendering for Post Tokens

## Why
Post blocks and single post templates have no way to hide markup when a field or custom field is empty. Today `{{post.featured_image}}` resolves to `""` but the wrapping `<img src="">` still renders as a broken image. Template authors need a way to conditionally render markup so empty fields don't leave visual artifacts (e.g., broken images, empty `<p>` tags, orphan labels like "Video:" with no video below them).

## What
Introduce a flat `{{if post.X}}...{{endif}}` / `{{if_not post.X}}...{{endif}}` block syntax that is evaluated before token replacement. Supports all standard `post.*` tokens and `post.custom.<slug>` tokens. Works identically in:

- Production post blocks (website-builder-rebuild)
- Production single post pages (website-builder-rebuild)
- Editor page preview with embedded post block shortcodes (alloro backend)
- Editor post block template preview (alloro frontend, client-side)
- Editor single post template preview (alloro frontend, client-side)

Nesting is **not** supported in v1. Nested blocks are detected and logged as a warning; the affected HTML passes through unchanged so the author sees the unresolved tokens in the output (loud failure).

## Context

**Relevant files:**

Production renderer (`/Users/rustinedave/Desktop/website-builder-rebuild`):
- `src/utils/shortcodes.ts` — `renderPostBlockHtml()` at line 138 is the single point of `{{post.*}}` token replacement. Consumed by:
  - `src/services/postblock.service.ts:400` — loop template iteration in post blocks
  - `src/routes/site.ts:254` — single post sections during `assembleSinglePostHtml`

Alloro backend editor preview (`/Users/rustinedave/Desktop/alloro`):
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts` — `renderPostBlock()` at line 224 handles page-preview shortcode resolution. Consumed by `resolvePostBlocks()` in the same file, invoked from `UserWebsiteController.resolvePreview()` at `src/controllers/user-website/UserWebsiteController.ts:712`.

Alloro frontend editor preview:
- `frontend/src/components/Admin/PostBlocksTab.tsx` — `replacePlaceholders()` at line 115 is the client-side token replacer used by BOTH the post block editor preview (line 211) and the single template editor preview (line 364). `PLACEHOLDER_POST` is a dict keyed by literal token strings (e.g., `"{{post.title}}"` → `"Sample Title"`).
- `frontend/src/pages/admin/AlloroPostsDocs.tsx` — user-facing docs for post tokens; add conditional syntax reference here.

**Patterns to follow:**
- Marker-based block processing — existing precedent is `{{start_post_loop}}...{{end_post_loop}}` in `renderPostBlock()` at `shortcodeResolver.service.ts:229-242` and the mirror in `postblock.service.ts:374-387`. The new `{{if}}` pass is the same shape: regex match, slice, rebuild.
- Pure regex replacement (no DOM parsing) — every existing token replacement is `String.replace`. Keep it that way.
- "Trusted admin content" posture — template authors are admins, so no escaping/sanitization of the conditional markers themselves.

**Reference file:** `website-builder-rebuild/src/utils/shortcodes.ts` — `renderPostBlockHtml()` is the canonical shape. The new `processConditionals()` helper lives in the same file as a sibling, invoked as the first line of `renderPostBlockHtml()`.

## Constraints

**Must:**
- Same syntax + semantics in all 3 copies. Header comment in each copy must name the other two locations so future edits stay synced.
- Evaluate conditionals **before** token replacement. The pass strips blocks whose field is empty; remaining blocks have their markers (`{{if ...}}`, `{{endif}}`) removed but inner content left intact for the subsequent token replacement to process.
- "Empty" = `null`, `undefined`, or empty string `""`. Explicitly NOT empty: `"0"`, `0`, `false`, `"false"`, whitespace-only strings, empty arrays/objects. Document this in the docs page and in each helper's header comment.
- Custom fields resolve via `post.custom.<slug>` → `custom_fields[slug]`. Frontend client-side preview resolves via lookup in `PLACEHOLDER_POST` using the literal token string as key; if absent, treat as empty (known preview limitation).
- Nesting detection — scan each matched block's content for `{{if ` or `{{if_not `. If found, log a warning (with the offending block's first 200 chars) and leave the ENTIRE input HTML untouched. Do not partially process.
- Final cleanup — after block processing, strip any orphan `{{if ...}}`, `{{if_not ...}}`, `{{endif}}` tokens left behind (shouldn't happen with valid templates, but defend against malformed input).
- The regex must be non-greedy (lazy) so `{{endif}}` matches the nearest closing marker.
- tsc clean in both repos.

**Must not:**
- No new dependencies (no Handlebars, no Mustache, no parser libs).
- No DOM/HTML parsing (no jsdom, no cheerio). Pure regex.
- No silent nesting support — don't "try to make it work." Loud failure was the explicit decision.
- No `{{else}}`, no comparison operators (`==`, `!=`, `>`, etc.), no logical ops (`&&`, `||`).
- No refactoring of existing token replacement logic in the 3 call sites beyond adding the conditional pre-pass.
- No shared package extraction. Three copies stay three copies for v1.
- No review_block / menu shortcode changes.

**Out of scope:**
- Review block conditional rendering (`{{if review.reply_text}}...{{endif}}`) — same problem exists but not requested. Follow-up spec.
- Nested conditionals.
- `{{else}}` branches. Authors use `{{if X}}...{{endif}}{{if_not X}}...{{endif}}` for now.
- Truthiness beyond emptiness (no `{{if post.featured == 'hero.jpg'}}`).
- Location-based featured image fallback (Option D from context-building) — template-land responsibility, not renderer.
- Updating the Alloro dental template itself to use the new syntax. That's a separate content task done by whoever owns template maintenance.

## Risk

**Level:** 2

**Risks identified:**
- **Logic drift between 3 copies** → **Mitigation:** Header comment in each copy naming the other two files. Identical test cases in each repo's test suite (where tests exist). Commit message explicitly lists all 3 files so reviewers catch partial changes.
- **Regex catches across section boundaries unexpectedly** → **Mitigation:** The lazy quantifier `[\s\S]*?` on the block body bounds each match to the nearest `{{endif}}`. Test with multi-section templates (section array joined with `\n`).
- **Empty-check semantics surprise authors** — `"0"` treated as non-empty may confuse authors coming from JS (`!"0"` is `false` in JS) → **Mitigation:** Document the empty definition prominently in `AlloroPostsDocs.tsx`. Be explicit: "only null, undefined, and empty string count as empty."
- **Nested block in existing template somewhere** → **Mitigation:** Grep all existing `post_blocks.sections` and `post_types.single_template` values in the DB during execution verification. Also — this can't happen organically since no author has written `{{if}}` yet. Safe.
- **Frontend preview shows stripped blocks for custom fields that aren't in `PLACEHOLDER_POST`** → **Mitigation:** Accept as a known preview limitation. Document in `AlloroPostsDocs.tsx`: "preview always treats custom fields as empty; live site reflects actual post data." Don't extend `PLACEHOLDER_POST` — that's a rabbit hole.

**Blast radius:**
- `shortcodes.ts:renderPostBlockHtml` consumers (2): `postblock.service.ts:400`, `site.ts:254`
- `shortcodeResolver.service.ts:renderPostBlock` consumers (1): `resolvePostBlocks()` in same file (invoked via `UserWebsiteController.resolvePreview`)
- `PostBlocksTab.tsx:replacePlaceholders` consumers (2): post block preview useEffect at ~211, single template preview useEffect at ~364

All existing templates (which have zero `{{if}}` tokens) pass through `processConditionals` unchanged — the regex matches nothing, the function is a no-op. Backward compat is free.

**Pushback:** None. Design was validated in context-building phase. Staying scoped.

## Tasks

### T1: Add processConditionals helper to production renderer
**Do:** In `shortcodes.ts`, add a new exported function `processConditionals(html: string, post: PostData): string` before `renderPostBlockHtml`. Implementation:
1. Fast path: if `!html.includes('{{if')` return html unchanged.
2. Regex: `/\{\{\s*(if|if_not)\s+post\.([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*endif\s*\}\}/g`
3. For each match: check the captured body for a nested `{{if ` or `{{if_not `. If found, `console.warn` with the field name and first 200 chars of the block, return the original `html` unchanged (full abort).
4. Resolve `post.X` — flat field (`title`, `slug`, `featured_image`, `excerpt`, `content`, `url`, `categories`, `tags`, `created_at`, `updated_at`, `published_at`) → `post[X]`. For `custom.Y` → `post.custom_fields[Y]`. Unknown field → undefined.
5. `isEmpty(v)` = `v === null || v === undefined || v === ''`.
6. For `if`: keep body if not empty, strip entire match if empty. For `if_not`: opposite.
7. After pass, final cleanup: strip any orphan `{{if ... }}`, `{{if_not ... }}`, `{{endif}}` tokens (regex `/\{\{\s*(if|if_not)\s+[^}]*\}\}|\{\{\s*endif\s*\}\}/g` → `""`).

Then modify `renderPostBlockHtml` to call `html = processConditionals(blockHtml, post)` as its first line, reassigning `blockHtml` to the result before the existing `.replace()` chain.

Header comment on `processConditionals`: list the two sibling copies in alloro (`shortcodeResolver.service.ts` + `PostBlocksTab.tsx`) and say "keep in sync."

**Files:** `/Users/rustinedave/Desktop/website-builder-rebuild/src/utils/shortcodes.ts`
**Depends on:** none
**Verify:** `cd /Users/rustinedave/Desktop/website-builder-rebuild && npx tsc --noEmit`

### T2: Port to alloro backend editor preview resolver
**Do:** In `shortcodeResolver.service.ts`, add a local (non-exported) `processConditionals(html, post, customFields)` function above `renderPostBlock`. Same logic as T1 but takes `customFields` as a separate arg (backend already parses them separately before calling `renderPostBlock` — see lines 245-248). Invoke at the top of `renderPostBlock`'s `posts.map` body, right after `customFields` is parsed and before the first `.replace()` call at line 260. Header comment names the other 2 sibling copies.

Also handle the `review_block` question: **don't touch `renderReviewBlock`** — explicitly out of scope. Leave it untouched.

**Files:** `/Users/rustinedave/Desktop/alloro/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
**Depends on:** T1 (shared reference semantics)
**Verify:** `cd /Users/rustinedave/Desktop/alloro && npx tsc --noEmit`

### T3: Port to alloro frontend client-side preview
**Do:** In `PostBlocksTab.tsx`, add a local `processConditionals(html, placeholderPost)` helper above `replacePlaceholders` at line 115. It resolves fields by looking up literal token strings in `PLACEHOLDER_POST` — e.g., `post.featured_image` → check `placeholderPost["{{post.featured_image}}"]`. If key absent or value is empty string → empty. For `post.custom.<slug>` → check `placeholderPost["{{post.custom.<slug>}}"]`, same rule (almost always absent → treated as empty, which is the documented preview limitation).

Invoke at the top of `replacePlaceholders` in BOTH code paths:
- Loop path (line 121-135): call once on the `template` slice before the `PREVIEW_POSTS.map`, AND call per-post inside the map using that post's placeholder dict (so different preview posts with different placeholder values can have different conditional outcomes). Actually — on reread, all preview posts share the same field shape and only title/url/featured_image differ. Call per-post for correctness.
- Fallback path (line 138-142): call once on `html` using `PLACEHOLDER_POST` before token replacement.

Header comment names the backend siblings.

**Files:** `/Users/rustinedave/Desktop/alloro/frontend/src/components/Admin/PostBlocksTab.tsx`
**Depends on:** T1, T2 (semantic alignment)
**Verify:** `cd /Users/rustinedave/Desktop/alloro && npx tsc --noEmit`. Manual: open post block editor in dev, add `{{if post.featured_image}}<img src="{{post.featured_image}}"/>{{endif}}` — verify image renders (PLACEHOLDER_POST has featured_image values). Add `{{if post.custom.video_url}}<div>VIDEO</div>{{endif}}` — verify the div does NOT render (custom field not in placeholder).

### T4: Document the new syntax
**Do:** In `AlloroPostsDocs.tsx`, add a new section titled "Conditional Rendering" explaining:
- Syntax: `{{if post.X}}...{{endif}}` and `{{if_not post.X}}...{{endif}}`
- Empty definition: null / undefined / empty string → empty. `"0"`, `0`, `false` → NOT empty.
- Custom fields: `{{if post.custom.<slug>}}...{{endif}}`
- Flat only — no nesting in v1. Nested blocks will fail loudly (author will see unrendered tokens).
- Preview limitation: editor preview always treats custom fields as empty because placeholder data doesn't include them. Live site reflects actual post data.
- Example 1 — featured image with fallback:
  ```
  {{if post.featured_image}}
    <img src="{{post.featured_image}}" alt="{{post.title}}" />
  {{endif}}
  {{if_not post.featured_image}}
    <div class="location-hero">...</div>
  {{endif}}
  ```
- Example 2 — video embed:
  ```
  {{if post.custom.video_url}}
    <div class="video-wrapper">{{post.video_embed}}</div>
  {{endif}}
  ```

**Files:** `/Users/rustinedave/Desktop/alloro/frontend/src/pages/admin/AlloroPostsDocs.tsx`
**Depends on:** T1, T2, T3 (docs should describe actual behavior)
**Verify:** `cd /Users/rustinedave/Desktop/alloro && npx tsc --noEmit`. Manual: docs page renders, new section is visible.

## Done
- [ ] `cd /Users/rustinedave/Desktop/website-builder-rebuild && npx tsc --noEmit` — zero errors
- [ ] `cd /Users/rustinedave/Desktop/alloro && npx tsc --noEmit` — zero errors
- [ ] `processConditionals` exists in all 3 locations with header comments cross-referencing each other
- [ ] Manual: test post with `featured_image = null` wrapped in `{{if post.featured_image}}...{{endif}}` — image block hidden on production single post view
- [ ] Manual: same test with `{{if_not post.featured_image}}<div>fallback</div>{{endif}}` — fallback visible
- [ ] Manual: post with empty custom field wrapped in `{{if post.custom.video_url}}...{{endif}}` — block hidden in post block list on production
- [ ] Manual: post with `custom_fields.some_number = 0` wrapped in `{{if post.custom.some_number}}...{{endif}}` — block VISIBLE (0 is not empty)
- [ ] Manual: intentional nested template `{{if post.a}}{{if post.b}}...{{endif}}{{endif}}` in editor preview — console warning logged, raw tokens visible in preview (loud failure confirmed)
- [ ] Manual: editor post block preview renders conditional blocks correctly using PLACEHOLDER_POST
- [ ] Manual: editor single template preview renders conditional blocks correctly
- [ ] Docs section visible in `AlloroPostsDocs` with all examples and caveats
- [ ] No regressions: existing templates (no `{{if}}` tokens) render identically to before
