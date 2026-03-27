# Plan: DFY Subscription Tier & User Website Dashboard

## Context

**Why this change is needed:**
Alloro currently has a website builder that only admins can access. We want to monetize this by creating a "Done For You" (DFY) tier where clients get their own website as part of their subscription.

**Current state:**
- Website builder exists (`signalsai-backend/src/routes/admin/websites.ts`, `signalsai/src/pages/admin/WebsiteDetail.tsx`)
- Organizations table exists but has NO subscription/tier fields
- Users authenticate via Google OAuth, roles managed in `organization_users` table
- Admin can create websites for any user, but users can't see/edit them

**Desired outcome:**
- Two tiers: **DWY** (current features) and **DFY** (all features + website)
- Manual tier management (Stripe integration later)
- When org is upgraded to DFY → auto-create project → admin gets email → admin generates pages → user sees their website dashboard
- User dashboard: simplified version of admin website manager, with tighter editing constraints
- Downgrade to DWY → website stays online but read-only

**User answers from clarification:**
1. **1:1 relationship** - One org gets exactly one website
2. **User capabilities** - Edit pages via AI (rate-limited), upload media (lower quota), edits focused on text/colors/images (NOT headers/links/structure)
3. **Website creation** - Auto-create empty project on upgrade, email admin, admin manually generates pages
4. **Downgrade behavior** - Website stays online, becomes read-only

---

## Database Changes

### Migration 1: Add Subscription Fields to Organizations

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_add_subscription_to_organizations.ts`

Add to `organizations` table:
```typescript
{
  subscription_tier: ENUM('DWY', 'DFY') DEFAULT 'DWY',
  subscription_status: ENUM('active', 'inactive', 'trial', 'cancelled') DEFAULT 'active',
  subscription_started_at: TIMESTAMPTZ,
  subscription_updated_at: TIMESTAMPTZ,

  // Stripe fields (for future, nullable for now)
  stripe_customer_id: VARCHAR,
  stripe_subscription_id: VARCHAR,

  // Usage tracking (for future rate limiting)
  website_edits_this_month: INTEGER DEFAULT 0,
  website_edits_reset_at: TIMESTAMPTZ
}
```

**Rationale:**
- `subscription_tier` is the source of truth for feature access
- `subscription_status` handles edge cases (cancelled but still has access until period ends)
- Rate limit fields prepared for future (reset monthly)

### Migration 2: Link Projects to Organizations

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_add_organization_to_projects.ts`

Add to `website_builder.projects` table:
```typescript
{
  organization_id: UUID REFERENCES organizations(id) ON DELETE SET NULL,
  custom_domain: VARCHAR UNIQUE,
  domain_verified_at: TIMESTAMPTZ,
  is_read_only: BOOLEAN DEFAULT FALSE
}
```

Add constraints:
```sql
-- One website per org (1:1 relationship)
CREATE UNIQUE INDEX one_website_per_org
ON website_builder.projects (organization_id)
WHERE organization_id IS NOT NULL;

-- Admin projects can exist without org
-- Allow multiple projects where organization_id IS NULL
```

**Rationale:**
- `organization_id` nullable → admin can create unassigned projects
- Unique index enforces 1:1 (org can only have one website)
- `is_read_only` flag for downgraded orgs (stays online but locked)
- `custom_domain` prepared for future CNAME support

### Migration 3: User Edit History & Rate Limiting

**File:** `signalsai-backend/src/database/migrations/YYYYMMDDHHMMSS_create_user_website_edits.ts`

New table: `website_builder.user_edits`
```typescript
{
  id: UUID PRIMARY KEY,
  organization_id: UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id: UUID REFERENCES users(id) ON DELETE CASCADE,
  project_id: UUID REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  page_id: UUID REFERENCES website_builder.pages(id) ON DELETE CASCADE,
  component_class: VARCHAR,
  instruction: TEXT,
  tokens_used: INTEGER,
  success: BOOLEAN,
  error_message: TEXT,
  created_at: TIMESTAMPTZ DEFAULT NOW()
}
```

Add index:
```sql
CREATE INDEX idx_user_edits_org_date
ON website_builder.user_edits (organization_id, created_at DESC);
```

