# Website ↔ Organization Linking

## Problem Statement

Users need clear visibility of the 1:1 relationship between websites and organizations in the admin UI. Currently:
- The database already enforces a 1:1 relationship (`organization_id` FK on projects table with unique constraint)
- Organizations can be linked to websites automatically during DFY tier upgrades
- There is no UI visibility or manual linking capability for this relationship

This creates a blind spot where admins cannot see or manage website-organization relationships.

## Context Summary

**Existing Schema:**
- `website_builder.projects` table has `organization_id` foreign key (nullable)
- Unique index `one_website_per_org` enforces 1:1 (allows NULL for admin projects)
- Relationship is `ON DELETE SET NULL` (unlinking on org deletion)

**Existing Patterns:**
- Super admin middleware (`superAdminMiddleware`) protects organization management
- Organization tier upgrades (`PATCH /api/admin/organizations/:id/tier`) auto-create and link projects
- Frontend uses design system components (AdminPageHeader, ActionButton, Badge)
- Error handling uses toast notifications (react-hot-toast)

**Current State:**
- Organizations view: Shows org details, users, connections — no website visibility
- Websites list: Shows hostname, status, business name — no organization visibility
- Website detail: Shows full project data — no organization visibility

## Existing Patterns to Follow

1. **API Conventions:**
   - Express routers with typed Request/Response
   - Error responses: `{ success: false, error: "CODE", message: "..." }`
   - Success responses: `{ success: true, data: {...} }`
   - Use `db()` from `../../database/connection`

2. **Authorization:**
   - All organization/website mutations require `authenticateToken` + `superAdminMiddleware`

3. **Frontend Patterns:**
   - Framer Motion for animations (`motion`, `AnimatePresence`)
   - Design system components from `../../components/ui/DesignSystem`
   - Lucide icons
   - Toast notifications for user feedback
   - Loading states with `Loader2` spinning icon

4. **Data Fetching:**
   - API functions in `src/api/` directory
   - `localStorage.getItem("auth_token")` for auth headers
   - Async/await with try/catch error handling

## Proposed Approach

### 1. Backend API Changes

#### 1.1 New Linking Endpoint

**File:** `signalsai-backend/src/routes/admin/websites.ts`

Add new endpoint:
```
PATCH /api/admin/websites/:id/link-organization
Body: { organizationId: number | null }
```

**Logic:**
- If `organizationId` is `null`: Unlink (set `organization_id = NULL`)
- If `organizationId` is provided:
  - Validate organization exists
  - Validate organization is DFY tier (`subscription_tier = 'DFY'`)
  - Check organization not already linked to another website (query projects where `organization_id = organizationId`)
  - Update `website_builder.projects` set `organization_id = organizationId`
- Return updated project

**Error Cases:**
- Organization not found → 404
- Organization is DWY tier → 400 "Only DFY organizations can have websites"
- Organization already has a website → 400 "Organization already linked to another website"
- Project not found → 404

#### 1.2 Enrich Organization Detail Response

**File:** `signalsai-backend/src/routes/admin/organizations.ts`

**Endpoint:** `GET /api/admin/organizations/:id`

Add query to fetch linked website:
```sql
SELECT id, generated_hostname, status, created_at
FROM website_builder.projects
WHERE organization_id = :orgId
LIMIT 1
```

Return in response:
```json
{
  "organization": {...},
  "users": [...],
  "connections": [...],
  "website": { id, generated_hostname, status, created_at } | null
}
```

#### 1.3 Enrich Website List Response

**File:** `signalsai-backend/src/routes/admin/websites.ts`

**Endpoint:** `GET /api/admin/websites`

Add join to organizations table:
```sql
SELECT
  projects.*,
  organizations.id as org_id,
  organizations.name as org_name,
  organizations.subscription_tier as org_tier
FROM website_builder.projects
LEFT JOIN organizations ON projects.organization_id = organizations.id
```

Return `organization` object in each project:
```json
{
  "id": "...",
  "generated_hostname": "...",
  "organization": {
    "id": 123,
    "name": "Acme Dental",
    "subscription_tier": "DFY"
  } | null
}
```

#### 1.4 Enrich Website Detail Response

