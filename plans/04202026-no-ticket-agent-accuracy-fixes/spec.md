# Agent Accuracy Fixes — Button Consistency, Shortcode Fallback, Inline-Style Ban, Whole-Page Critic

## Why
The first generated homepage (Coastal, `calm-beauty-2180.sites.getalloro.com`)
shipped with four systemic accuracy problems: button shape drift across
sections (rounded-full vs rounded-lg on the same page), an entire section
hand-rolled instead of using template structure, doctor/service shortcode
slots left empty or fabricated, alt-text hallucinated, and inline
`style="..."` attributes despite an explicit ban. Per-section Critic passes
can't see cross-section inconsistency. All of these trace back to
under-constrained prompts + a Critic that skips rules listed in the
generator.

## What
Tighten `ComponentGenerator.md` + `ComponentCritic.md`, add a deterministic
post-gen HTML normalizer (cheerio), and add a whole-page Critic pass.
Re-running page generation on a clean project produces buttons of a single
shape, no inline styles, shortcodes emitted where expected, alt text
grounded in the manifest, and template sections preserved rather than
reinvented.

## Context

**Relevant files:**
- `src/agents/websiteAgents/builder/ComponentGenerator.md` — per-component
  system prompt. No rules on button shape; ban on inline styles; template
  fidelity rule exists but doesn't cover thin/empty slot case.
- `src/agents/websiteAgents/builder/ComponentCritic.md` — per-section
  critic, 9 checks, no inline-style or button-shape rules.
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts`
  — orchestrates components; runs Critic after each component at
  `runCritique()` (lines ~637-680). Would be the place to plug in the
  normalizer step and the whole-page critic.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts`
  — stable identity block; already covers colors, voice, multi-location,
  doctors/services enrichment.

**Patterns to follow:**
- Prompt files under `src/agents/websiteAgents/builder/` are Markdown;
  loaded via `loadPrompt("websiteAgents/builder/Name")`.
- New pipeline steps follow the existing "runFoo(ctx)" helper pattern
  inside `service.generation-pipeline.ts`.
- cheerio is already used (`util.image-processor.ts`, `util.identity-context.ts`).

**Reference file:** `src/controllers/admin-websites/feature-utils/util.url-block-detector.ts`
— closest existing analog for a pure HTML-analysis utility (cheerio
parse + rule checks → verdict).

## Constraints

**Must:**
- Prompt edits are additive / strengthening — no removing existing rules.
- Normalizer is deterministic and idempotent — running twice yields the
  same output.
- Whole-page Critic runs once per page after all components complete.
- Normalizer runs BEFORE Critic so Critic evaluates the normalized HTML.

**Must not:**
- Don't change the component generation model (stays Sonnet 4.6).
- Don't change identity schema (no `brand.button_radius` field — deferred).
- Don't introduce new dependencies (cheerio already present).
- Don't retroactively edit published pages — changes apply to future gens.

**Out of scope:**
- `brand.button_radius` identity field (deferred to a future plan; prompt
  contract + critic check cover 90% without it).
- Template shortcode annotations (covered by separate plan
  `04202026-no-ticket-template-shortcode-audit`).
- Progressive section reveal UX (separate plan).

## Risk

**Level:** 2

