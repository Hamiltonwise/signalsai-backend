# Template Shortcode Audit — Mark Shortcode-Owned Regions

## Why
The agent-accuracy audit on Coastal's homepage revealed that three sections
(Specialists, Services, Footer columns) were either fabricated with
ad-hoc Tailwind or left as heading-only husks. Root cause: the template
sections have empty/thin regions where shortcodes were expected
(`[post_block type="doctors"]` etc.), but nothing in the template's HTML
tells either the LLM or the post-gen normalizer "this region is owned by
a shortcode — do not invent here." The LLM sees an empty heading + stub
and decides to fill it; the normalizer has no signal to undo that.

## What
Adopt a comment convention — `<!-- ALLORO_SHORTCODE: <type> -->` — placed
inside every template region that maps to a known shortcode. Run a
one-time audit across existing templates to apply the marker where it's
missing. Update `ComponentGenerator.md` + the post-gen normalizer (from
plan `04202026-no-ticket-agent-accuracy-fixes`) to recognize the marker
and either preserve or emit the corresponding shortcode token.

## Context

**Relevant files:**
- `website_builder.templates` / `website_builder.template_pages` tables
  — template HTML stored as text columns (`wrapper`, `header`, `footer`
  on templates; `template_markup` on template_pages).
- `src/agents/websiteAgents/builder/ComponentGenerator.md` — needs a
  recognition rule for the marker comment.