**File:** `signalsai-backend/src/routes/admin/websites.ts`

**Endpoint:** `GET /api/admin/websites/:id`

Add same join as list endpoint to fetch organization details.

### 2. Frontend API Client

**File:** `signalsai/src/api/websites.ts`

Add function:
```typescript
export async function linkWebsiteToOrganization(
  projectId: string,
  organizationId: number | null
): Promise<{ success: boolean; data: WebsiteProject }> {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(`/api/admin/websites/${projectId}/link-organization`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ organizationId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to link organization");
  }

  return response.json();
}
```

Update TypeScript interfaces to include `organization` field:
```typescript
export interface WebsiteProject {
  // ... existing fields
  organization?: {
    id: number;
    name: string;
    subscription_tier: string;
  } | null;
}
```

**File:** `signalsai/src/api/organizations.ts` (if exists, otherwise create)

Add function to fetch DFY organizations for dropdown:
```typescript
export async function fetchDFYOrganizations(): Promise<{
  organizations: Array<{
    id: number;
    name: string;
    hasWebsite: boolean;
  }>;
}> {
  const token = localStorage.getItem("auth_token");
  const response = await fetch("/api/admin/organizations", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error("Failed to fetch organizations");

  const data = await response.json();

  // Filter DFY orgs and check if they have websites
  const dfyOrgs = data.organizations
    .filter((org: any) => org.subscription_tier === "DFY")
    .map((org: any) => ({
      id: org.id,
      name: org.name,
      hasWebsite: false, // Will be determined by checking if any website has this org_id
    }));

  return { organizations: dfyOrgs };
}
```

### 3. UI Changes

#### 3.1 Organization Detail View (Read-Only Display)

**File:** `signalsai/src/pages/admin/OrganizationManagement.tsx`

**Location:** In expanded details section, after "Subscription Tier" section

Add new section:
```tsx
{/* Website Section */}
<div className="rounded-xl border border-gray-200 bg-white p-4">
  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
    Website
  </h4>
  {orgDetails[org.id].website ? (
    <Link
      to={`/admin/websites/${orgDetails[org.id].website.id}`}
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-alloro-orange/30 hover:shadow-md transition-all"
    >
      <Globe className="h-5 w-5 text-alloro-orange" />
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">
          {orgDetails[org.id].website.generated_hostname}
        </p>
        <p className="text-xs text-gray-500">
          {formatStatus(orgDetails[org.id].website.status)}
        </p>
      </div>
      <ExternalLink className="h-4 w-4 text-gray-400" />
    </Link>
  ) : (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <Globe className="h-4 w-4 text-gray-300" />
      <span>No website linked</span>
    </div>
  )}
</div>
```

**Update TypeScript interface:**
```typescript
interface OrganizationDetails {
  // ... existing fields
  website?: {
    id: string;
    generated_hostname: string;
    status: string;
    created_at: string;
  } | null;
}
```

#### 3.2 Website List View (Display Organization Badge)

**File:** `signalsai/src/pages/admin/WebsitesList.tsx`

**Location:** In website card, after hostname/business name, before status badge

Add organization badge:
```tsx
{website.organization && (
  <Link
    to={`/admin/organizations`}
    onClick={(e) => e.stopPropagation()}
    className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-purple-50 border border-purple-200 rounded-full px-2.5 py-1 hover:bg-purple-100 transition-colors"
  >
    <Building2 className="h-3 w-3 text-purple-600" />
    {website.organization.name}
  </Link>
)}
{!website.organization && (
  <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
    <Building2 className="h-3 w-3" />
    No organization
  </span>
)}
```

#### 3.3 Website Detail View (Link/Unlink Controls)

**File:** `signalsai/src/pages/admin/WebsiteDetail.tsx`

**Location:** After header, before status card (new card section)

**State additions:**
```typescript
const [dfyOrganizations, setDfyOrganizations] = useState<Array<{ id: number; name: string }>>([]);
const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
const [isLinking, setIsLinking] = useState(false);
const [loadingOrgs, setLoadingOrgs] = useState(false);
```