**Rationale:**
- Audit trail for all user edits (debugging, support, abuse detection)
- Rate limiting query: `COUNT(*) WHERE organization_id = ? AND created_at > NOW() - INTERVAL '1 day'`
- Token tracking for future usage-based billing

---

## Backend Changes

### 1. Organization Tier Management Endpoints

**File:** `signalsai-backend/src/routes/admin/organizations.ts`

**New endpoints:**

**PATCH `/api/admin/organizations/:id/tier`**
```typescript
// Body: { tier: 'DWY' | 'DFY' }
// Permissions: Super admin only

async (req, res) => {
  const { id } = req.params;
  const { tier } = req.body;

  const trx = await db.transaction();

  try {
    const org = await trx('organizations').where({ id }).first();
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const oldTier = org.subscription_tier;

    // Update tier
    await trx('organizations').where({ id }).update({
      subscription_tier: tier,
      subscription_updated_at: new Date()
    });

    // UPGRADE TO DFY: Create empty website project
    if (oldTier === 'DWY' && tier === 'DFY') {
      const existingProject = await trx('website_builder.projects')
        .where({ organization_id: id })
        .first();

      if (!existingProject) {
        // Auto-create project
        const hostname = generateHostname(org.name); // e.g., "bright-dental-4821"
        await trx('website_builder.projects').insert({
          id: uuid(),
          organization_id: id,
          generated_hostname: hostname,
          status: 'CREATED',
          created_at: new Date(),
          updated_at: new Date()
        });

        // Send email to admins
        await sendToAdmins(
          `New DFY Website Ready for Setup: ${org.name}`,
          `Organization "${org.name}" has been upgraded to DFY tier.

           A website project has been created but needs pages generated.

           Action required:
           1. Go to Admin > Websites
           2. Find project: ${hostname}
           3. Click "Generate Pages" and select template

           Organization ID: ${id}`
        );
      }
    }

    // DOWNGRADE TO DWY: Make website read-only
    if (oldTier === 'DFY' && tier === 'DWY') {
      await trx('website_builder.projects')
        .where({ organization_id: id })
        .update({ is_read_only: true });
    }

    await trx.commit();

    return res.json({
      success: true,
      tier,
      message: tier === 'DFY' ? 'Organization upgraded. Website project created.' : 'Organization downgraded. Website is now read-only.'
    });
  } catch (error) {
    await trx.rollback();
    return handleError(res, error, 'update organization tier');
  }
}
```

**GET `/api/admin/organizations/:id/usage`**
```typescript
// Get usage stats for an org (edits this month, storage used, etc.)
// Returns: { website_edits: 42, media_storage_gb: 1.2 }
```

**Rationale:**
- Tier upgrade triggers project creation + admin email (semi-automated as requested)
- Downgrade sets read-only flag (website stays online)
- Transaction ensures atomic tier change + project creation
- Email uses existing `sendToAdmins()` from `emailService.ts`

### 2. User Website Endpoints (New File)

**File:** `signalsai-backend/src/routes/user/website.ts` (NEW)

**Middleware:** `tokenRefresh` (OAuth) + `rbac(['admin', 'manager'])` (org role check)

**GET `/api/user/website`**
```typescript
// Get user's organization's website
// Returns project + all published pages + media library

async (req, res) => {
  const userId = req.user.id;

  // Get user's org from context (already loaded by rbac middleware)
  const orgId = req.organizationId;

  const org = await db('organizations').where({ id: orgId }).first();

  // Check tier
  if (org.subscription_tier !== 'DFY') {
    return res.status(403).json({
      error: 'DFY_TIER_REQUIRED',
      message: 'Your organization does not have access to the website feature.'
    });
  }

  // Fetch project
  const project = await db('website_builder.projects')
    .where({ organization_id: orgId })
    .first();

  if (!project) {
    return res.json({
      status: 'PREPARING',
      message: 'We are preparing your website. You'll be notified when it's ready.'
    });
  }

  // Fetch published pages only
  const pages = await db('website_builder.pages')
    .where({ project_id: project.id, status: 'published' })
    .orderBy('path');

  // Fetch media
  const media = await db('website_builder.media')
    .where({ project_id: project.id })
    .orderBy('created_at', 'desc');

  // Calculate storage usage
  const storageUsed = media.reduce((sum, m) => sum + (m.file_size || 0), 0);
  const storageLimit = 1 * 1024 * 1024 * 1024; // 1 GB for users (vs 5GB for admin)

  return res.json({
    project: {
      id: project.id,
      hostname: project.generated_hostname,
      status: project.status,
      is_read_only: project.is_read_only,
      custom_domain: project.custom_domain,
      wrapper: project.wrapper,
      header: project.header,
      footer: project.footer
    },
    pages,
    media,
    usage: {
      storage_used: storageUsed,
      storage_limit: storageLimit,
      storage_percentage: (storageUsed / storageLimit) * 100
    }
  });
}
```

