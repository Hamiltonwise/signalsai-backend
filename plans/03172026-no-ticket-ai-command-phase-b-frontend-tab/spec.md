# AI Command — Phase B: Frontend Tab + Approve/Reject UI

## Why
Phase A produces recommendations in the database. Users need a UI to create batches (submit prompts, select targets), review grouped recommendations, and approve/reject before execution.

## What
New "AI Command" tab in `WebsiteDetail.tsx` (positioned before "backups" tab). Full UI for the prompt → analyze → review → approve/reject workflow. Wires to Phase A backend endpoints.

## Context

**Relevant files:**
- `signalsai/src/pages/admin/WebsiteDetail.tsx` — tab container, `VALID_TABS` array (line ~317)
- `signalsai/src/api/websites.ts` — API module, all website builder calls
- `signalsai/src/components/Admin/PostsTab.tsx` — existing tab component pattern
- `signalsai/src/components/Admin/BackupsTab.tsx` — existing tab component pattern
- `signalsai/src/pages/admin/PageEditor.tsx` — reference for loading states, iframe patterns

**Patterns to follow:**
- Tab component as separate file in `components/Admin/`
- API functions in `api/websites.ts` using existing axios instance
- TanStack Query for data fetching (`useQuery`, `useMutation`)
- shadcn/radix components for UI (Accordion, Badge, Button, Checkbox, Textarea)
- `.minds-theme` dark mode scoping in `index.css`

**Key decisions already made:**
- Tab position: before "backups" (7th tab)
- Tab name: "AI Command"
- No streaming — poll for batch status during analysis

## Constraints

**Must:**
- Follow existing tab component patterns exactly
- Use existing UI component library (shadcn/radix)
- Poll batch status during analysis (2s interval)
- Group recommendations by target type → target in collapsible sections
- Show recommendation count badges

**Must not:**
- Add new UI dependencies
- Modify existing tab components
- Implement execution logic (Phase C)

**Out of scope:**
- Execute button functionality (Phase C)
- Preview/diff view (future enhancement)
- Batch history/list (v2)

## Risk

**Level:** 1

**Risks identified:**
- Large recommendation lists could be slow to render → **Mitigation:** virtualization not needed for v1 (expect <200 items), but group + collapse by default

## Tasks

### T1: API functions
**Do:** Add to `signalsai/src/api/websites.ts`:

```typescript
createAiCommandBatch(projectId, data: { prompt: string, targets: AiCommandTargets }) → { batch }
getAiCommandBatch(projectId, batchId) → { batch }
getAiCommandRecommendations(projectId, batchId, filters?) → { recommendations }
updateAiCommandRecommendation(projectId, batchId, recId, status) → { recommendation }
bulkUpdateAiCommandRecommendations(projectId, batchId, status, filters?) → { updated }
```

Add TypeScript interfaces:
```typescript
interface AiCommandBatch { id, project_id, prompt, targets, status, summary, stats, created_at }
interface AiCommandRecommendation { id, batch_id, target_type, target_id, target_label, target_meta, recommendation, instruction, current_html, status, sort_order }
interface AiCommandTargets { pages: string[] | "all", posts: string[] | "all", layouts: string[] | "all" }
```

**Files:** `signalsai/src/api/websites.ts`
**Verify:** Types compile, functions match backend routes

### T2: AiCommandTab component — prompt + target selection
**Do:** Create `signalsai/src/components/Admin/AiCommandTab.tsx`

**Layout (3 states):**

**State 1 — Input (no active batch):**
- Large textarea for prompt/checklist (min 6 rows, auto-expand)
- Target selection section:
  - "Pages" toggle: all pages / specific (multi-select dropdown of page paths)
  - "Posts" toggle: all posts / specific (multi-select dropdown of post titles grouped by type)
  - "Layouts" toggle: all layouts / specific (checkboxes: wrapper, header, footer)
  - Default: all layouts + all pages + all posts selected
- "Analyze" button (primary, disabled when prompt is empty)
- Placeholder text in textarea: "Paste a QA checklist, describe changes, or give a simple instruction..."

**State 2 — Analyzing (batch status = "analyzing"):**
- Show prompt (collapsed/summary)
- Progress section:
  - Animated progress bar (stats.total > 0 ? (processed / total) : indeterminate)
  - "Analyzing {n} of {total} targets..." text
  - Poll batch status every 2 seconds via `useQuery` with `refetchInterval`
- Cancel not supported v1 (batch runs to completion)

**State 3 — Results (batch status = "ready"):**
- Summary header: AI-generated summary text + stats badges (N pending, N approved, N rejected)
- Bulk actions bar: "Approve All" / "Reject All" buttons
- Grouped accordion sections (see T3)
- "Execute Changes" button at bottom (disabled until Phase C, show "Coming soon" tooltip)
- "New Analysis" button to reset to State 1

**Files:** `signalsai/src/components/Admin/AiCommandTab.tsx`
**Verify:** Component renders in all 3 states

### T3: Recommendation display — grouped accordion
**Do:** Within AiCommandTab, build the results view:

**Grouping hierarchy:**
1. Top-level groups by target_type: "Layouts", "Pages", "Posts"
2. Within each group, sub-groups by target_label (e.g., "Homepage > Hero Section", "Footer")
3. Each sub-group is a collapsible accordion item

**Accordion item content:**
- Header: target_label + badge count (e.g., "3 recommendations")
- Status indicator: all approved (green), all rejected (red), mixed (amber), all pending (gray)
- Body: list of individual recommendations
  - Each recommendation card:
    - Recommendation text (the human-readable description)
    - Instruction text (collapsible, smaller/muted — "What the AI will do")
    - Two action buttons: Approve (check icon) / Reject (x icon)
    - Status badge: pending / approved / rejected
    - Clicking approve/reject calls PATCH endpoint, optimistic update

**Empty states:**
- Group with 0 recommendations: "No changes needed" with checkmark
- All recommendations rejected: show muted state
- No recommendations at all: "No changes recommended. The content looks good against your requirements."

**Files:** `signalsai/src/components/Admin/AiCommandTab.tsx` (same file, internal components)
**Verify:** Accordion expands/collapses, approve/reject updates status

### T4: Wire tab into WebsiteDetail
**Do:**
- Add `"ai-command"` to `VALID_TABS` array (before `"backups"`)
- Add tab trigger: icon + "AI Command" label
- Import and render `AiCommandTab` component
- Pass `projectId` and `project` props

**Files:** `signalsai/src/pages/admin/WebsiteDetail.tsx`
**Verify:** Tab appears, navigates correctly, persists in URL params

## Done
- [ ] "AI Command" tab visible in website detail, positioned before backups
- [ ] Prompt textarea + target selection renders
- [ ] "Analyze" creates batch via API, transitions to analyzing state
- [ ] Progress bar animates during analysis with polling
- [ ] Results display grouped recommendations in accordion
- [ ] Approve/reject buttons update recommendation status
- [ ] Bulk approve/reject works
- [ ] `npx tsc --noEmit` passes
- [ ] Dark mode (`.minds-theme`) renders correctly