**Load DFY organizations on mount:**
```typescript
useEffect(() => {
  loadDFYOrganizations();
}, [website?.organization?.id]);

const loadDFYOrganizations = async () => {
  try {
    setLoadingOrgs(true);
    const token = localStorage.getItem("auth_token");
    const response = await fetch("/api/admin/organizations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    // Filter to DFY orgs without websites (or currently linked org)
    const availableOrgs = data.organizations
      .filter((org: any) =>
        org.subscription_tier === "DFY" &&
        (!org.website || org.id === website?.organization?.id)
      )
      .map((org: any) => ({ id: org.id, name: org.name }));

    setDfyOrganizations(availableOrgs);
  } catch (err) {
    console.error("Failed to load organizations:", err);
    toast.error("Failed to load organizations");
  } finally {
    setLoadingOrgs(false);
  }
};
```

**Link/Unlink handler:**
```typescript
const handleLinkOrganization = async () => {
  if (!id || isLinking) return;

  try {
    setIsLinking(true);
    await linkWebsiteToOrganization(id, selectedOrgId);
    toast.success(selectedOrgId ? "Organization linked" : "Organization unlinked");
    await loadWebsite();
    await loadDFYOrganizations();
    setSelectedOrgId(null);
  } catch (err) {
    console.error("Failed to link organization:", err);
    toast.error(err instanceof Error ? err.message : "Failed to link organization");
  } finally {
    setIsLinking(false);
  }
};

const handleUnlink = async () => {
  if (!confirm("Unlink this website from the organization?")) return;
  setSelectedOrgId(null);
  await handleLinkOrganization();
};
```

**UI Card:**
```tsx
{/* Organization Link Card */}
<motion.div
  className="rounded-xl border border-gray-200 bg-white shadow-sm"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.15 }}
>
  <div className="border-b border-gray-100 px-5 py-4">
    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
      <Building2 className="h-5 w-5 text-gray-400" />
      Organization
    </h3>
  </div>

  <div className="p-5">
    {website.organization ? (
      // Currently linked
      <div className="flex items-center justify-between">
        <Link
          to={`/admin/organizations`}
          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all flex-1"
        >
          <div className="p-2 bg-purple-100 rounded-lg">
            <Building2 className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              {website.organization.name}
            </p>
            <p className="text-xs text-gray-500">
              {website.organization.subscription_tier} tier
            </p>
          </div>
          <ExternalLink className="h-4 w-4 text-gray-400" />
        </Link>

        <ActionButton
          label={isLinking ? "Unlinking..." : "Unlink"}
          icon={isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          onClick={handleUnlink}
          variant="danger"
          size="sm"
          disabled={isLinking}
        />
      </div>
    ) : (
      // Not linked - show dropdown
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Link this website to a DFY organization
        </p>

        {loadingOrgs ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading organizations...
          </div>
        ) : dfyOrganizations.length === 0 ? (
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-200">
            No available DFY organizations. All DFY organizations already have websites.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={selectedOrgId || ""}
              onChange={(e) => setSelectedOrgId(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 outline-none"
            >
              <option value="">Select organization...</option>
              {dfyOrganizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>

            <ActionButton
              label={isLinking ? "Linking..." : "Link"}
              icon={isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              onClick={handleLinkOrganization}
              variant="primary"
              disabled={!selectedOrgId || isLinking}
            />
          </div>
        )}
      </div>
    )}
  </div>
</motion.div>
```

## Architectural Decisions

### Decision 1: Website-Detail-Only Linking Controls

**Reasoning:**
- Reduces UI complexity (single source of truth for mutations)
- Aligns with workflow: admins navigate websites → link to org (not vice versa)
- Organization view remains read-only display
- Additive: bidirectional controls can be added later if needed