**POST `/api/user/website/pages/:pageId/edit`**
```typescript
// User AI edit with constraints
// Body: { componentClass: string, instruction: string, chatHistory: array }

async (req, res) => {
  const { pageId } = req.params;
  const { componentClass, instruction, chatHistory = [] } = req.body;
  const userId = req.user.id;
  const orgId = req.organizationId;

  // Check tier + read-only status
  const org = await db('organizations').where({ id: orgId }).first();
  if (org.subscription_tier !== 'DFY') {
    return res.status(403).json({ error: 'DFY_TIER_REQUIRED' });
  }

  const project = await db('website_builder.projects')
    .where({ organization_id: orgId })
    .first();

  if (project.is_read_only) {
    return res.status(403).json({
      error: 'READ_ONLY',
      message: 'Your website is in read-only mode. Please upgrade to continue editing.'
    });
  }

  // Rate limiting: 50 edits per day per org
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const editsToday = await db('website_builder.user_edits')
    .where({ organization_id: orgId })
    .where('created_at', '>=', today)
    .count('* as count')
    .first();

  const dailyLimit = 50; // TODO: Make this tier-configurable
  if (editsToday.count >= dailyLimit) {
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `You've reached your daily limit of ${dailyLimit} edits. Try again tomorrow.`,
      limit: dailyLimit,
      reset_at: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    });
  }

  // Fetch page
  const page = await db('website_builder.pages')
    .where({ id: pageId, project_id: project.id })
    .first();

  if (!page) {
    return res.status(404).json({ error: 'Page not found' });
  }

  // Extract component HTML
  const sections = normalizeSections(page.sections);
  const componentHtml = extractComponentByClass(sections, componentClass);

  if (!componentHtml) {
    return res.status(404).json({ error: 'Component not found' });
  }

  // Call AI with USER system prompt (stricter constraints)
  const result = await pageEditorService.editComponent(
    componentHtml,
    instruction,
    chatHistory,
    project.id,
    'user' // <-- NEW PARAMETER: use user-specific system prompt
  );

  // Log edit
  await db('website_builder.user_edits').insert({
    id: uuid(),
    organization_id: orgId,
    user_id: userId,
    project_id: project.id,
    page_id: pageId,
    component_class: componentClass,
    instruction,
    tokens_used: result.tokens_used || 0,
    success: !result.error,
    error_message: result.error ? result.message : null,
    created_at: new Date()
  });

  if (result.error) {
    return res.status(400).json(result);
  }

  // Update page sections
  const updatedSections = replaceComponentByClass(sections, componentClass, result.html);

  await db('website_builder.pages')
    .where({ id: pageId })
    .update({
      sections: JSON.stringify(updatedSections),
      updated_at: new Date()
    });

  return res.json({
    success: true,
    html: result.html,
    message: result.message,
    edits_remaining: dailyLimit - editsToday.count - 1
  });
}
```

**POST `/api/user/website/media`**
```typescript
// Upload media with 1GB quota (vs admin's 5GB)
// Same as admin upload but with lower limit
```

**Rationale:**
- `/user/website` is a new namespace (distinct from `/admin/websites`)
- Checks tier before allowing access
- Rate limiting enforced (50 edits/day)
- Only shows published pages to users (no draft confusion)
- Separate system prompt for users (more restrictive)
- Logs every edit for audit trail + future usage-based billing

### 3. Update Page Editor Service for User Prompts

**File:** `signalsai-backend/src/services/pageEditorService.ts`

**Changes:**
```typescript
// Add new parameter: promptType: 'admin' | 'user'
async function editComponent(
  componentHtml: string,
  instruction: string,
  chatHistory: any[],
  projectId: string,
  promptType: 'admin' | 'user' = 'admin' // <-- NEW
): Promise<EditResult> {
  // Fetch appropriate system prompt
  const promptKey = promptType === 'admin'
    ? 'admin_editing_system_prompt'
    : 'user_editing_system_prompt';

  const systemPrompt = await db('admin_settings')
    .where({ category: 'websites', key: promptKey })
    .first();

  if (!systemPrompt) {
    throw new Error(`System prompt not found: ${promptKey}`);
  }

  // Rest of function unchanged (calls Claude with fetched prompt)
  // ...
}
```

**Rationale:**
- Reuses existing AI editing logic
- Switches system prompt based on caller (admin vs user)
- User prompt will be more restrictive (text/colors/images only, no structural changes)

### 4. System Prompt Seed Data

**File:** `signalsai-backend/src/database/seeds/website_system_prompts.ts` (NEW)

Insert user system prompt into `admin_settings`:
```typescript
await db('admin_settings').insert({
  id: uuid(),
  category: 'websites',
  key: 'user_editing_system_prompt',
  value: `You are helping a business owner edit their website.

CONSTRAINTS:
- Focus ONLY on text, colors, images, and simple layout adjustments
- DO NOT modify navigation links, header structure, or footer
- DO NOT add/remove entire sections
- DO NOT inject scripts, iframes, or raw HTML
- Keep language simple and professional
- Preserve the original CSS class names
- Return valid HTML with the same root element and class

CAPABILITIES:
- Change text content (headings, paragraphs, button labels)
- Adjust colors (backgrounds, text, borders)
- Replace images (use provided media library URLs)
- Modify spacing (margins, padding)
- Adjust font sizes and weights
- Change button styles

If the user requests something outside these constraints, politely explain what you CAN do instead.

Always return JSON: {"error": boolean, "html": string, "message": string}`,
  created_at: new Date(),
  updated_at: new Date()
});
```

**Rationale:**
- User prompt is much more restrictive than admin prompt
- Prevents users from breaking site structure
- Guides users toward safe, simple edits
- Admin prompt remains unrestricted (full control)

---

## Frontend Changes

### 1. Update Organizations Admin Page

**File:** `signalsai/src/pages/admin/OrganizationManagement.tsx`

**Changes:**

Add tier badge display:
```typescript
// In organization list, next to org name:
<div className="flex items-center gap-2">
  <span className="font-semibold">{org.name}</span>
  <span className={`px-2 py-1 text-xs rounded ${
    org.subscription_tier === 'DFY'
      ? 'bg-purple-100 text-purple-800'
      : 'bg-gray-100 text-gray-800'
  }`}>
    {org.subscription_tier}
  </span>
