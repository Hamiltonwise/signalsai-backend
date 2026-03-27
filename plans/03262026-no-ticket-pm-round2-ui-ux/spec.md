# PM Round 2: UI/UX Overhaul

## Why
Dashboard and kanban views are functional but visually flat and missing key UX patterns. Need priority triangles, better task cards, richer project cards, activity attribution, loading states, and behavioral changes (backlog auto-clears priority, deadline display rules).

## What
- Priority system: triangles not circles, backlog auto-clears priority
- Deadline display format standardization
- Task card redesign: inline delete, created-by, no drag handle
- Quick-add with priority selector
- Richer project cards with status breakdown + sparkline
- Activity feed with user attribution
- Loading indicators (skeleton shimmer, optimistic delete)
- Backend API enrichments

## Execution Order
1. Backend API changes (enriched project list, activity user join, task-level activity, move behavior)
2. Utility updates (deadline format, priority helpers)
3. Task card + quick-add redesign
4. Kanban column headers + project-level activity panel
5. Project card redesign + dashboard
6. Loading states + error toasts

## Risk
**Level:** 2 — touches many files but each change is isolated.