**Risks identified:**
- **Prompt changes may regress good output.** Critic checks tightening can
  cause previously-passing components to fail. → **Mitigation:** new
  Critic checks emit the specific failure code (`INLINE_STYLE_USED`,
  `BUTTON_SHAPE_DRIFT`) so failures are debuggable; keep max retry behavior
  unchanged (re-gen on failure, don't block forever).
- **Normalizer may over-reach** and strip styles the template itself
  defined. → **Mitigation:** whitelist `<section>`-level inline styles that
  reference CSS variables (`style="background: var(--...)"`). Only strip
  LLM-emitted inline styles.
- **Whole-page Critic adds latency + cost** — one extra LLM call per page.
  → **Mitigation:** run it only once at the end, not per-component. Use
  Haiku or a smaller model since it's a binary-ish pass/fail structural
  check rather than content evaluation.

**Blast radius:** `service.generation-pipeline.ts` orchestration; prompt
files (only these two). Every future page generation on every project runs
the new prompts + normalizer + whole-page critic. No existing data mutated.

## Tasks

### T1: ComponentGenerator.md — four contract additions
**Do:**
- Add **Button System (MANDATORY)** section: two allowed shapes (rounded-full
  pill, rounded-lg rectangle), two variants each (primary filled / secondary
  outlined). Rule: pick ONE shape per page, apply everywhere. Badges are
  `<span>`, never `<a>`.
- Strengthen **Template Structural Fidelity**: if template section is a thin
  wrapper with only heading + shortcode slot / empty region, customize
  headings only, preserve slot verbatim. Don't invent cards/grids to fill
  empty slots.
- Add **Shortcode Emission Fallback**: doctors → `[post_block type="doctors"]`,
  services → `[post_block type="services"]`, reviews → `[review_block]`.
  If template region expects these types but shortcode token is absent,
  emit the shortcode yourself rather than fabricating cards.
- Add **Alt-Text Grounding**: alt attributes use image manifest `description`
  field verbatim (truncate to 120 chars). Do not invent from use_case or
  business name.

**Files:** `src/agents/websiteAgents/builder/ComponentGenerator.md`
**Depends on:** none
**Verify:** Manual — diff shows four new/strengthened sections; no existing
content removed.

### T2: ComponentCritic.md — two new checks
**Do:**
- Add check #10 **No inline styles**. Scan for `style="..."`. Allowed
  exceptions: section-level `style` referencing CSS variables (e.g.,
  `style="background: var(--gradient-bg)"`). Any other → fail with
  `INLINE_STYLE_USED`.
- Add check #11 **Button shape consistency**. Collect every `<a>`/`<button>`
  with padding utilities. If both `rounded-full` and
  `rounded-lg`/`rounded-xl`/`rounded-md` present → fail with
  `BUTTON_SHAPE_DRIFT`.

**Files:** `src/agents/websiteAgents/builder/ComponentCritic.md`
**Depends on:** T1 (generator must be teaching the rule before critic
enforces it)
**Verify:** Manual — prompt contains checks #10 + #11 with the failure
codes.

### T3: Post-gen HTML normalizer
**Do:**
- New file `src/controllers/admin-websites/feature-utils/util.html-normalizer.ts`.
- Export `normalizeComponentHtml(html: string, opts: { preservedShortcodes?: string[] }): string`.
- Rules (cheerio):
  1. Convert obvious credential/tag pills from `<a>` without href to `<span>`.
  2. Strip `style="..."` attributes EXCEPT when on a direct `<section>`
     child and the style value starts with `background: var(`.
  3. For every `<a>` / `<button>` with `rounded-lg` or `rounded-xl` on the
     page, track the dominant radius — if mixed, normalize to whichever
     appears first in the page (don't invent a new one; minimize surprise).
- Wire into `service.generation-pipeline.ts` between Generator response
  and Critic invocation — so Critic evaluates normalized output.

**Files:**
- `src/controllers/admin-websites/feature-utils/util.html-normalizer.ts` (new)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (wire)

**Depends on:** none (can land independently of T1/T2; works even if LLM
drift persists).

**Verify:** `npx tsc --noEmit` clean. Manual: generate one page on Coastal,
confirm (a) no `style="..."` in output, (b) button shapes uniform, (c)
credential pills are `<span>` not `<a>`.

### T4: Whole-page Critic pass
**Do:**
- New prompt `src/agents/websiteAgents/builder/WholePageCritic.md`. Inputs:
  the complete page HTML (concatenated normalized sections) + stable
  identity block. Output: JSON `{ pass: bool, issues: [{code, detail}] }`.
  Checks: button-shape uniformity, shortcode presence for expected content
  types, section-count-vs-template match, no duplicated primary CTAs.
- New pipeline function `runWholePageCritic(pageId, finalHtml, identity)`
  in `service.generation-pipeline.ts`, invoked once after all components
  complete and BEFORE `generation_status` flips to `ready`.
- On fail: log the issues to `page_generation_logs` (or the closest
  existing log sink), flip status to `ready` anyway (soft gate — don't
  block publish; admin will see the flags).

**Files:**
- `src/agents/websiteAgents/builder/WholePageCritic.md` (new)
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` (new function + wiring)

**Depends on:** T3 (critic should evaluate normalized, not raw, HTML)

**Verify:** Trigger one page gen on Coastal. Confirm log entry contains
critic verdict. Confirm page still publishes even when critic fails.

## Done
- [ ] `npx tsc --noEmit` zero errors
- [ ] T1 + T2 prompt files updated; no existing rules removed
- [ ] T3 normalizer unit-tested manually: input HTML with inline styles +
  mixed button radii produces clean output
- [ ] T4 whole-page critic runs once per page, results logged
- [ ] Manual regression: generate a fresh homepage on Coastal and confirm
  (a) no `style="..."` in DOM, (b) buttons uniformly shaped, (c) doctor
  roster section emits `[post_block type="doctors"]` or preserves the
  template shortcode, (d) services section doesn't end up as heading-only
- [ ] No regressions on existing published pages (they're not re-generated;
  changes apply forward only)
