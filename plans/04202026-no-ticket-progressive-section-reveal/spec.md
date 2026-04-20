# Progressive Section Reveal During Page Generation

## Why
Today, when a page generates, the admin sees a single "Building page…" card
with a progress counter (e.g., `section-gallery (9/11)`). Once the page
completes, the viewport jumps to the top to show the finished page. That's
a bad build experience: (a) the admin can't see which sections are
finished vs. pending, (b) each completed section triggers a scroll jump,
(c) there's no visual continuity between "building" and "built" states.

## What
Render the page's section order as soon as generation starts. Each section
shows its template default HTML with a shimmer/building indicator overlay.
As sections complete, their actual generated HTML replaces the shimmer in
place (no scroll jump), with a subtle animated entrance on the newly-
completed section. The progress card disappears once all sections are
ready.

## Context

**Relevant files:**
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts`
  — lines ~402-413: after each component generates, writes the complete
  `generatedSections` array back to `website_builder.pages.sections` as
  JSONB. Also updates `generation_progress` with
  `{total, completed, current_component}`. **The per-section HTML is
  already streamed server-side** — no backend streaming work needed.
- `frontend/src/pages/admin/WebsiteDetail.tsx` — currently renders the
  "Building page…" card during `IN_PROGRESS` status. Polls
  `pageGenStatuses` for per-page status; does not currently read the
  `sections` JSONB mid-generation.
- `src/models/website-builder/PageModel.ts` (to confirm) — need to check
  whether the admin page-read endpoint exposes `sections` + `generation_progress`
  on pages that are still in-flight. If not, extend the read.
- `frontend/src/components/Admin/` — existing preview components (if any)
  to pattern-match for embedding iframe/live HTML rendering.

**Patterns to follow:**
- `framer-motion` already used extensively (`IdentityModal.tsx`, slide-up
  source editor) — use `AnimatePresence` + `motion.div` for section
  entrance.
- Polling lives on the parent `WebsiteDetail.tsx` — reuse the existing
  status-polling useEffect rather than adding a new polling loop.
- The page's template (via `template_page_id`) exposes its section/
  component order — need to confirm whether the template's sections are
  retrievable from the page row or require a separate template fetch.

**Reference file:** `frontend/src/components/Admin/LayoutInputsModal.tsx`
— recent pattern for surfacing generation status + progress inside a
scoped UI shell.

## Constraints

**Must:**
- No backend streaming work — reuse the existing `sections` JSONB
  per-component updates already written by the generator.
- Scroll position stays put as sections complete; no jump-to-top behavior.
- Section identity is preserved: a section that was rendering shimmer and
  then completes keeps the same DOM node — replacing children, not
  re-rendering the whole container. (Prevents the animation from feeling
  like a wholesale remount.)

**Must not:**
- Don't add SSE or WebSockets — polling is sufficient.
- Don't animate scroll (the whole point is to NOT scroll).
- Don't refactor the generation pipeline — this is frontend-only.
- Don't change the template default HTML anywhere.

**Out of scope:**
- Inline "edit while building" — editing stays disabled until the page is
  ready, as today.
- Mobile-specific preview differences.
- Previewing the published URL from inside this view (already exists
  elsewhere).

## Risk

**Level:** 2

**Risks identified:**
- **Template default HTML not easily accessible client-side.** Each
  template_page has section definitions (with markup) that need to be
  fetchable so we can render the placeholder. → **Mitigation:** confirm
  during Phase 1 of execution whether the existing page-read endpoint
  includes template section markup; if not, extend the endpoint
  (minimally — read-only addition).
- **Polling cadence vs. animation timing.** Poll every 1.5-2s (matches
  existing status polling) — risk of two adjacent sections "popping" at
  once. → **Mitigation:** animate by section, not by tick — compare
  previous `sections.length` vs. new to identify just-completed sections.
- **Shimmer overlay ambiguity** — admin could think the greyed-out HTML
  IS the final output. → **Mitigation:** clear "Building…" label per
  section + muted opacity so it's visually distinct from the "done" state.

**Blast radius:** Admin `WebsiteDetail.tsx` page-generation area only.
Isolated from publish/preview flows. No end-user impact (this is admin
UX).

## Tasks

### T1: Confirm/extend page-read to surface in-flight state
**Do:**
- Confirm whether `fetchWebsiteDetail(websiteId)` (or whichever endpoint
  `WebsiteDetail.tsx` uses to list pages) returns each page's `sections`
  JSONB and `generation_progress` fields for IN_PROGRESS pages.
- If missing, extend the controller/model to include them.
- Also confirm whether the page's template section definitions
  (name + default markup) are reachable client-side. If not, expose
  `template_page_sections` (name + template_markup) on the page read —
  read-only, no write.

**Files:** likely `src/controllers/admin-websites/AdminWebsitesController.ts`,
`src/models/website-builder/PageModel.ts`, `frontend/src/api/websites.ts`.

**Depends on:** none.

**Verify:** Hit the endpoint during a generation run (or manually insert a
stub in-flight page). Response contains the partial `sections` array +
per-section template markup.

### T2: New `<ProgressiveSectionPreview>` component
**Do:**
- New file `frontend/src/components/Admin/ProgressiveSectionPreview.tsx`.
- Props: `page: { id, template_sections: Array<{name, markup}>, sections: Array<{name, content}>, generation_progress }`.
- Renders one container per template section. For each:
  - If section is in `page.sections` → render its `content` HTML inside
    a styled container (iframe or sandboxed div — match existing page
    preview pattern).
  - If not yet in `page.sections` → render the template `markup` as HTML
    with a muted opacity + "Building…" label overlay + shimmer animation.
- Use `AnimatePresence` from framer-motion to fade-in newly-completed
  sections. Key by section name so React doesn't remount.

**Files:** `frontend/src/components/Admin/ProgressiveSectionPreview.tsx` (new).

**Depends on:** T1.

**Verify:** Storybook-style isolated render: pass a mock page with
`sections.length === 3 && template_sections.length === 11` → see 3
rendered + 8 shimmering.

### T3: Wire into `WebsiteDetail.tsx`
**Do:**
- Replace the existing "Building page…" card with the new component when
  the page is IN_PROGRESS.
- Keep the progress counter visible at the top (fixed or sticky) so the
  admin sees "9/11" without losing the per-section view.
- Remove the scroll-to-top-on-ready behavior if present; the page is
  already visible.

**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`.

**Depends on:** T2.

**Verify:** Manual — start a page generation on Coastal, watch sections
populate in place without scrolling.

### T4: Polling cadence + completed-section detection
**Do:**
- In the existing status-polling useEffect, detect which section names
  were just added (diff previous vs. new `sections.length`/names).
- Pass the "just-completed" set down to `ProgressiveSectionPreview` as a
  prop so it can target animation entrance only to those.

**Files:** `frontend/src/pages/admin/WebsiteDetail.tsx`,
`frontend/src/components/Admin/ProgressiveSectionPreview.tsx`.

**Depends on:** T2, T3.

**Verify:** Manual — only the newly-arrived section animates; previously-
completed ones stay static.

## Done
- [ ] `npx tsc --noEmit` zero errors (both backend + frontend)
- [ ] Generating a page on Coastal shows all template sections from tick
  zero, with shimmers on not-yet-built sections
- [ ] Each completed section pops into place without scrolling the viewport
- [ ] Only the just-completed section animates; older completed sections
  don't re-animate on subsequent polls
- [ ] Progress counter still visible (e.g., sticky top)
- [ ] No regressions on page list view (pages tab, Pages index)
