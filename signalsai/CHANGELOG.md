# Alloro Dashboard Changelog

All notable changes to the Alloro Dashboard are documented here.

## [0.0.1] - February 2026

### DFYWebsite Top Bar Layout

Restructured the user-facing website editor from a 3-column layout to a streamlined 2-column layout with a horizontal top bar.

**Key Changes:**
- Removed left sidebar (page list, domain button, usage stats)
- Added horizontal top bar with page switcher tabs, domain connector, condensed usage stats, and "View Live" link
- Preview area now takes full remaining width alongside the AI chat panel
- "View Live" link now prefers verified custom domain URL over default `*.sites.getalloro.com`
- Loading skeleton updated to match new 2-column layout

**Commits:**
- `signalsai/src/pages/DFYWebsite.tsx` — Full layout restructure: sidebar removed, top bar added, View Live URL logic updated, loading skeleton updated
