# Sidebar Collapse for Client Layout + Preview Scale Fix

## Problem Statement
The client-side sidebar is always expanded with no collapse mechanism. When the website editor tab is opened, the sidebar takes up unnecessary horizontal space, reducing the preview viewport. Additionally, the preview scaling was set to 60% — too small for comfortable editing.

## Context Summary
- Admin already has a `SidebarContext` (`collapsed`, `toggleCollapsed`, `setCollapsed`) and auto-collapse on PageEditor mount.
- Client uses `PageWrapper` → `Sidebar` with fixed `w-72` and `lg:pl-72`.
- `SidebarContext` is generic — can be reused in the client layout.

## Existing Patterns to Follow
- Admin's `SidebarContext` + `SidebarProvider` pattern
- Admin PageEditor `useEffect(() => { setCollapsed(true); }, [setCollapsed]);`
- `PanelLeftClose`/`PanelLeftOpen` icons for collapse/expand

## Proposed Approach
1. Wrap `PageWrapper` with `SidebarProvider` (defaultCollapsed=false).
2. Make main content padding dynamic (`collapsed ? "lg:pl-[68px]" : "lg:pl-72"`).
3. Sidebar collapses to a 68px icon rail (not fully hidden) — shows icons, logo, avatar.
4. `NavItem` gets a `minimized` prop: centers icon, hides label/badge text, adds tooltip.
5. `isMinimized = collapsed && !isOpen` ensures mobile drawer always shows full layout.
6. Header: minimized shows small logo + PanelLeftOpen; expanded shows full brand + PanelLeftClose.
7. Footer: minimized shows avatar + logout icon; expanded shows full profile card.
8. Section headers ("Operations", "Execution", "Support") hidden when minimized.
9. LocationSwitcher hidden when minimized.
10. In `DFYWebsite.tsx`, call `setCollapsed(true)` on mount (mirrors admin PageEditor).
11. Change `DESKTOP_SCALE` from `0.6` to `0.8`.

## Risk Analysis
- **Level 1 — Suggestion**: Low risk. Reuses proven admin pattern. No new dependencies.
- Sidebar context is already imported by the Sidebar component, so no circular dependency issues.
- `isMinimized` guard prevents collapsed icon-only mode from leaking into mobile drawer.

## Definition of Done
- [x] PageWrapper wrapped with SidebarProvider
- [x] Main content padding responds to collapsed state (68px when collapsed, 288px when expanded)
- [x] Sidebar collapses to icon rail (68px) — not fully hidden
- [x] NavItem supports `minimized` mode: centered icon, tooltip, badge dot
- [x] Section headers hidden when minimized
- [x] LocationSwitcher hidden when minimized
- [x] Footer shows compact avatar + logout when minimized
- [x] Header shows small logo + expand toggle when minimized
- [x] Mobile drawer always shows full expanded layout regardless of collapsed state
- [x] Collapse toggle button in sidebar header (desktop)
- [x] DFYWebsite auto-collapses sidebar on mount
- [x] DESKTOP_SCALE changed to 0.8
- [x] TypeScript compiles cleanly
