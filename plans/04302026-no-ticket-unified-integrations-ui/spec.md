# Unified Integrations — UI (Plan 3 of 3)

## Why
Plans 1 and 2 deliver the schema, adapters, cron, and renderer integration. This plan builds the admin and user-facing UI so team members can connect, monitor, and troubleshoot integrations through the Alloro dashboard instead of touching code or databases directly.

## What
- Add Rybbit, Clarity, and GSC tabs to the admin Integrations sidebar (`IntegrationProviderList`)
- Build a reusable `IntegrationPanel` component (health summary, test connection, activity log, rerun)
- Build platform-specific connection modals/panels for each provider
- Add GSC OAuth connection to user-facing `/settings/integrations`
- Add scope expansion notification for existing GBP users who need `webmasters.readonly`

## Context

**Relevant files:**
- `frontend/src/components/Admin/IntegrationsTab.tsx` — main integrations container (sidebar + content area)
- `frontend/src/components/Admin/integrations/IntegrationProviderList.tsx` — sidebar with provider buttons
- `frontend/src/components/Admin/integrations/HubSpotConnectModal.tsx` — reference modal for token input
- `frontend/src/components/Admin/integrations/HubSpotConnectionPanel.tsx` — reference connection panel (status, metadata, actions)
- `frontend/src/components/Admin/integrations/RecentActivityPanel.tsx` — reference activity log (paginated, outcome badges)
- `frontend/src/api/integrations.ts` — API client (types + fetch functions)
- `frontend/src/pages/settings/IntegrationsRoute.tsx` — user-facing integrations page (GBP + locations)
- `frontend/src/components/GoogleConnectButton.tsx` — OAuth popup button component
- `frontend/src/components/settings/PropertiesTab.tsx` — GBP connection UI

**Patterns to follow:**
- HubSpot flow: sidebar provider → click → connection modal → connected panel + forms + activity
- Status badges: green (active), red (revoked), amber (broken), gray (not connected)
- Framer Motion animations: `AnimatePresence`, stagger, fade/scale
- Lucide React icons throughout

**Reference file:** `frontend/src/components/Admin/integrations/HubSpotConnectionPanel.tsx` — closest analog for new platform panels

## Constraints

**Must:**
- Match existing Alloro design system (alloro-orange, alloro-navy, alloro-bg, rounded-2xl, shadow-premium)
- Each platform tab shows: connection status, health bar (success/fail count 30 days), Test Connection button, 30-day activity log with rerun on failed entries
- Rybbit tab: shows site ID, connection status, no credential input (system-managed)
- Clarity tab: shows project ID, requires API token input (like HubSpot token modal), connection status
- GSC tab: shows connected site URL, OAuth connection button (reuse GoogleConnectButton with GSC scope), connection status
- Activity log rows: date, outcome badge (success/failed), rows_fetched, error message (expandable), Rerun button (only on failed, only if retry_count < 3)
- Health bar at top: "{N}/{total} runs successful · {M} failed" — single line, not a chart
- Admin can connect GSC on behalf of client (separate from user self-service)

**Must not:**
- Do not create new design patterns — reuse existing component shapes
- Do not add external dependencies (charting libraries, etc.)
- Do not modify HubSpot tab UI
- Do not build data visualization dashboards (future project)

**Out of scope:**
- Clarity heatmap viewing in Alloro UI
- GSC query/page performance dashboards
- Rybbit analytics dashboards
- Data aggregation views

## Risk

**Level:** 1 — Suggestion

**Risks identified:**
- Multiple new components could drift from existing UI patterns → **Mitigation:** extract shared `IntegrationPanel` with consistent layout; platform-specific content is slotted in
- GSC OAuth in user-facing settings adds complexity to an already dense page → **Mitigation:** add as a collapsible section below GBP, not a separate tab

**Blast radius:**
- `IntegrationsTab.tsx` — admin integrations container
- `IntegrationProviderList.tsx` — sidebar provider list
- `integrations.ts` (API) — new types and fetch functions
- `IntegrationsRoute.tsx` — user-facing settings page
- `ScopeManagementService.ts` — scope descriptions (already updated in Plan 2)

## Tasks

### T1: Extend API client + types
**Do:**
- Add to `frontend/src/api/integrations.ts`:
  - `IntegrationType = 'crm_push' | 'script_injection' | 'data_harvest' | 'hybrid'`
  - `IntegrationPlatform = 'hubspot' | 'rybbit' | 'clarity' | 'gsc'`
  - Update `Integration` interface: add `type: IntegrationType`, `connected_by: string | null`
  - `HarvestLog` interface: `id, integration_id, platform, harvest_date, outcome, rows_fetched, error, error_details, retry_count, attempted_at`
  - `fetchHarvestLogs(projectId, integrationId, params?)` — GET harvest-logs endpoint
  - `validateIntegration(projectId, integrationId)` — POST validate endpoint
  - `rerunHarvest(projectId, integrationId, harvestDate)` — POST rerun endpoint
  - `createIntegration` — update to accept platform-specific payloads
**Files:** `frontend/src/api/integrations.ts`
**Depends on:** none
**Verify:** TypeScript compiles

