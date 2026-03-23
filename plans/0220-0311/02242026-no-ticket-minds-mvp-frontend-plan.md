# Minds MVP Frontend — Implementation Plan

## Problem Statement

The Minds backend is fully implemented (25 API endpoints, BullMQ worker, LLM integration) but has no frontend UI. Admins need a way to manage Minds — chat with them, edit their brain/personality, manage sources, triage discovered posts, run sync pipelines, and review proposals — all from within the existing admin panel.

## Context Summary

### Backend API (already live at `/api/admin/minds`)
- Mind CRUD: list, get, create, update, updateBrain, listVersions, publishVersion
- Chat: send message, get conversation history
- Sources: list, create, delete, toggle active
- Discovery: get open batch + posts, update post status, trigger manual run, delete batch
- Sync: start scrape-compare, start compile, list runs, get run details, get run proposals
- Proposals: update status (approve/reject)
- Status: get gating status (what actions are allowed/blocked and why)

### Frontend Stack
- React 19 + Vite + TypeScript + Tailwind v4 + React Router v7
- Framer Motion for animations, Lucide for icons
- `apiGet/apiPost/apiPatch/apiPut/apiDelete` helpers in `src/api/index.ts`
- Admin routes nest under `AdminGuard` → `AdminLayout` in `src/pages/Admin.tsx`
- Sidebar: `AdminNavKey` type union, grouped nav arrays, `renderNavLink` with `isActivePath` matching on URL path parts

### Existing Patterns to Follow
- **Sidebar nav**: Add key to `AdminNavKey` union, add item to a group array, icon from Lucide
- **List page**: `AdminPageHeader` + loading/error states + card grid (see `WebsitesList.tsx`)
- **Detail page**: `AdminPageHeader` with `backButton` + tab pattern from `OrganizationDetail.tsx` (TAB_KEYS const, TAB_CONFIG record, `searchParams` for active tab)
- **TabBar**: DesignSystem `TabBar` component (accepts `tabs`, `activeTab`, `onTabChange`)
- **API module**: Dedicated file in `src/api/` with typed functions wrapping `apiGet/apiPost/etc.`
- **Chat UI**: Existing `ChatPanel.tsx` pattern — message list with auto-scroll, textarea input, Enter to send, Shift+Enter for newline
- **Response handling**: Backend returns `{ success: true, data: ... }` or `{ error: "message" }`

## Proposed Approach

### File Structure (8 new files)

```
src/
  api/
    minds.ts                          # API module — all 25 endpoints
  pages/
    admin/
      MindsList.tsx                   # List page — card grid of minds
      MindDetail.tsx                  # Detail page — tabs container
  components/
    Admin/
      minds/
        MindChatTab.tsx               # Chat tab — message UI + send
        MindSettingsTab.tsx           # Settings tab — personality, brain editor, sources, versions
        MindKnowledgeSyncTab.tsx      # Knowledge Sync tab — discovery, sync runs, proposals
        MindStatusBanner.tsx          # Gating status banner (shared across tabs)
```

### Modified Files (2)

```
src/components/Admin/AdminSidebar.tsx  # Add "minds" nav key + Brain icon
src/pages/Admin.tsx                    # Add MindsList + MindDetail routes
```

### Phase-by-Phase Implementation

#### Phase 1 — API Module (`src/api/minds.ts`)

Typed wrapper functions for all backend endpoints. TypeScript interfaces for:
- `Mind`, `MindVersion`, `MindSource`
- `DiscoveryBatch`, `DiscoveredPost`
- `SyncRun`, `SyncStep`, `SyncProposal`
- `MindStatus` (gating result)
- `ChatMessage`, `Conversation`

Every function returns typed data. Pattern:
```ts
export async function listMinds(): Promise<Mind[]> {
  const res = await apiGet({ path: "/admin/minds" });
  return res.success ? res.data : [];
}
```

#### Phase 2 — Sidebar + Routing

**AdminSidebar.tsx changes:**
- Import `Brain` from lucide-react
- Add `"minds"` to `AdminNavKey` type union
- Add `{ key: "minds", label: "Minds", icon: Brain }` to `AGENTS_GROUP_ITEMS` array (fits semantically with agent features)

**Admin.tsx changes:**
- Import `MindsList` and `MindDetail`
- Add routes inside `AdminWithLayout`:
  ```
  <Route path="minds" element={<MindsList />} />
  <Route path="minds/:mindId" element={<MindDetail />} />
  ```

#### Phase 3 — MindsList Page

Simple list page following `WebsitesList` pattern:
- `AdminPageHeader` with Brain icon, "Minds" title, "Create Mind" action button
- Loading spinner → Error state → Empty state → Card grid
- Each card: mind name, personality excerpt, published version number, created date
- Click card → navigate to `/admin/minds/:mindId`
- Create button opens inline form (name + personality fields) or navigates to detail

#### Phase 4 — MindDetail Page (Tab Container)