</div>
```

Add tier management dropdown:
```typescript
// In expanded org details section:
<div className="mt-4 p-4 bg-gray-50 rounded">
  <h4 className="font-semibold mb-2">Subscription Tier</h4>
  <div className="flex items-center gap-4">
    <span className="text-sm text-gray-600">
      Current: <strong>{org.subscription_tier}</strong>
    </span>

    {org.subscription_tier === 'DWY' && (
      <button
        onClick={() => handleUpgradeTier(org.id)}
        className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
      >
        Upgrade to DFY
      </button>
    )}

    {org.subscription_tier === 'DFY' && (
      <button
        onClick={() => handleDowngradeTier(org.id)}
        className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
      >
        Downgrade to DWY
      </button>
    )}
  </div>
</div>

// Handler functions:
const handleUpgradeTier = async (orgId: string) => {
  if (!confirm('Upgrade this organization to DFY? A website project will be created.')) return;

  try {
    const res = await fetch(`/api/admin/organizations/${orgId}/tier`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'DFY' })
    });

    const data = await res.json();
    if (res.ok) {
      toast.success('Organization upgraded! Check your email for next steps.');
      refetchOrgs();
    } else {
      toast.error(data.message || 'Upgrade failed');
    }
  } catch (error) {
    toast.error('Network error');
  }
};
```

**Rationale:**
- Tier visible at a glance in org list
- One-click upgrade/downgrade
- Confirmation dialog prevents accidents
- Toast feedback + email notification to admin

### 2. User Sidebar - Add DFY Menu Item

**File:** `signalsai/src/components/Sidebar.tsx` (or wherever main user nav lives)

**Changes:**

Add conditional "Website" menu item:
```typescript
// Fetch org tier from context or API
const { organization } = useAuth(); // Assuming AuthContext provides org

