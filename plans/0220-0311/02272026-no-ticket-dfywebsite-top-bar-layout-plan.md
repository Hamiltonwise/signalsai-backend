# DFYWebsite top bar layout + sidebar removal

## Problem Statement
The user-facing DFYWebsite page uses a 3-column layout with a left sidebar for page navigation, domain button, and usage stats. The sidebar wastes 256px of horizontal space for content that could fit in a compact top bar. Need to restructure to a 2-column layout (top bar + preview | chat).

## Context Summary
- Single file: `signalsai/src/pages/DFYWebsite.tsx` (545 lines)
- Current layout: left sidebar (w-64) + center preview (flex-1) + right chat (w-96)
- Domain connector (button + modal) already integrated from prior work
- ConnectDomainModal component unchanged — just repositioned
- "View Live" link currently hardcodes `*.sites.getalloro.com` URL, should prefer verified custom domain

## Existing Patterns to Follow
- Tailwind utility classes throughout
- Purple-600 as primary accent color
- Lucide React icons
- Same page state management (selectedPage, pages array)

## Proposed Approach

### 1. Remove left sidebar
Delete the entire `w-64` sidebar column (pages list, domain button, usage stats).

### 2. Add horizontal top bar
New top bar above the preview area containing:
- **Page switcher**: horizontal tabs/pills showing page paths. Active tab highlighted with purple accent. Scrollable if many pages.
- **Domain button**: same styling, moved from sidebar to top bar right side.
- **Usage stats**: condensed inline display (e.g., "3/10 edits | 45% storage") on the right side or as a subtle indicator.
- **"View Live" link**: moved into top bar, now prefers verified custom domain URL.

### 3. Update preview area
Preview now spans full width minus the right chat panel. No left sidebar gap.

### 4. Fix "View Live" URL
```
href={project.custom_domain && project.domain_verified_at
  ? `https://${project.custom_domain}${selectedPage?.path || ""}`
  : `https://${project.hostname}.sites.getalloro.com${selectedPage?.path || ""}`}
```

### 5. Update loading skeleton
Match new 2-column layout (top bar placeholder + preview + chat) instead of current 3-column skeleton.

## Risk Analysis
Level 1 — UI-only change in a single file. No backend, no migrations, no auth boundaries. No other pages affected.

## Definition of Done
- Left sidebar removed
- Horizontal top bar with page tabs, domain button, usage indicator, and "View Live" link
- Preview area takes full remaining width
- "View Live" prefers verified custom domain
- Loading skeleton matches new layout
- ConnectDomainModal still functions correctly
- All existing states (PREPARING, READ_ONLY, empty) unaffected