**Tradeoffs:**
- Admins must navigate to website detail to link/unlink
- Not symmetric (org view shows website, but can't link from there)

**Alternatives Considered:**
- Bidirectional controls (both views can link/unlink) → rejected for v1 simplicity

### Decision 2: Filter Dropdown to DFY-Only, Available Organizations

**Reasoning:**
- Prevents invalid states (DWY orgs can't have websites)
- Prevents user confusion (only show linkable orgs)
- Enforces 1:1 constraint client-side (pre-validation)

**Tradeoffs:**
- Requires frontend to fetch all orgs and filter
- Dropdown might be empty if all DFY orgs are linked

**Alternatives Considered:**
- Server-side filtered endpoint (`/api/admin/organizations/available-for-linking`) → over-engineered for v1

### Decision 3: No Cascading Deletion

**Reasoning:**
- Existing schema uses `ON DELETE SET NULL` (unlinking, not deletion)
- Preserves admin-created websites when org is deleted
- Consistent with existing pattern

**Tradeoffs:**
- Orphaned websites possible if org deleted
- Manual cleanup required if orphaned state is unwanted

## Risk Analysis

### Risk 1: Dual Linking Paths (Manual + Automatic)

**Scenario:** Admin upgrades org to DFY (auto-creates website), then manually unlinks it. Organization is DFY but has no website.

**Likelihood:** Medium
**Impact:** Low (functional but inconsistent)

**Mitigation:**
- Document that manual unlinking is allowed
- DFY tier does not require a linked website (optional)
- Tier downgrade already makes website read-only (not unlinked)

### Risk 2: Race Condition on Concurrent Linking

**Scenario:** Two admins attempt to link the same organization to different websites simultaneously.

**Likelihood:** Low
**Impact:** Medium (one request fails, user confused)

**Mitigation:**
- Database unique constraint prevents dual linking
- API returns clear error message
- Frontend shows toast error, admin can retry

### Risk 3: Stale Dropdown Data

**Scenario:** Admin A links org X to website 1. Admin B (on website 2 detail page) still sees org X in dropdown (stale data).

**Likelihood:** Medium
**Impact:** Low (API validation catches it, returns error)

**Mitigation:**
- API validation is source of truth
- Frontend shows error toast with clear message
- Admin can refresh page to reload dropdown

## Failure Mode Analysis

### Failure Mode 1: Organization Deleted While Linked

**Current Behavior:** `ON DELETE SET NULL` unlinks website automatically

**Failure Impact:** Website becomes orphaned (no org)

**Handling:** No special handling needed (expected behavior)

### Failure Mode 2: API Validation Fails (Org Already Linked)

**Trigger:** Concurrent linking or stale frontend data

**Response:** 400 error "Organization already linked to another website"

**User Experience:** Toast error message, dropdown remains enabled, admin can select different org

### Failure Mode 3: Network Failure During Link Operation

**Trigger:** Request timeout or network interruption

**Response:** Frontend catch block, toast error "Failed to link organization"

**User Experience:** Loading state stops, button re-enables, admin can retry

## Security Considerations

### Authorization

**Control:** Super admin middleware (`superAdminMiddleware`) on all mutations

**Validation:** Backend validates token + role before any database mutation

**Risk:** None (existing pattern, well-established)

### Input Validation

**Control:** Backend validates `organizationId` type (number or null)

**Control:** Backend validates organization exists before linking

**Risk:** None (standard validation)

### SQL Injection

**Control:** Parameterized queries via Knex query builder

**Risk:** None (existing pattern)

## Performance Considerations

### Database Queries

**Added Queries:**
1. `GET /api/admin/organizations/:id` → +1 query (fetch linked website)
2. `GET /api/admin/websites` → +1 LEFT JOIN (organizations table)
3. `GET /api/admin/websites/:id` → +1 LEFT JOIN (organizations table)
4. `PATCH /api/admin/websites/:id/link-organization` → +2-3 queries (validation + update)

**Impact:** Negligible (low traffic admin endpoints, small tables)

**Optimization:** None needed for v1

### Frontend Data Fetching

**Added Requests:**
1. Website detail page loads DFY orgs on mount (1 request)
2. Organization detail refetches on expand (already happening)

**Impact:** Negligible (admin UI, infrequent usage)

**Optimization:** Could cache DFY orgs in React Context (future enhancement)

### N+1 Risks

**Risk:** None (using LEFT JOIN, not separate queries per item)

## Observability & Monitoring Impact

### Logging

**Added Logs:**
- `[Admin Websites] Linking project <id> to organization <orgId>`
- `[Admin Websites] Unlinking project <id> from organization <orgId>`
- `[Admin Websites] ✓ Linked/Unlinked project <id>`

**Format:** Consistent with existing console.log pattern in admin routes

### Error Tracking

**Errors to Monitor:**
- 400 errors on linking (validation failures)
- 404 errors (org not found, project not found)
- Unique constraint violations (rare, indicates race condition)

**Pattern:** Existing error handling already captures and returns these

### Metrics Impact

**New Metrics:** None (could add in future: link/unlink rate, orphaned websites count)

**Existing Metrics:** No change

## Test Strategy

### Backend Unit Tests

**File:** `signalsai-backend/src/routes/admin/websites.test.ts` (create if not exists)

**Test Cases:**
1. Link website to DFY organization → success
2. Link website to DWY organization → 400 error
3. Link website to non-existent organization → 404 error
4. Link website to organization already linked to another website → 400 error
5. Unlink website (set organizationId = null) → success
6. Organization detail includes linked website → success
7. Website list includes organization data → success
8. Website detail includes organization data → success

### Frontend Integration Tests

**File:** `signalsai/src/pages/admin/WebsiteDetail.test.tsx` (create if not exists)

**Test Cases:**
1. Website with linked org shows org name + unlink button
2. Website without linked org shows dropdown + link button
3. Dropdown filters to DFY orgs only
4. Dropdown excludes orgs with existing websites
5. Linking success shows toast + refreshes data
6. Linking failure shows error toast
7. Unlinking shows confirmation + executes on confirm

### Manual Testing Checklist

- [ ] Organization detail shows linked website (if exists)
- [ ] Organization detail shows "No website linked" (if none)
- [ ] Website list shows organization badge (if linked)
- [ ] Website list shows "No organization" badge (if not linked)
- [ ] Website detail shows linked org with link to org page
- [ ] Website detail dropdown only shows DFY orgs
- [ ] Website detail dropdown excludes orgs with websites
- [ ] Linking success updates UI immediately
- [ ] Unlinking requires confirmation
- [ ] Unlinking success updates UI immediately
- [ ] Error toast shown on validation failure (DWY org, already linked, etc.)
- [ ] Link persists after page refresh

## Blast Radius Analysis

**Affected Components:**
- Backend: `organizations.ts`, `websites.ts` (admin routes only)
- Frontend: `OrganizationManagement.tsx`, `WebsitesList.tsx`, `WebsiteDetail.tsx`

**User Impact:**
- Super admins only (small user group)
- Read-only display changes (low risk)
- New linking controls (additive, no existing functionality broken)

**Rollback Plan:**
- Backend: Remove new endpoint, revert query changes (no DB migration needed)
- Frontend: Revert UI changes (no data model changes)

**Estimated Risk:** Low (additive feature, super admin only, no breaking changes)

## Definition of Done

### Backend
- [ ] New endpoint `PATCH /api/admin/websites/:id/link-organization` implemented
- [ ] Validation: DFY tier check, 1:1 constraint check
- [ ] Organization detail endpoint returns linked website
- [ ] Website list endpoint includes organization data (LEFT JOIN)
- [ ] Website detail endpoint includes organization data (LEFT JOIN)
- [ ] Error responses return clear messages
- [ ] Console logging added for link/unlink operations

### Frontend
- [ ] Organization detail displays linked website (or "No website linked")
- [ ] Website list displays organization badge (or "No organization")
- [ ] Website detail shows linked organization with link to org page
- [ ] Website detail shows dropdown of available DFY orgs (if not linked)
- [ ] Website detail shows unlink button (if linked)
- [ ] Dropdown filters to DFY orgs without websites
- [ ] Link/unlink operations show loading states
- [ ] Success/error toast notifications displayed
- [ ] UI refreshes after link/unlink operations
- [ ] TypeScript interfaces updated with organization field

### Testing
- [ ] Backend validation tests pass (DFY check, 1:1 check, 404s)
- [ ] Frontend displays correctly for linked/unlinked states
- [ ] Manual testing checklist completed
- [ ] Error cases handled gracefully (toast messages shown)

### Documentation
- [ ] No external documentation needed (admin-internal feature)
- [ ] Code comments added for complex validation logic
