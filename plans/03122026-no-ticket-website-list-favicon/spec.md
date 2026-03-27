# Website List Favicon

## Why
The website list uses a generic Globe icon for every site. Replacing it with the actual site favicon makes the list scannable and gives each card visual identity.

## What
LIVE sites in `WebsitesList.tsx` show their real favicon (via Google's favicon service) instead of the Globe icon. On image load failure, fall back to the existing Globe icon. Processing and CREATED states unchanged.

## Context

**Relevant files:**
- `signalsai/src/pages/admin/WebsitesList.tsx` — the only file changing; icon rendered at lines 477-485

**Patterns to follow:**
- Status-driven icon styling already exists (`getIconStyles`, `getIconColor`) — favicon container reuses same background/glow classes
- `siteDomain` already computed at line 441 — use it for the favicon URL

**Key decisions already made:**
- Google favicon service: `https://www.google.com/s2/favicons?domain={domain}&sz=64`
- Client-side only, no backend changes
- LIVE sites only — processing keeps spinner, CREATED keeps Globe

## Constraints

**Must:**
- Preserve existing status-based background/glow styling on the icon container
- Fall back to `<Globe>` on `<img>` error (onError handler)
- Only attempt favicon for `website.status === "LIVE"`

**Must not:**
- Add new dependencies
- Modify backend or database schema
- Touch other components or pages

**Out of scope:**
- Backend favicon fetching/caching
- `DFYWebsite.tsx` changes
- Favicon column in `website_builder.projects`

## Risk

**Level:** 1 — Suggestion

**Risks identified:**
- Google favicon service unavailable → **Mitigation:** `onError` fallback to Globe icon, zero visual regression
- Generated hostname subdomains may not have favicons → **Mitigation:** LIVE-only scope + fallback handles this

## Tasks

### T1: Replace Globe with favicon for LIVE sites
**Do:** In the icon rendering block (lines 477-485), add a conditional branch for LIVE status that renders an `<img>` tag with `src` set to Google's favicon service using `siteDomain`. Add `onError` handler that hides the img and shows Globe fallback. Use React state (`useState`) scoped per-card isn't ideal for a list — instead use inline `onError` to swap the element (e.g., set `img.style.display = 'none'` and show a sibling Globe, or use a simple component-level `Set` to track failed domains).
**Files:** `signalsai/src/pages/admin/WebsitesList.tsx`
**Verify:** Manual: open admin websites list, confirm LIVE sites show favicons, non-LIVE show Globe/spinner, break a domain and confirm fallback works.

## Done
- [ ] LIVE sites display favicon in the icon container
- [ ] Non-LIVE sites unchanged (spinner for processing, Globe for CREATED)
- [ ] Broken/missing favicons fall back to Globe icon
- [ ] No TS compilation errors (`npx tsc --noEmit`)
- [ ] Status-based background/glow styling preserved on favicon container