- `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
  — canonical list of supported shortcode types (read to enumerate the
  `<type>` vocabulary the marker accepts).
- `src/controllers/admin-websites/AdminWebsitesController.ts` — template/
  template_page read/write endpoints; used by the admin template editor.

**Patterns to follow:**
- HTML comment convention is already in use elsewhere in templates
  (`<!-- slot: xxx -->`, `<!-- data-slot-group -->`). Add
  `ALLORO_SHORTCODE:` as a distinct namespace so existing slot-parsing
  code isn't confused.
- One-off audit scripts live under `scripts/debug-warmup/` in this repo
  (see `inspect-identity.ts`, etc.).

**Reference file:** `scripts/debug-warmup/inspect-template.ts` — closest
analog for a template-introspection script.

## Constraints

**Must:**
- The `ALLORO_SHORTCODE` comment value MUST be one of the known shortcode
  types (doctors, services, reviews, posts, menus, locations, …).
  Unknown types are a no-op warning, not an error.
- Audit is read-first, write-second — scan templates, produce a report
  of "candidate regions missing marker" for human review before applying.
- Applied markers are idempotent — re-running the audit on an already-
  annotated template does nothing.

**Must not:**
- Don't mass-rewrite template HTML without a review step. Template edits
  affect every project using that template.
- Don't remove existing `<!-- slot: ... -->` or `data-slot-group` comments.
- Don't introduce runtime dependency on the marker — the existing
  shortcode resolver continues to work unchanged. The marker is advisory
  metadata for the LLM and normalizer.

**Out of scope:**
- Creating new templates. This plan operates on existing ones.
- Changing the shortcode resolver's rendering behavior.
- Adding a UI for admins to mark regions (the admin template editor
  could expose a helper, but that's a follow-up).

## Risk

**Level:** 2

**Risks identified:**
- **Incorrect marker placement regresses a template.** Placing
  `ALLORO_SHORTCODE: doctors` where the admin actually wanted hand-authored
  content would suppress that content during generation. → **Mitigation:**
  audit produces a report first; apply changes only to regions the
  reviewer confirms. Keep a backup of each pre-change template row.
- **Marker vocabulary drift.** If a new shortcode type lands in
  `shortcodeResolver.service.ts` after this plan, templates won't
  auto-gain markers. → **Mitigation:** document the marker in the
  shortcode resolver's own file so the two stay linked.

**Blast radius:** Any template annotated. At time of writing, there are
likely 1-3 active templates (Alloro Dental Template is the main one);
changes apply to every project using that template's pages. Since the
LLM + normalizer changes from the sibling plan are additive (if marker
present → preserve; if absent → existing behavior), this plan is
forward-safe.

## Tasks

### T1: Define marker convention + shortcode vocabulary
**Do:**
- Create a short doc block at the top of
  `src/controllers/user-website/user-website-services/shortcodeResolver.service.ts`
  (or a new `docs/` file if the service file isn't the right home)
  listing: the comment format (`<!-- ALLORO_SHORTCODE: <type> -->`), the
  recognized vocabulary (pull from the resolver's supported types), and
  the contract ("LLM must preserve this region verbatim; post-gen
  normalizer verifies").

**Files:** the resolver file (or a new `docs/template-shortcode-markers.md`
if Dave prefers a free-standing doc).
**Depends on:** none.
**Verify:** Manual — file contains the full vocabulary with one-line
descriptions.

### T2: Audit script — scan templates for candidate regions
**Do:**
- New file `scripts/debug-warmup/audit-template-shortcodes.ts`.
- For each row in `templates` + `template_pages`:
  - Parse the HTML (cheerio).
  - Look for regions that match heuristics:
    - Heading matches `/doctors|meet the team|our team|providers/i` AND
      container has no shortcode/marker AND container is thin (only
      heading + subheading + CTA), → candidate: `doctors`.
    - Heading matches `/services|treatments|procedures/i` + same → `services`.
    - Heading matches `/reviews|testimonials/i` + same → `reviews`.
    - Footer columns with heading matches `/quick links|pages|services|team/i`
      and empty list body → candidate per heading.
- Emit a markdown report to stdout: `{template_id}/{template_page_id}:
  line N: candidate shortcode "doctors" at <selector>`.
- DO NOT auto-write markers. The reviewer decides which candidates to
  accept.

**Files:** `scripts/debug-warmup/audit-template-shortcodes.ts` (new).
**Depends on:** T1 (for the vocabulary).
**Verify:** Run `npx tsx scripts/debug-warmup/audit-template-shortcodes.ts`
— output lists candidate regions on the Alloro Dental Template.

### T3: Apply markers (one-off, reviewer-driven)
**Do:**
- After T2's report is reviewed, apply the agreed-upon markers directly
  in the template HTML (either via the admin template editor UI, or via
  a one-off write script that takes the marker list as input).
- Back up pre-change template rows (dump to `plans/.../backup-*.sql` or
  similar).

**Files:** none new — this is a data-update task.
**Depends on:** T2.
**Verify:** Re-run T2 audit — reports zero missing markers on the
reviewed templates.

### T4: Teach ComponentGenerator to recognize the marker
**Do:**
- Add a rule to `ComponentGenerator.md`: if the template region contains
  `<!-- ALLORO_SHORTCODE: <type> -->`, preserve it verbatim, do not
  generate child content for that region. If no shortcode token is
  already inside the marked region but the type is a known content type,
  emit `[post_block type="<type>"]` as the only content.
- If the sibling plan `agent-accuracy-fixes` has already added a
  shortcode fallback rule, extend it to reference the marker as the
  authoritative signal.

**Files:** `src/agents/websiteAgents/builder/ComponentGenerator.md`.
**Depends on:** T1. Coordinate with sibling plan T1 if that lands first.
**Verify:** Manual — generate a page on Coastal using a newly-marked
template; confirm doctor/service/review regions contain the expected
shortcode and nothing else.

### T5: Teach the normalizer to respect the marker
**Do:**
- If the sibling plan `agent-accuracy-fixes` built the post-gen
  normalizer (T3 there), extend it: when the input HTML contains an
  `ALLORO_SHORTCODE` marker but no shortcode token inside the marked
  region, inject the shortcode and strip any LLM-fabricated children.

**Files:** `src/controllers/admin-websites/feature-utils/util.html-normalizer.ts`.
**Depends on:** sibling plan's T3 landing first.
**Verify:** Feed the normalizer HTML with a marker + fabricated children
→ output contains only the shortcode.

## Done
- [ ] T1 doc block merged with the marker convention + vocabulary
- [ ] T2 audit script runs cleanly, produces a reviewable report
- [ ] T3 markers applied to reviewed templates; backups saved
- [ ] T4 ComponentGenerator recognizes the marker
- [ ] T5 normalizer respects the marker (if sibling plan merged)
- [ ] Manual: re-generate a Coastal homepage using the marked template;
  doctor/service/footer-columns regions render the correct shortcodes,
  no fabricated cards
