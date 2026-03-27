# AI Command — Built-in Analysis Flags

## Why
LLM-only analysis misses deterministic issues that code can catch instantly — broken links, missing alt text, duplicate honeypots, inconsistent phone numbers. These checks are fast, free (no LLM tokens), and catch issues the user might not include in their prompt.

## What
A pre-pass analysis engine that runs deterministic checks against pages, layouts, and posts BEFORE the LLM analysis. Results are inserted as recommendations with specific tool types and actionable fix options.

## Constraints
**Must:** Run before LLM analysis, complete in <10 seconds, produce actionable recommendations with specific fix instructions.
**Must not:** Duplicate what LLM analysis catches, require external API calls that are slow (>2s per check), block the batch if checks fail.

## Tasks

### T1: Built-in analyzer service
**Do:** Create `signalsai-backend/src/utils/website-utils/builtinAnalyzer.ts`

Runs deterministic checks on HTML content. Returns array of recommendations in the same format as LLM analysis.

**Checks to implement:**

1. **Broken internal links** — extract all `href` values, check against existing page paths + post type/slug combos. Flag with: `fix_broken_link`
2. **Nested anchor tags** — regex for `<a[^>]*>.*<a[^>]*>`. Flag with: `fix_html`
3. **Empty href / hash-only links** — `href="#"` or `href=""`. Flag with: `fix_broken_link`
4. **`.html` extension links** — `href="about.html"` style old artifacts. Flag with: `fix_broken_link`
5. **Missing alt text** — `<img` without `alt` attribute. Flag with: `fix_seo`
6. **Missing alloro-tpl classes** — section root without `alloro-tpl-*` class. Flag with: `fix_html`
7. **Hardcoded nav in header/footer** — `<nav>` or `<ul>` with multiple `<a>` tags but no `{{ menu }}` shortcode. Flag with: `fix_architecture`
8. **Duplicate honeypot inputs** — multiple `<input name="website_url" type="hidden">`. Flag with: `fix_html`
9. **Placeholder text** — "Lorem ipsum", "Coming soon", "TBD", "[placeholder]", "example.com". Flag with: `fix_content`
10. **Phone number inconsistency** — extract all phone patterns across all targets, flag if >1 unique number found. Flag with: `fix_content`
11. **Hardcoded copyright year** — `© 2025` or similar not matching current year. Flag with: `fix_content`
12. **Multiple H1 tags** — per page, count `<h1>` tags across all sections. Flag with: `fix_seo`

**Function signature:**
```typescript
analyzeBuiltinFlags(params: {
  layouts: { field: string, html: string }[],
  pages: { id: string, path: string, sections: { name: string, content: string }[] }[],
  posts: { id: string, title: string, content: string }[],
  existingPaths: string[],
  existingPostSlugs: string[],
}): BuiltinRecommendation[]
```

**Files:** `signalsai-backend/src/utils/website-utils/builtinAnalyzer.ts`
**Verify:** Function compiles, returns correct flag types

### T2: Integrate into analyzeBatch
**Do:** Call `analyzeBuiltinFlags()` at the start of `analyzeBatch()`, before LLM analysis. Insert results as recommendations with appropriate target types.

Map flag types to target types:
- `fix_broken_link` → `page_section` or `layout` (edit the HTML to fix/remove the link)
- `fix_html` → `page_section` or `layout`
- `fix_seo` → `page_section`
- `fix_architecture` → `page_section` or `layout` (recommend shortcode replacement)
- `fix_content` → `page_section`, `layout`, or `post`

**Files:** `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** Built-in flags appear in recommendation list before LLM recommendations

### T3: Frontend — flag badges
**Do:** Add flag-specific tool labels in `TOOL_LABELS`:
- `fix_broken_link`: "Broken Link" (red badge)
- `fix_html`: "Fix HTML" (amber badge)
- `fix_seo`: "SEO Issue" (blue badge)
- `fix_architecture`: "Architecture" (purple badge)
- `fix_content`: "Content Issue" (amber badge)

These use existing `page_section`/`layout`/`post` target types so execution works the same — LLM edits the HTML based on the instruction.

**Files:** `signalsai/src/components/Admin/AiCommandTab.tsx`
**Verify:** Flag badges render correctly

## Done
- [ ] Built-in checks run before LLM analysis
- [ ] Broken internal links detected
- [ ] Nested anchors detected
- [ ] .html extension links detected
- [ ] Missing alt text detected
- [ ] Placeholder text detected
- [ ] Phone inconsistency detected
- [ ] Duplicate honeypots detected
- [ ] `npx tsc --noEmit` passes