// In sidebar menu:
{organization?.subscription_tier === 'DFY' && (
  <NavLink
    to="/dashboard/website"
    className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 rounded"
  >
    <Globe className="w-5 h-5" />
    <span>Website</span>
  </NavLink>
)}
```

**Rationale:**
- Menu item only appears for DFY orgs
- Uses existing NavLink pattern
- Icon from Lucide (already used in codebase)

### 3. User Website Dashboard (New Page)

**File:** `signalsai/src/pages/dashboard/Website.tsx` (NEW)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Pages (Sidebar)    │  Preview (Center)  │  AI Chat │
│                     │                    │  (Right) │
│  - Home             │                    │          │
│  - Services         │                    │          │
│  - Contact          │   <iframe/>        │ [Input]  │
│                     │                    │          │
│  Storage: 42% used  │                    │ [Send]   │
│  Edits: 12/50 today │                    │          │
└─────────────────────────────────────────────────────┘
```

**Component structure:**
```typescript
function Website() {
  const [website, setWebsite] = useState(null);
  const [selectedPage, setSelectedPage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWebsite();
  }, []);

  async function fetchWebsite() {
    const res = await fetch('/api/user/website');
    const data = await res.json();

    if (data.status === 'PREPARING') {
      // Show "preparing" state
      setWebsite({ status: 'PREPARING', message: data.message });
    } else {
      setWebsite(data);
      setSelectedPage(data.pages[0]); // Select first page by default
    }

    setLoading(false);
  }

  if (loading) return <Spinner />;

  if (website.status === 'PREPARING') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Your Website is Being Prepared</h2>
          <p className="text-gray-600">{website.message}</p>
          <p className="text-sm text-gray-500 mt-4">We'll send you an email when it's ready!</p>
        </div>
      </div>
    );
  }

  if (website.project.is_read_only) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Website in Read-Only Mode</h2>
          <p className="text-gray-600 mb-4">
            Your subscription has been downgraded. Your website is still live but you cannot make edits.
          </p>
          <p className="text-sm text-gray-500">
            Contact your administrator to upgrade your plan and regain editing access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Left Sidebar: Page List */}
      <PageListSidebar
        pages={website.pages}
        selectedPage={selectedPage}
        onSelectPage={setSelectedPage}
        usage={website.usage}
      />

      {/* Center: Preview */}
      <PagePreview
        page={selectedPage}
        project={website.project}
      />

      {/* Right: AI Chat */}
      <AIEditChat
        page={selectedPage}
        onEditSuccess={() => fetchWebsite()}
      />
    </div>
  );
}
```

**Rationale:**
- Three distinct states: preparing, read-only, active
- Reuses existing preview/chat components from admin (with modifications)
- Shows usage stats (storage, daily edit limit)
- Clear messaging for edge cases

### 4. Page List Sidebar Component

**File:** `signalsai/src/components/Website/PageListSidebar.tsx` (NEW)

