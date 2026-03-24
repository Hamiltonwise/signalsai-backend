# Execution Summary + Prompt Fixes (Removal Comments, Raw Shortcode Tokens)

## Why
Three problems: (1) When the LLM removes a section, it leaves visible comments like "(empty — section removed entirely)" on the live page. (2) When replacing hardcoded content with shortcodes, the LLM writes raw template internals (`{{start_post_loop}}`, `{{post.content}}`) into page HTML instead of the shortcode reference (`{{ post_block id='slug' }}`). (3) After execution completes, the summary is a single line ("Executed 5 change(s)") with no breakdown of what was done, what needs checking, or what requires manual action.

## What
Fix the two prompt/validator bugs and build a structured execution summary that persists in `batch.summary` as markdown, rendered in the frontend with `ReactMarkdown`.

## Context

**Relevant files:**
- `src/agents/websiteAgents/aiCommand/Execution.md` — HTML editor prompt (needs removal comment ban + shortcode token ban)
- `src/agents/websiteAgents/aiCommand/Analysis.md` — analysis prompt (needs shortcode token clarification)
- `src/utils/website-utils/htmlValidator.ts` — validator (needs removal comment + raw shortcode token checks)
- `src/controllers/admin-websites/feature-services/service.ai-command.ts` — `executeBatch()` generates the summary (line 783-789)
- `frontend/src/components/Admin/AiCommandTab.tsx` — renders `batch.summary` as `<p>` (line 653)
- `react-markdown` is already installed and used in other components (WorkRunsTab, SkillDetailPanel)

**Data available after execution (per recommendation):**
- `status`: executed | failed
- `target_type`: page_section, layout, post, create_page, create_post, create_redirect, etc.
- `target_label`: human-readable label
- `execution_result.remaining_issues`: number (>0 means needs visual check)
- `execution_result.error`: string (on failure)
- `execution_result.iterations`: number (pipeline retries)
- Rejected recommendations are also in DB with status "rejected"

**Patterns to follow:**
- `ReactMarkdown` usage in `WorkRunsTab.tsx` line 329

## Constraints

**Must:**
- Summary must persist in `batch.summary` (TEXT column) as markdown
- Summary must be deterministic — built from recommendation data, not LLM-generated
- Summary categories must be consistent across all runs
- Frontend rendering must use `ReactMarkdown` (already available)

**Must not:**
- Don't add new DB columns — use existing `summary` TEXT field
- Don't modify the recommendation status enum (no new statuses)
- Don't add new API endpoints — summary is already returned via `batch.summary`

**Out of scope:**
- Email/notification of summary
- Exporting summary as PDF

## Risk

**Level:** 1

**Risks identified:**
- Long summaries could make the batch history list noisy → **Mitigation:** History list already truncates via `.truncate`. Full summary only visible when viewing the batch.

## Tasks

### T1: Fix Execution.md — ban removal comments and raw shortcode tokens
**Do:** Add two new sections to Execution.md:

After the IMAGES section, add:
```
## REMOVAL BEHAVIOR
- If instructed to remove a section or element entirely, return an empty string — literally nothing
- NEVER leave visible comments, placeholders, or notes like "(removed)", "(empty)", "(section removed entirely)", "<!-- removed -->", or any explanatory text
- The output is rendered directly on a live website — any text you leave will be visible to users

## SHORTCODE TOKENS
- In page/section HTML, ONLY use complete shortcode references: {{ post_block id='slug' items='type' }}, {{ menu id='slug' }}, {{ review_block id='slug' }}
- NEVER write raw template internals in page HTML: {{start_post_loop}}, {{end_post_loop}}, {{post.title}}, {{post.content}}, {{post.featured_image}}, {{custom_field name='...'}}, {{start_review_loop}}, {{end_review_loop}}
- Those tokens belong ONLY inside post_block/review_block template definitions (managed separately), not in page sections
```

**Files:** `src/agents/websiteAgents/aiCommand/Execution.md`
**Verify:** Read the file. Confirm both sections exist.

### T2: Fix Analysis.md — clarify shortcode usage
**Do:** In the post_block section (around line 21-24), add:
```
- IMPORTANT: When recommending a shortcode replacement, the instruction must use the COMPLETE shortcode reference (e.g., {{ post_block id='services-grid' items='services' limit='10' }}). NEVER include raw template loop tokens ({{start_post_loop}}, {{post.title}}, etc.) in the instruction — those are internal to the template definition.
```

**Files:** `src/agents/websiteAgents/aiCommand/Analysis.md`
**Verify:** Read the file.

### T3: Add validator checks for removal comments and raw shortcode tokens
**Do:** In `htmlValidator.ts`, add two new checks in `checkBannedPatterns()`:

1. Removal comment detection:
```typescript
// Visible removal comments
const removalPatterns = /\((?:empty|removed|section removed|deleted|cleared)[^)]*\)/i;
if (removalPatterns.test(html)) {
  issues.push({ type: "ui", description: "Visible removal comment in HTML.",
    fixInstruction: "Remove all text like '(empty — section removed entirely)' or '(removed)'. If the section should be empty, return nothing." });
}
```

