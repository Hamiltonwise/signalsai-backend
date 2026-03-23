# AI Command — Tools Split (UI Checker + Link Checker)

## Why
The current AI Command does everything in one "Analyze" flow — content editing, page creation, link fixing, UI issues. This makes it hard to run targeted checks. Users need three distinct tools:
1. **AI Editor** — the current prompt-driven analysis + execution (existing)
2. **UI Checker** — checks HTML structure/markup integrity, layout issues, responsive problems
3. **Link Checker** — validates all internal links, finds 404s, suggests correct replacements

Each produces its own batch with approve/reject/execute.

## What
Split the AI Command history view into three "New" buttons. Each creates a different batch type with its own analyzer. Same approve/reject/execute flow, same batch persistence.

## Context

**Relevant files:**
- `signalsai/src/components/Admin/AiCommandTab.tsx` — history view with "New Analysis" button
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts` — `createBatch()` + `analyzeBatch()`
- `signalsai-backend/src/utils/website-utils/builtinAnalyzer.ts` — deterministic flag checks
- `signalsai-backend/src/utils/website-utils/aiCommandService.ts` — LLM analysis

## Constraints
**Must:** Same batch/recommendation DB tables, same approve/reject/execute UI, same tool badges.
**Must not:** Break existing AI Editor flow, add new DB tables.

## Risk
**Level:** 2 — Medium scope, no architectural changes, mostly new analyzer functions + UI wiring.

## Tasks

### T1: Batch type field
**Do:** Add `batch_type` column to behavior — use the existing `targets` JSONB field to store `{ type: "ai_editor" | "ui_checker" | "link_checker", ... }`. No migration needed.

In `createBatch()`, accept a `type` parameter. In `analyzeBatch()`, branch on type:
- `ai_editor` → existing flow (prompt + LLM analysis + structural + built-in flags)
- `ui_checker` → new `analyzeUiIntegrity()` function
- `link_checker` → new `analyzeBrokenLinks()` function

**Files:** `service.ai-command.ts`
**Verify:** Batch creation accepts type, analysis branches correctly

### T2: UI Checker analyzer
**Do:** Create `signalsai-backend/src/utils/website-utils/uiChecker.ts`

Analyzes HTML structure for layout/markup issues. No LLM needed — pure HTML/CSS analysis.

**Checks:**
1. **Missing container constraints** — sections without `max-w-*` or container classes
2. **Text without width constraint** — `<p>`, `<h1>`-`<h6>` not inside a width-constrained parent
3. **Overlapping absolute/fixed elements** — multiple `absolute` or `fixed` positioned elements in same parent
4. **Missing responsive classes** — grid/flex without responsive breakpoints (`md:`, `lg:`)
5. **Duplicate CSS classes** — same Tailwind class repeated in one element's class list
6. **Empty visible elements** — elements with alloro-tpl classes but no text content or children
7. **Broken Tailwind patterns** — conflicting utilities (e.g., both `px-6` and `px-8` on same element)
8. **Missing section structure** — `data-alloro-section` attribute missing on section roots
9. **Inline styles** — `style=""` attributes that should be Tailwind classes
10. **Image without dimensions** — `<img>` missing width/height (causes layout shift)

Each issue produces a recommendation with:
- `flagType: "fix_ui"`
- Clear instruction on what to fix
- The affected HTML

**Files:** `signalsai-backend/src/utils/website-utils/uiChecker.ts`
**Verify:** Returns structured recommendations

### T3: Link Checker analyzer
**Do:** Create `signalsai-backend/src/utils/website-utils/linkChecker.ts`

Validates all internal links across the entire site. No LLM needed.

**Process:**
1. Extract all `href` values from all pages, layouts, posts
2. Build a map of all valid internal paths: page paths + `/{post_type_slug}/{post_slug}` combos
3. For each internal link (`/...`), check if it exists in the valid paths map
4. For broken links, try to infer the correct path:
   - Fuzzy match against existing paths (Levenshtein distance)
   - Try common path variations (`/about` vs `/about-us`, `/services` vs `/our-services`)
   - Check if it matches a redirect's `from_path`
5. Produce recommendations:
   - `fix_broken_link` with suggested replacement URL
   - User can approve the suggestion or manually enter a different URL (same reference_url input pattern)

**Recommendation format:**
```
Broken link: "/sterling" in Layout > Footer
Suggested fix: "/locations/sterling-office" (closest match)
[Approve suggestion] or [Enter custom URL]
```

**Files:** `signalsai-backend/src/utils/website-utils/linkChecker.ts`
**Verify:** Finds broken links, suggests corrections

### T4: Frontend — three tool buttons on history view
**Do:** Update `AiCommandTab.tsx` history view:

Replace the single "New Analysis" button with three buttons:
- "AI Editor" (sparkles icon) — opens the prompt input view (existing flow)
- "UI Check" (layout icon) — runs UI checker immediately on all pages/layouts (no prompt needed)
- "Link Check" (link icon) — runs link checker immediately on all pages/layouts/posts (no prompt needed)

UI Check and Link Check don't need a prompt input — they go straight from button click to analyzing state. Target selection (pages/posts/layouts) still available for all three.

Batch cards in history show the tool type: "AI Editor", "UI Check", or "Link Check" badge.

**Files:** `signalsai/src/components/Admin/AiCommandTab.tsx`, `signalsai/src/api/websites.ts`
**Verify:** Three buttons render, each creates correct batch type

### T5: Link Checker — manual URL input for unfixable links
**Do:** For `fix_broken_link` recommendations where no auto-suggestion exists, show a URL input (same pattern as `NEEDS_INPUT` for menu items). User types the correct URL, approves, execution replaces the link.

For recommendations WITH auto-suggestions, show the suggestion as pre-filled text that the user can accept or modify.

**Files:** `signalsai/src/components/Admin/AiCommandTab.tsx`
**Verify:** Link fix suggestions show with editable URL field

## Done
- [ ] Three tool buttons on history view
- [ ] AI Editor creates `ai_editor` batch (existing flow unchanged)
- [ ] UI Check creates `ui_checker` batch, runs HTML structure analysis
- [ ] Link Check creates `link_checker` batch, finds broken links with suggestions
- [ ] All three share the same approve/reject/execute flow
- [ ] Batch history shows tool type badge
- [ ] Link checker suggestions are editable before approval
- [ ] `npx tsc --noEmit` passes
