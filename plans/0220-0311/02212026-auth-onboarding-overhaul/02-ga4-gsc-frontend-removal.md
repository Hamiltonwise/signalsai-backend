# Plan 02 — GA4/GSC Frontend Removal

**Parent:** 00-MASTER-PLAN.md
**Depends on:** 01 (backend routes deleted so frontend calls would 404 anyway)
**Estimated files:** ~20 frontend files

---

## Entry Conditions

- Plan 01 complete (GA4/GSC backend removed)
- Frontend compiles cleanly before starting

---

## Problem Statement

Remove all GA4 and GSC frontend infrastructure: API clients, hooks, contexts, integration modals, onboarding selection steps, dashboard sections, settings integration cards. After this plan, the frontend has zero GA4/GSC capability.

---

## Step 1: Delete GA4/GSC exclusive files

**Delete entirely:**

```
signalsai/src/api/ga4.ts
signalsai/src/api/gsc.ts
signalsai/src/hooks/useGA4.ts
signalsai/src/hooks/useGSC.ts
signalsai/src/contexts/GA4Context.tsx
signalsai/src/contexts/GSCContext.tsx
```

Also check for and delete if they exist:
```
signalsai/src/contexts/ga4Context.ts (type-only file)
signalsai/src/contexts/GSCContext.ts (type-only file)
```

**Delete integration modals:**
```
signalsai/src/components/GA4IntegrationModal.tsx
signalsai/src/components/GSCIntegrationModal.tsx
```

**Delete onboarding selection steps:**
```
signalsai/src/components/onboarding/Step1_GA4Selection.tsx
signalsai/src/components/onboarding/Step2_GSCSelection.tsx
```

---

## Step 2: Remove providers from App.tsx

**File:** `signalsai/src/App.tsx`

**Remove:**
- Import: `import { GSCProvider } from "./contexts/GSCContext.tsx";`
- Import: `import { GA4Provider } from "./contexts/GA4Context.tsx";`
- `<GSCProvider>` wrapper in AppProviders
- `<GA4Provider>` wrapper in AppProviders

**Keep:** All other providers (GBP, Clarity, Auth, Onboarding, etc.)

---

## Step 3: Strip GA4/GSC from Dashboard

**File:** `signalsai/src/pages/Dashboard.tsx`

**Remove:**
- Import: `GA4IntegrationModal`
- Import: `GSCIntegrationModal`
- State: `showGA4Modal`, `setShowGA4Modal`
- State: `showGSCModal`, `setShowGSCModal`
- All GA4/GSC modal open/close handlers
- All GA4/GSC modal JSX rendering (`<GA4IntegrationModal>`, `<GSCIntegrationModal>`)

**Keep:** Dashboard core, tab navigation, GBP modal, Clarity modal, PMS sections.

---

## Step 4: Strip GA4/GSC from VitalSignsCards

**File:** `signalsai/src/components/VitalSignsCards/VitalSignsCards.tsx`

**Remove:**
- Imports: useGA4, useGSC hooks
- GA4/GSC stage entries from STAGES array
- GA4/GSC state in `aiDataStatus`
- GA4/GSC hook declarations
- GA4/GSC integration status logic
- GA4/GSC data fetching on tab change
- GA4/GSC loading and error states
- GA4/GSC metric rendering

**Keep:** GBP stage, Consideration/Decision stages, PMS-based stages.

**Files to evaluate for deletion or repurposing:**
- `signalsai/src/components/VitalSignsCards/Awareness.tsx` — This is the GSC stage. If it has no purpose without GSC, delete it.
- `signalsai/src/components/VitalSignsCards/Research.tsx` — This is the GA4 stage. Same evaluation.

---

## Step 5: Strip GA4/GSC from Settings page

**File:** `signalsai/src/pages/Settings.tsx`

**Remove:**
- GA4/GSC imports (hooks, types)
- State management for `properties.ga4`, `properties.gsc`
- Modal type references for "ga4" | "gsc"
- GA4/GSC connection handlers
- GA4/GSC property state updates
- GA4/GSC disconnect logic
- GA4/GSC scope checking
- Integration card definitions for GA4 and GSC (the card objects in the integrations array)

**Keep:** Settings framework, GBP integration card, Clarity integration card (if it exists), user management tab, profile tab.

---

## Step 6: Strip GA4/GSC from PropertiesTab

**File:** `signalsai/src/components/settings/PropertiesTab.tsx`

**Remove:**
- GA4 property display section
- GSC property display section
- GA4/GSC modal triggers
- GA4/GSC disconnect handlers

**Keep:** GBP section only.

---

## Step 7: Strip GA4/GSC from MissingScopeBanner

**File:** `signalsai/src/components/settings/MissingScopeBanner.tsx`

**Remove:**
- GA4/GSC specific scope checks
- References to `analytics.readonly` and `webmasters.readonly` scopes

**Keep:** Banner framework (may still be needed for GBP scope validation).

---

## Step 8: Clean up types

**File:** `signalsai/src/types/onboarding.ts`

**Remove:**
- `GA4Property` type definition
- `GA4Site` type definition
- `GSCSite` type definition
- `GSCProperty` type definition
- Any onboarding step types that reference GA4/GSC

---

## Step 9: Clean up DashboardOverview

**File:** `signalsai/src/components/dashboard/DashboardOverview.tsx`

**Remove/Update:**
- `hasMissingData` flag — remove GA4/GSC from the required properties check
- Alert bar messaging — remove references to GA4/GSC syncing
- Fallback demo data — remove GA4/GSC demo data references

---

## Step 10: Verify

- Run `npm run build` (or `vite build`) in frontend — must compile cleanly
- Search for any remaining imports from deleted files — must find zero
- Search for `GA4`, `GSC`, `useGA4`, `useGSC`, `GA4Context`, `GSCContext` in frontend src — only comments should remain
- Manually verify: Dashboard loads, Settings loads, no console errors referencing deleted modules

---

## Exit Conditions

- [ ] All GA4/GSC exclusive frontend files deleted (12 files)
- [ ] App.tsx providers cleaned
- [ ] Dashboard renders without GA4/GSC modals
- [ ] VitalSignsCards renders without GA4/GSC stages
- [ ] Settings page shows no GA4/GSC integration cards
- [ ] PropertiesTab shows GBP only
- [ ] Types cleaned
- [ ] Frontend compiles cleanly
- [ ] No remaining imports reference deleted files
