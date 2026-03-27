# Custom Domain Connect/Verify/Disconnect — alloro-app

## Problem Statement
Users need a way to connect custom domains to their website projects. This requires DNS verification (A record check), domain storage, and UI in both admin and client dashboards.

## Context Summary
- `projects` table already has `custom_domain` (VARCHAR UNIQUE) and `domain_verified_at` (TIMESTAMP)
- `updateProject()` already accepts any field including `custom_domain`
- Admin routes: `/api/admin/websites/:id/...`
- User routes: `/api/user/website/...`
- Frontend: React + Tailwind + Framer Motion, modals use AnimatePresence pattern
- API: fetch-based in `src/api/websites.ts`, user-side uses `apiGet`/`apiPost` from `src/api/index.ts`

## Existing Patterns to Follow
- Backend services in `feature-services/service.*.ts`
- Controller → service delegation pattern
- Error return as `{ error: { status, code, message } }`
- Frontend modals: controlled `isOpen`/`onClose`, Framer Motion, fixed z-50
- Frontend API: fetch with JSON response

## Proposed Approach

### Backend
1. New service: `service.custom-domain.ts`
   - `connectDomain(projectId, domain)` — validate, save custom_domain, clear domain_verified_at
   - `verifyDomain(projectId)` — DNS A record lookup via `dns.resolve4()`, compare to env `SITE_RENDERER_IP`, set domain_verified_at
   - `disconnectDomain(projectId)` — clear both fields
2. Controller: Add 3 handlers to `AdminWebsitesController.ts`
3. Routes: Register `POST /:id/connect-domain`, `POST /:id/verify-domain`, `DELETE /:id/disconnect-domain`
4. User routes: Add `POST /domain/connect`, `POST /domain/verify`, `DELETE /domain/disconnect`

### Frontend
5. API: Add `connectDomain`, `verifyDomain`, `disconnectDomain` to `websites.ts`
6. New component: `ConnectDomainModal.tsx`
7. Integrate into admin WebsiteDetail (button in header area)
8. Integrate into user DFYWebsite (in sidebar or header)

## Risk Analysis
Level 1 — Additive endpoints and UI. No existing behavior modified.

## Security Considerations
- Domain format validation (no injection)
- DNS lookup is read-only, no security risk
- User route requires auth + RBAC + DFY tier

## Definition of Done
- Admin can connect/verify/disconnect custom domains per project
- User can connect/verify/disconnect their own project's custom domain
- DNS verification checks A record against configured server IP
- UI shows domain status, verification instructions, and server IP

## Execution Complete

### Files Created
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.custom-domain.ts` — business logic for connect/verify/disconnect
- `signalsai/src/components/Admin/ConnectDomainModal.tsx` — shared modal component

### Files Modified
- `signalsai-backend/src/controllers/admin-websites/AdminWebsitesController.ts` — added 3 handlers
- `signalsai-backend/src/routes/admin/websites.ts` — registered 3 routes
- `signalsai-backend/src/routes/user/website.ts` — added 3 user domain routes
- `signalsai-backend/src/controllers/user-website/UserWebsiteController.ts` — added 3 user handlers
- `signalsai-backend/src/controllers/user-website/user-website-services/userWebsite.service.ts` — exposed domain_verified_at
- `signalsai/src/api/websites.ts` — added API functions
- `signalsai/src/pages/admin/WebsiteDetail.tsx` — integrated modal + domain button
- `signalsai/src/pages/DFYWebsite.tsx` — integrated modal + domain button

### Env Var Required
- `SITE_RENDERER_IP` — must be set on the alloro-app backend to the renderer server's public IP