```typescript
function PageListSidebar({ pages, selectedPage, onSelectPage, usage }) {
  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Pages</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {pages.map(page => (
          <button
            key={page.id}
            onClick={() => onSelectPage(page)}
            className={`w-full px-4 py-3 text-left hover:bg-gray-100 border-b ${
              selectedPage?.id === page.id ? 'bg-purple-50 border-l-4 border-purple-600' : ''
            }`}
          >
            <div className="font-medium">{page.path === '/' ? 'Home' : page.path}</div>
            <div className="text-xs text-gray-500">Last updated {formatDate(page.updated_at)}</div>
          </button>
        ))}
      </div>

      <div className="p-4 border-t bg-white">
        <h3 className="text-sm font-semibold mb-2">Usage</h3>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Storage</span>
            <span>{Math.round(usage.storage_percentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                usage.storage_percentage > 90 ? 'bg-red-500' : 'bg-purple-600'
              }`}
              style={{ width: `${Math.min(usage.storage_percentage, 100)}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatBytes(usage.storage_used)} / {formatBytes(usage.storage_limit)}
          </div>
        </div>

        <div className="text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Edits today</span>
            <span>{usage.edits_today || 0} / 50</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Rationale:**
- Simple list view (no create/delete actions for users)
- Shows usage stats prominently (prevents surprise rate limits)
- Active page highlighted
- Existing pages only (no "add page" button for users)

### 5. Page Preview Component

**File:** `signalsai/src/components/Website/PagePreview.tsx` (NEW)

```typescript
function PagePreview({ page, project }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [renderedHtml, setRenderedHtml] = useState('');

  useEffect(() => {
    if (!page || !project) return;

    // Use existing renderPage utility (same as admin)
    const html = renderPage(
      project.wrapper,
      project.header,
      project.footer,
      page.sections,
      null, // no section filter
      [] // no code snippets for user preview (security)
    );

    setRenderedHtml(html);
  }, [page, project]);

  // Enable component selection (reuse admin logic)
  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) return;

    // Add click handlers to highlight components
    // (Reuse from admin PageEditor component)
    attachComponentClickHandlers(iframeDoc, (componentClass) => {
      // Emit event to AI chat component
      window.dispatchEvent(new CustomEvent('component-selected', {
        detail: { componentClass }
      }));
    });
  }, [renderedHtml]);

  return (
    <div className="flex-1 bg-white flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">
          {page.path === '/' ? 'Home' : page.path}
        </h3>
        <a
          href={`https://${project.hostname}.sites.getalloro.com${page.path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-purple-600 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-4 h-4" />
          View Live
        </a>
      </div>

      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={renderedHtml}
          className="w-full h-full border-0"
          title="Page Preview"
          sandbox="allow-same-origin allow-scripts"
        />
      </div>
    </div>
  );
}
```

**Rationale:**
- Reuses `renderPage()` utility from admin (consistency)
- Enables component clicking (highlights selected element)
- "View Live" link for testing published version
- Sandboxed iframe for security

### 6. AI Edit Chat Component

**File:** `signalsai/src/components/Website/AIEditChat.tsx` (NEW)

```typescript
function AIEditChat({ page, onEditSuccess }) {
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editsRemaining, setEditsRemaining] = useState(null);

  useEffect(() => {
    // Listen for component selection from iframe
    const handleSelection = (e: CustomEvent) => {
      setSelectedComponent(e.detail.componentClass);
      setChatHistory([]); // Reset chat for new component
    };

    window.addEventListener('component-selected', handleSelection);
    return () => window.removeEventListener('component-selected', handleSelection);
  }, []);

  async function handleSubmit() {
    if (!selectedComponent || !instruction.trim()) return;

    setLoading(true);

    try {
      const res = await fetch(`/api/user/website/pages/${page.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentClass: selectedComponent,
          instruction: instruction.trim(),
          chatHistory
        })
      });

      const data = await res.json();

      if (res.status === 429) {
        // Rate limit hit
        toast.error(data.message);
        setEditsRemaining(0);
        return;
      }

      if (!res.ok) {
        toast.error(data.message || 'Edit failed');
        return;
      }

      // Success
      const newMessage = {
        role: 'user',
        content: instruction
      };
      const assistantMessage = {
        role: 'assistant',
        content: data.message
      };

      setChatHistory([...chatHistory, newMessage, assistantMessage]);
      setInstruction('');
      setEditsRemaining(data.edits_remaining);
      toast.success('Page updated!');

      onEditSuccess(); // Refresh preview
    } catch (error) {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Edit with AI</h3>
        {selectedComponent ? (
          <p className="text-xs text-gray-600 mt-1">
            Selected: <code className="bg-gray-200 px-1 rounded">{selectedComponent}</code>
          </p>
        ) : (
          <p className="text-xs text-gray-600 mt-1">
            Click on an element in the preview to start editing
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {chatHistory.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-8">
            <p>Select a component and describe your changes.</p>
            <p className="mt-2">Examples:</p>
            <ul className="mt-2 text-left space-y-1">
              <li>• "Make this text larger"</li>
              <li>• "Change the button color to blue"</li>
              <li>• "Replace this image with [image URL]"</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`p-3 rounded ${
                msg.role === 'user' ? 'bg-purple-100' : 'bg-white border'
              }`}>
                <div className="text-xs font-semibold mb-1 text-gray-600">
                  {msg.role === 'user' ? 'You' : 'AI'}
                </div>
                <div className="text-sm">{msg.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-white">
        {editsRemaining !== null && (
          <div className="text-xs text-gray-600 mb-2">
            {editsRemaining} edits remaining today
          </div>
        )}

        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Describe your changes..."
          className="w-full p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-purple-600"
          rows={3}
          disabled={!selectedComponent || loading}
        />

        <button
          onClick={handleSubmit}
          disabled={!selectedComponent || !instruction.trim() || loading}
          className="w-full mt-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? 'Editing...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
```

**Rationale:**
- Multi-turn chat per component (preserves context)
- Rate limit feedback (shows remaining edits)
- Clear instructions + examples for users
- Disabled until component selected (prevents confusion)
- Toast notifications for success/errors

---

## API Client Updates

**File:** `signalsai/src/api/website.ts` (NEW - user API, separate from admin)

```typescript
export const userWebsiteApi = {
  async getWebsite() {
    const res = await fetch('/api/user/website');
    return res.json();
  },

  async editPage(pageId: string, componentClass: string, instruction: string, chatHistory: any[]) {
    const res = await fetch(`/api/user/website/pages/${pageId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentClass, instruction, chatHistory })
    });
    return { data: await res.json(), status: res.status };
  },

  async uploadMedia(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/user/website/media', {
      method: 'POST',
      body: formData
    });
    return res.json();
  }
};
```

---

## Utility Reuse

**Components/utilities to reuse from admin:**

1. **`utils/templateRenderer.ts`** - `renderPage()`, `normalizeSections()`
   - Use as-is for user preview

2. **`utils/htmlReplacer.ts`** - `extractComponentByClass()`, `replaceComponentByClass()`
   - Backend uses for AI edits

3. **PageEditor iframe logic** - Component click handlers
   - Extract into shared utility, use in both admin and user preview

4. **AI chat interface pattern** - Chat history, loading states
   - Similar UI but separate API endpoint

**What NOT to reuse:**
- Template management UI (admin-only)
- Project settings UI (wrapper editing, hostname)
- Code snippet manager (security risk)
- Pipeline trigger buttons (admin-only)

---

## Testing Checklist

### Backend Tests (`signalsai-backend/tests/`)

**Tier Management:**
- [ ] Upgrade DWY → DFY creates project
- [ ] Upgrade sends email to admins
- [ ] Downgrade DFY → DWY sets `is_read_only = true`
- [ ] Cannot create duplicate project for same org (unique constraint)

**User Website API:**
- [ ] DWY org gets 403 on `/api/user/website`
- [ ] DFY org with no project sees "PREPARING" status
- [ ] DFY org with project sees pages + media + usage
- [ ] Only published pages returned (no drafts)

**User Edits:**
- [ ] Rate limit enforced (50 edits/day)
- [ ] Read-only project returns 403
- [ ] Edit logged to `user_edits` table
- [ ] Uses `user_editing_system_prompt` (not admin prompt)
- [ ] Edit count returned in response

**Media Upload:**
- [ ] User upload respects 1GB quota
- [ ] Upload fails if quota exceeded
- [ ] User cannot delete admin-uploaded media

### Frontend Tests (`signalsai/tests/`)

**Organizations Admin:**
- [ ] Tier badge shows DWY/DFY correctly
- [ ] Upgrade button only shows for DWY orgs
- [ ] Downgrade button only shows for DFY orgs
- [ ] Confirmation dialog appears
- [ ] Toast shows success/error

**User Dashboard:**
- [ ] "PREPARING" state shows correctly
- [ ] Read-only state shows correctly
- [ ] Pages list renders
- [ ] Page selection updates preview
- [ ] Usage stats display correctly
- [ ] Storage bar changes color at 90%

**AI Chat:**
- [ ] Cannot send without selecting component
- [ ] Chat history preserves context
- [ ] Rate limit message shows
- [ ] Success toast on edit
- [ ] Preview refreshes after edit

### End-to-End Test

1. Admin upgrades org to DFY
2. Admin receives email
3. Admin goes to website builder, sees new project
4. Admin generates pages
5. User logs in, sees "Website" in sidebar
6. User clicks "Website", sees pages
7. User selects page, clicks component
8. User sends edit instruction
9. AI updates component
10. User refreshes, sees changes live
11. User hits rate limit (50 edits)
12. User sees error message
13. Admin downgrades org to DWY
14. User sees read-only message
15. Website still accessible at public URL

---

## Migration Order

**Execute in this order to avoid dependency errors:**

1. `YYYYMMDDHHMMSS_add_subscription_to_organizations.ts`
   - Adds tier fields to orgs

2. `YYYYMMDDHHMMSS_add_organization_to_projects.ts`
   - Links projects to orgs (with 1:1 constraint)

3. `YYYYMMDDHHMMSS_create_user_website_edits.ts`
   - Audit log table

4. `YYYYMMDDHHMMSS_seed_user_system_prompt.ts`
   - Inserts user editing system prompt into `admin_settings`

---

## Security Considerations

**Rate Limiting:**
- 50 edits/day per org (prevents AI abuse)
- Tracked in `user_edits` table (not just in-memory)
- Can upgrade limit in future tiers

**System Prompt Isolation:**
- Admin prompt: full HTML control
- User prompt: text/colors/images only, no scripts
- Enforced by separate prompts in `admin_settings`

**Read-Only Enforcement:**
- `is_read_only` flag checked before all edits
- Pages still served publicly (no data loss)
- User sees clear messaging

**Media Quota:**
- Users: 1GB limit (vs admin: 5GB)
- Enforced on upload
- Storage usage displayed proactively

**Component Class Validation:**
- Frontend checks class exists after AI edit
- Prevents broken multi-turn editing
- Preserves page structure

**No Code Injection:**
- Code snippet manager hidden from users
- User edits sanitized by Claude (system prompt constraints)
- Iframe sandboxed in preview

---

## Future Enhancements (Not in This Plan)

**Stripe Integration:**
- Webhook handlers for subscription events
- Auto-upgrade/downgrade on payment success/failure
- Trial period support

**Custom Domains:**
- DNS verification flow
- SSL cert provisioning (Let's Encrypt)
- CNAME record management UI

**Usage-Based Billing:**
- Track tokens used per org
- Charge overage fees
- Usage analytics dashboard

**Tiered Rate Limits:**
- DFY Basic: 50 edits/day
- DFY Pro: 200 edits/day
- DFY Enterprise: unlimited

**User Media Upload UI:**
- Drag-drop uploader
- Image cropping/resizing
- Media gallery browser

**Page Creation:**
- Users can request new pages
- Admin approves + generates
- Notification system

**Collaborative Editing:**
- Multiple org users editing same site
- Real-time presence indicators
- Edit conflict resolution

---

## Summary

This plan adds a complete DFY subscription tier with:

✅ **Manual tier management** (Stripe later)
✅ **1:1 org-to-website relationship** (enforced by DB constraint)
✅ **Auto-project creation on upgrade** (with admin email notification)
✅ **User dashboard** (simplified version of admin website manager)
✅ **AI editing with constraints** (separate system prompt, rate-limited)
✅ **Media upload** (1GB user quota vs 5GB admin)
✅ **Read-only downgrade** (website stays online, edits blocked)
✅ **Usage tracking** (audit log, future billing prep)
✅ **Custom domain prep** (schema ready, UI later)

**Database changes:**
- 3 migrations (org tier fields, project-org link, user edits table)
- 1 seed (user system prompt)

**Backend changes:**
- 1 new route file (`routes/user/website.ts`)
- 2 new endpoints in admin orgs (`PATCH /tier`, `GET /usage`)
- 1 service update (page editor prompt selection)

**Frontend changes:**
- 1 updated admin page (org management tier controls)
- 1 new user page (`pages/dashboard/Website.tsx`)
- 3 new components (PageListSidebar, PagePreview, AIEditChat)
- 1 sidebar menu item (conditional on tier)

**Reuses existing:**
- `templateRenderer.ts` utilities
- `htmlReplacer.ts` utilities
- Email service
- Page editor AI service
- Admin website preview logic

**No tech debt introduced:**
- Follows existing patterns (RBAC, error handling, DB structure)
- Clear separation of admin vs user APIs
- Rate limiting prepared for scale
- Audit logging for debugging
- Graceful downgrade (read-only, not deleted)

Future-us will be able to add Stripe webhooks, custom domains, and advanced features without refactoring this foundation.