2. Raw shortcode token detection:
```typescript
// Raw shortcode template tokens in page HTML (should only be in template definitions)
const rawTokens = html.match(/\{\{(?:start_post_loop|end_post_loop|start_review_loop|end_review_loop|post\.[\w]+|post_content|post_title|custom_field)\b[^}]*\}\}/g) || [];
if (rawTokens.length > 0) {
  issues.push({ type: "ui",
    description: `Raw shortcode template tokens in page HTML: ${[...new Set(rawTokens)].slice(0, 3).join(", ")}`,
    fixInstruction: "Replace raw template tokens ({{start_post_loop}}, {{post.title}}, etc.) with a complete shortcode reference: {{ post_block id='slug' items='type' }}. Template loop tokens belong in post_block template definitions, not in page HTML." });
}
```

**Files:** `src/utils/website-utils/htmlValidator.ts`
**Verify:** `npx tsc --noEmit` passes.

### T4: Build structured execution summary in executeBatch()
**Do:** Replace the simple summary string (line 787) with a function that builds markdown from all recommendations in the batch.

Create a new function `buildExecutionSummary(batchId: string)`:
```typescript
async function buildExecutionSummary(batchId: string): Promise<string> {
  const allRecs = await db(RECS_TABLE)
    .where("batch_id", batchId)
    .orderBy("sort_order", "asc");

  const executed = allRecs.filter((r) => r.status === "executed");
  const failed = allRecs.filter((r) => r.status === "failed");
  const rejected = allRecs.filter((r) => r.status === "rejected");

  // Categorize executed items
  const htmlEdits = executed.filter((r) => ["page_section", "layout", "post"].includes(r.target_type));
  const structural = executed.filter((r) => ["create_page", "create_post", "create_redirect", "delete_redirect", "create_menu", "update_menu", "update_redirect", "update_post_meta", "update_page_path"].includes(r.target_type));

  // Items needing visual check (had remaining validation issues)
  const needsVisualCheck = htmlEdits.filter((r) => {
    const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
    return result?.remaining_issues > 0;
  });

  // Manual action items (rejected with MANUAL flag or from analysis)
  const manualItems = rejected.filter((r) => {
    return r.recommendation?.includes("MANUAL:") || r.recommendation?.includes("manual_action");
  });

  const lines: string[] = [];

  // Overview
  lines.push(`**${executed.length}** completed, **${failed.length}** failed, **${rejected.length}** skipped\n`);

  // Completed
  if (htmlEdits.length > 0 || structural.length > 0) {
    lines.push("### Completed");
    for (const r of htmlEdits) lines.push(`- ✏️ ${r.target_label}`);
    for (const r of structural) lines.push(`- ${getStructuralIcon(r.target_type)} ${r.target_label}`);
    lines.push("");
  }

  // Needs Visual Check
  if (needsVisualCheck.length > 0) {
    lines.push("### Needs Visual Check");
    for (const r of needsVisualCheck) {
      const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
      lines.push(`- 👁️ ${r.target_label} — ${result.remaining_issues} unresolved issue(s)`);
    }
    lines.push("");
  }

  // Manual Action Required
  if (manualItems.length > 0) {
    lines.push("### Manual Action Required");
    for (const r of manualItems) lines.push(`- 🔧 ${r.target_label} — ${r.recommendation}`);
    lines.push("");
  }

  // Failed
  if (failed.length > 0) {
    lines.push("### Failed");
    for (const r of failed) {
      const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
      lines.push(`- ❌ ${r.target_label} — ${result?.error || "Unknown error"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

Helper:
```typescript
function getStructuralIcon(targetType: string): string {
  switch (targetType) {
    case "create_page": return "📄";
    case "create_post": return "📝";
    case "create_redirect": case "update_redirect": case "delete_redirect": return "🔀";
    case "create_menu": case "update_menu": return "📋";
    default: return "✅";
  }
}
```

Then in `executeBatch()`, replace line 787 with:
```typescript
const executionSummary = await buildExecutionSummary(batchId);
```
And use `executionSummary` as the summary value.

**Files:** `src/controllers/admin-websites/feature-services/service.ai-command.ts`
**Verify:** `npx tsc --noEmit` passes. Read the function and confirm all categories are covered.

### T5: Render summary as markdown in frontend
**Do:** In `AiCommandTab.tsx`:
1. Add import: `import ReactMarkdown from "react-markdown";`
2. Replace line 653:
```tsx
<p className="text-sm font-medium text-gray-800">{batch?.summary || "Analysis complete."}</p>
```
With:
```tsx
<div className="text-sm text-gray-800 prose prose-sm max-w-none prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
  <ReactMarkdown>{batch?.summary || "Analysis complete."}</ReactMarkdown>
</div>
```

**Files:** `frontend/src/components/Admin/AiCommandTab.tsx`
**Verify:** `npx tsc --noEmit` passes in the frontend directory.

## Done
- [ ] `npx tsc --noEmit` passes (backend + frontend)
- [ ] Execution.md contains REMOVAL BEHAVIOR and SHORTCODE TOKENS sections
- [ ] Analysis.md clarifies shortcode usage (no raw template tokens in instructions)
- [ ] htmlValidator.ts catches removal comments and raw shortcode template tokens
- [ ] `executeBatch()` generates structured markdown summary with categories: Completed, Needs Visual Check, Manual Action Required, Failed
- [ ] Summary renders as markdown in the completed batch view
- [ ] Manual: Execute a batch — confirm summary shows categorized results with icons
- [ ] Manual: Remove a section — confirm no visible "(empty)" text on page
- [ ] Manual: Shortcode replacement — confirm `{{ post_block id='slug' }}` not `{{start_post_loop}}`