Tab-based detail page following `OrganizationDetail` pattern:
- `AdminPageHeader` with back button → `/admin/minds`
- Mind name + status badge in header
- `MindStatusBanner` — shows gating status (blocked actions + reasons) when relevant
- 3 tabs via `TabBar`:
  - **Chat** (`MessageSquare` icon) — default tab
  - **Settings** (`Settings` icon) — personality, brain, sources, versions
  - **Knowledge Sync** (`RefreshCw` icon) — discovery, sync runs, proposals
- Tab state via `useSearchParams` (URL-driven, bookmarkable)

#### Phase 5 — MindChatTab

Adapted from existing `ChatPanel.tsx` pattern (without media upload):
- Message list: user messages right-aligned (orange), assistant messages left-aligned (gray)
- Auto-scroll on new messages
- Textarea input with Enter to send, Shift+Enter for newline
- Loading indicator while awaiting response
- Conversation persisted via backend — messages loaded on mount
- New conversation created on first message if no active conversationId
- Simple, clean — no markdown rendering initially (plain text)

#### Phase 6 — MindSettingsTab

Four collapsible sections using `ExpandableSection` from DesignSystem:

**1. Personality**
- Textarea for `personality_prompt` (pre-filled from mind data)
- Save button → `PUT /:mindId`

**2. Brain Editor**
- Large textarea/code-editor for markdown brain content
- Character count display (max 50,000)
- Save button → `PUT /:mindId/brain`
- Shows current published version number

**3. Sources**
- List of sources with URL, type badge (rss/html), active toggle
- Add source form: URL input + type selector + submit
- Delete button per source (with confirmation)

**4. Versions**
- List of versions (version number, published_at, character count)
- "Publish" button on non-published versions → `POST /:mindId/versions/:versionId/publish`
- Current published version highlighted

#### Phase 7 — MindKnowledgeSyncTab

Three sections:

**1. Discovery Batch**
- Shows current open batch (or "No open batch" empty state)
- "Run Discovery" button → `POST /:mindId/discovery/run`
- "Delete Batch" button → `DELETE /:mindId/discovery-batch/:batchId` (with confirmation)
- Post list: URL, title, published date, status badge (pending/approved/ignored)
- Quick-action buttons per post: Approve / Ignore (toggleable)
- Batch summary: X pending, Y approved, Z ignored

**2. Sync Runs**
- "Start Scrape & Compare" button (disabled if gating blocks it, tooltip shows reason)
- "Start Compile & Publish" button (disabled if gating blocks it)
- List of recent runs: type, status badge, started_at, completed_at
- Click run → expand to show steps (step name, status, duration)
- Active run: auto-poll status every 5s until completed/failed

**3. Proposals**
- List of proposals from most recent scrape-compare run
- Each proposal: type badge (NEW/UPDATE/CONFLICT), summary, proposed_text preview
- Approve / Reject buttons per proposal
- Bulk approve all button
- Count of approved/pending/rejected

#### Phase 8 — MindStatusBanner

Shared component displayed at top of MindDetail when gating blocks actions:
- Calls `GET /:mindId/status` on mount and after mutations
- If `scrapeCompare.allowed === false` or `compilePublish.allowed === false`:
  - Shows yellow warning banner with reasons
  - e.g. "Scrape & Compare blocked: 3 pending discovery posts need triage"
- If everything is allowed: banner hidden

### Polling Strategy

For active sync runs:
- Poll `GET /:mindId/sync-runs/:runId` every 5 seconds
- Stop polling when status is `completed` or `failed`
- Use `useEffect` + `setInterval` pattern (not WebSocket — keeping it simple for MVP)
- Refresh status banner after run completes

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Chat response latency (LLM call) | L2 | Show typing indicator, disable input during response |
| Brain editor losing unsaved work | L2 | Confirm before navigating away if dirty |
| Polling overhead for sync runs | L1 | 5s interval is fine for admin-only feature, stop when tab unfocused |
| Large brain content in textarea | L1 | Character count + warn at 90% of limit |

## Security Considerations

- All API calls go through JWT auth → super admin middleware (backend enforced)
- No client-side auth bypass possible — backend rejects non-super-admin requests
- No user-generated HTML rendering (plain text chat, markdown brain is in textarea only)

## Performance Considerations

- Lazy-load MindsList and MindDetail pages (React.lazy + Suspense)
- Paginate proposals list if > 50 items
- Stop sync run polling when tab is not active (`document.hidden` check)
- No N+1 on frontend — each tab loads its own data on activation, not all at once

## Definition of Done

1. "Minds" appears in admin sidebar under Agents group with Brain icon
2. `/admin/minds` shows list of minds with create capability
3. `/admin/minds/:mindId` shows detail page with 3 working tabs
4. Chat tab: send messages, see responses, conversation persists
5. Settings tab: edit personality, edit brain, manage sources, view/publish versions
6. Knowledge Sync tab: view/triage discovery posts, run sync pipelines, review proposals
7. Status banner shows gating blocks with actionable reasons
8. Active sync runs auto-poll and update UI in real time
9. TypeScript compiles without errors
10. All API calls use typed functions from `src/api/minds.ts`