### T2: Shared `IntegrationPanel` component
**Do:**
- Create `frontend/src/components/Admin/integrations/IntegrationPanel.tsx`
- Props: `integration`, `harvestLogs`, `onValidate`, `onRerun`, `onDisconnect`, `children` (platform-specific content slot)
- Layout:
  - Top row: platform name + status badge + connected_by indicator
  - Health bar: success/fail count from harvest logs (last 30 days)
  - Action buttons: Test Connection, Disconnect
  - Children slot (platform-specific config display)
  - Activity log: paginated table of harvest logs with outcome badges, dates, row counts, errors (expandable), Rerun button on failed entries (disabled if retry_count >= 3)
- Reuse status badge colors from HubSpotConnectionPanel
- Framer Motion enter/exit animations matching existing panels
**Files:** `frontend/src/components/Admin/integrations/IntegrationPanel.tsx`
**Depends on:** T1
**Verify:** component renders with mock data

### T3: Rybbit integration tab
**Do:**
- Create `frontend/src/components/Admin/integrations/RybbitTab.tsx`
- Uses `IntegrationPanel` with platform-specific content:
  - Display: Site ID, Rybbit instance URL, auto-provisioned badge
  - No connect modal (system-managed) — show "Managed by Alloro" indicator
  - If not connected: show info message "Rybbit is automatically provisioned when a custom domain is verified"
**Files:** `frontend/src/components/Admin/integrations/RybbitTab.tsx`
**Depends on:** T2
**Verify:** component renders connected and not-connected states

### T4: Clarity integration tab
**Do:**
- Create `frontend/src/components/Admin/integrations/ClarityTab.tsx`
- Create `frontend/src/components/Admin/integrations/ClarityConnectModal.tsx`
  - Input: Clarity Project ID + API Token (password field)
  - Help text: instructions for generating token in Clarity dashboard
  - On submit: POST create integration with platform='clarity', type='hybrid'
- Uses `IntegrationPanel` with platform-specific content:
  - Display: Project ID, last harvest date
  - Connect/Reconnect via modal (same pattern as HubSpotConnectModal)
**Files:** `frontend/src/components/Admin/integrations/ClarityTab.tsx`, `frontend/src/components/Admin/integrations/ClarityConnectModal.tsx`
**Depends on:** T2
**Verify:** component renders; modal submits successfully

### T5: GSC integration tab (admin)
**Do:**
- Create `frontend/src/components/Admin/integrations/GscTab.tsx`
- Create `frontend/src/components/Admin/integrations/GscConnectPanel.tsx`
  - If org has Google connection with GSC scope: show site URL selector (from `searchconsole.sites.list` via new endpoint), save selection
  - If org has Google connection WITHOUT GSC scope: show "Additional permission needed" with reconnect button (incremental auth)
  - If no Google connection: show "Google account not connected" with connect button
- Uses `IntegrationPanel` with platform-specific content:
  - Display: site URL, Google account email, connection source (user vs admin)
**Files:** `frontend/src/components/Admin/integrations/GscTab.tsx`, `frontend/src/components/Admin/integrations/GscConnectPanel.tsx`
**Depends on:** T2
**Verify:** component renders all three states (no connection, missing scope, connected)

### T6: Wire new tabs into IntegrationsTab + sidebar
**Do:**
- Update `IntegrationProviderList.tsx`: add Rybbit, Clarity, GSC entries with icons and status badges
  - Rybbit icon: bar chart or custom
  - Clarity icon: eye or scan
  - GSC icon: search or globe
- Update `IntegrationsTab.tsx`: route selected provider to the correct tab component
  - `hubspot` → existing HubSpot flow (unchanged)
  - `rybbit` → RybbitTab
  - `clarity` → ClarityTab
  - `gsc` → GscTab
- Fetch all integrations on mount (existing pattern) — new platforms included automatically
- Show provider count: "N/4 Providers connected"
**Files:** `frontend/src/components/Admin/IntegrationsTab.tsx`, `frontend/src/components/Admin/integrations/IntegrationProviderList.tsx`
**Depends on:** T3, T4, T5
**Verify:** sidebar shows all 4 providers; clicking each renders the correct tab

### T7: User-facing GSC connection in Settings
**Do:**
- In `frontend/src/pages/settings/IntegrationsRoute.tsx`:
  - Add collapsible "Google Search Console" section below existing GBP section
  - If Google connection exists with GSC scope: show "Connected" badge + site URL
  - If Google connection exists without GSC scope: show notification banner "Grant Search Console access to unlock website performance insights" with reconnect button (calls `/auth/google/reconnect?scopes=gsc`)
  - If no Google connection: show within the existing "Connect Google" banner flow
- Reuse `GoogleConnectButton` component with scope parameter
**Files:** `frontend/src/pages/settings/IntegrationsRoute.tsx`
**Depends on:** Plan 2 T4 (GSC scope wiring)
**Verify:** settings page renders GSC section; scope expansion flow works

## Done
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Admin integrations sidebar shows all 4 providers (HubSpot, Rybbit, Clarity, GSC)
- [ ] Clicking each provider renders correct panel with connection status
- [ ] Rybbit tab shows site ID and health bar for provisioned projects
- [ ] Clarity tab allows token input and shows activity log
- [ ] GSC tab handles all 3 states (no connection, missing scope, connected)
- [ ] Activity log shows harvest results with expandable error details
- [ ] Rerun button on failed entries enqueues harvest job (disabled after 3 retries)
- [ ] User-facing settings page shows GSC connection section
- [ ] Scope expansion notification appears for existing GBP users
- [ ] HubSpot tab unchanged — no regressions
- [ ] Manual: all tabs visually match existing Alloro design system
