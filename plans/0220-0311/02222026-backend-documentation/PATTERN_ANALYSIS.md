# SignalsAI Backend - Pattern Analysis

**Generated:** 2026-02-18
**Purpose:** Document shared patterns and inconsistencies across all 34 route files

---

## Table of Contents
1. [Authentication Patterns](#authentication-patterns)
2. [Validation Patterns](#validation-patterns)
3. [Error Handling Patterns](#error-handling-patterns)
4. [Database Access Patterns](#database-access-patterns)
5. [Response Format Patterns](#response-format-patterns)
6. [Logging Patterns](#logging-patterns)
7. [Authorization Patterns](#authorization-patterns)
8. [Google API Integration Patterns](#google-api-integration-patterns)

---

## Authentication Patterns

### Middleware Usage Summary

The backend uses **4 primary authentication middleware strategies**:

#### 1. **tokenRefreshMiddleware** (Most Common)
- **Used in:** 19 routes
- **Files:** settings.ts, profile.ts, onboarding.ts, ga4.ts, gsc.ts, gbp.ts, clarity.ts, tasks.ts, pms.ts, practiceRanking.ts, places.ts, scraper.ts, monday.ts, rag.ts, audit.ts, user/website.ts
- **Purpose:** OAuth2 token validation + automatic refresh before expiry
- **Provides:** `req.oauth2Client`, `req.googleAccountId`, `req.userId`
- **Pattern:**
  ```typescript
  router.get("/endpoint", tokenRefreshMiddleware, async (req: RBACRequest, res) => {
    const googleAccountId = req.googleAccountId;
    // ...
  });
  ```

#### 2. **RBAC Middleware** (Role-Based Access Control)
- **Used in:** settings.ts, profile.ts with tokenRefreshMiddleware
- **Combined pattern:**
  ```typescript
  router.get("/endpoint", tokenRefreshMiddleware, rbacMiddleware, async (req: RBACRequest, res) => {
    const userRole = req.userRole; // 'admin' | 'manager' | 'viewer'
    // ...
  });
  ```
- **Role checking:** `requireRole('admin')`, `requireRole('admin', 'manager')`
- **Hierarchy:** admin > manager > viewer

#### 3. **authenticateToken** (JWT Only)
- **Used in:** auth.ts, admin/auth.ts
- **Purpose:** Basic JWT validation without OAuth2
- **Pattern:**
  ```typescript
  router.get("/endpoint", authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    // ...
  });
  ```

#### 4. **superAdminMiddleware** (Elevated Privileges)
- **Used in:** admin/auth.ts
- **Purpose:** Restrict to super admin emails only
- **Combined with:** authenticateToken
- **Pattern:**
  ```typescript
  router.post("/pilot/:userId", authenticateToken, superAdminMiddleware, async (req, res) => {
    // Only super admins can impersonate users
  });
  ```

#### 5. **No Authentication** (Public Routes)
- **Used in:** auth-otp.ts, websiteContact.ts, support.ts, admin/websites.ts (partial)
- **Routes:**
  - `POST /api/auth/otp/request` - Request OTP code
  - `POST /api/auth/otp/verify` - Verify OTP code
  - `POST /api/websites/contact` - Public contact form (reCAPTCHA protected)
  - `POST /api/support/inquiry` - Public support form
  - `GET /api/admin/websites/rendered/:projectId` - Public website rendering

### Inconsistencies

#### Header vs Query Parameter Authentication
- **Most routes:** Use `req.googleAccountId` from tokenRefreshMiddleware
- **notifications.ts:** Accepts `x-google-account-id` header OR `?googleAccountId` query param
  ```typescript
  const googleAccountId = req.query.googleAccountId || req.headers['x-google-account-id'];
  ```
- **onboarding.ts:** Supports both middleware OR manual header extraction
  ```typescript
  const googleAccountId = req.googleAccountId ?? getAccountIdFromHeader(req);
  ```

#### Mixed Authentication Requirements
- **agentsV2.ts:** Some endpoints use tokenRefreshMiddleware, others don't (manual googleAccountId extraction)
- **admin/websites.ts:** Mix of authenticated + public routes in same file

#### Token Types
- **Standard JWT:** Used for OTP auth (`auth-otp.ts`)
- **Pilot Token:** Special 1-hour JWT with `isPilot: true` for admin impersonation
- **OAuth2 Token:** Managed by tokenRefreshMiddleware for Google APIs

---

## Validation Patterns

### Input Validation Strategy

**No validation library is used.** All validation is manual inline checks.

### Common Validation Patterns

#### 1. **Required Field Checks** (Most Common)
```typescript
if (!field || !field.trim()) {
  return res.status(400).json({
    success: false,
    error: "Missing required field",
    message: "field is required"
  });
}
```

**Observed in:** 28+ route files

#### 2. **Type Checking**
```typescript
if (typeof value !== 'string') {
  return res.status(400).json({ error: "value must be a string" });
}
```

**Observed in:** admin/settings.ts, support.ts

#### 3. **Email Validation**
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return res.status(400).json({ error: "Invalid email format" });
}
```

**Observed in:** support.ts

#### 4. **ID Parsing**
```typescript
const id = parseInt(req.params.id, 10);
if (isNaN(id)) {
  return res.status(400).json({ error: "Invalid ID" });
}
```

**Observed in:** notifications.ts, settings.ts, admin/agentOutputs.ts

#### 5. **Array Validation**
```typescript
if (!ids || !Array.isArray(ids) || ids.length === 0) {
  return res.status(400).json({ error: "Must provide an array of IDs" });
}
```

**Observed in:** admin/agentOutputs.ts, adminAgentInsights.ts

#### 6. **Enum Validation**
```typescript
if (!['admin', 'manager', 'viewer'].includes(role)) {
  return res.status(400).json({ error: "Invalid role" });
}
```

**Observed in:** settings.ts, admin/organizations.ts

#### 7. **reCAPTCHA Verification** (websiteContact.ts)
```typescript
if (!captchaToken) {
  return res.status(400).json({ error: "reCAPTCHA verification is required" });
}

// Verify with Google
const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `secret=${recaptchaSecret}&response=${captchaToken}`
});
```

### Inconsistencies

#### Error Message Format Variability
- **Some routes:** Return `{ error: string }`
- **Other routes:** Return `{ success: false, error: string, message: string }`
- **No standard:** Some use generic messages, others use detailed explanations

#### Validation Timing
- **Early validation:** Most routes validate at the top of handler
- **Late validation:** Some routes (e.g., practiceRanking.ts) validate after DB queries

#### Missing Validation
- **No SQL injection protection:** Direct string interpolation in some dynamic queries
- **No input length limits:** Most routes don't limit string lengths
- **No rate limiting:** No explicit rate limit middleware observed

---

## Error Handling Patterns

### Pattern 1: **handleError Helper Function** (Most Common)

**Used in:** 23 route files

```typescript
const handleError = (res: Response, error: any, operation: string) => {
  console.error(`[Context] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
};
```

**Variants:**
- **notifications.ts, profile.ts, settings.ts, onboarding.ts:** Include `timestamp`
- **support.ts, appLogs.ts:** Use uppercase error codes like `"SERVER_ERROR"`
- **admin/agentOutputs.ts, adminAgentInsights.ts:** Use structured error codes like `"FETCH_ERROR"`, `"UPDATE_ERROR"`

**Usage:**
```typescript
try {
  // Logic
} catch (error) {
  return handleError(res, error, "Fetch notifications");
}
```

### Pattern 2: **Inline Error Handling** (Less Common)

**Used in:** auth.ts, auth-otp.ts, googleauth.ts, websiteContact.ts

```typescript
try {
  // Logic
} catch (error) {
  console.error("[Context] Error:", error);
  return res.status(500).json({ error: "Internal server error" });
}
```

### Pattern 3: **Domain-Specific Error Responses**

#### Business Logic Errors (400 range)
```typescript
// 400 - Bad Request
return res.status(400).json({
  success: false,
  error: "MISSING_NAME",
  message: "Name is required"
});

// 403 - Forbidden
return res.status(403).json({
  error: "Only admins can remove users"
});

// 404 - Not Found
return res.status(404).json({
  success: false,
  error: "Account not found"
});

// 409 - Conflict
return res.status(409).json({
  success: false,
  error: "User is already a member of this organization"
});
```

#### External Service Errors
```typescript
// 502 - Bad Gateway (for n8n webhook failures)
return res.status(502).json({
  error: "Failed to send email"
});
```

### Inconsistencies

#### Status Code Usage
- **500 errors:** Some routes return generic `500` for all errors
- **Specific errors:** Other routes use `400`, `403`, `404`, `409` appropriately
- **No consistency:** Same error type (e.g., "missing field") returns `400` in some routes, `500` in others

#### Error Object Structure
- **3 different formats:**
  1. `{ error: string }`
  2. `{ success: false, error: string }`
  3. `{ success: false, error: string, message: string, timestamp: string }`

#### Logging Consistency
- **Some routes:** Log full error object with stack trace
- **Other routes:** Log only `error.message`
- **No structured logging:** All use `console.error`, no log levels

#### Missing Error Handling
- **agentsV2.ts:** 4,161 lines with complex async operations, but minimal error boundaries
- **practiceRanking.ts:** Batch operations with no rollback on partial failure
- **No global error handler:** Each route implements its own error handling

---

## Database Access Patterns

### Pattern 1: **Direct Knex Queries** (Dominant Pattern)

**829 direct database operations** found across all route files.

#### Basic CRUD Examples
```typescript
// SELECT
const user = await db("users").where({ id: userId }).first();

// INSERT
const [newUser] = await db("users")
  .insert({ email, name, created_at: new Date() })
  .returning("*");

// UPDATE
await db("google_accounts")
  .where({ id: googleAccountId })
  .update({ phone, updated_at: new Date() });

// DELETE
await db("notifications").where({ id: notificationId }).delete();
```

#### Complex Queries
```typescript
// JOIN
const users = await db("organization_users")
  .join("users", "organization_users.user_id", "users.id")
  .where("organization_users.organization_id", orgId)
  .select("users.id", "users.email", "organization_users.role");

// AGGREGATION
const unreadCount = await db("notifications")
  .where({ domain_name: domain, read: false })
  .count("* as count");

// RAW SQL (adminAgentInsights.ts)
db.raw("SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) as pass_count")
```

### Pattern 2: **Domain Filtering** (Multi-Tenant Pattern)

**Used in:** 15+ routes

```typescript
// Step 1: Get domain from google account
const googleAccount = await db("google_accounts")
  .where({ id: googleAccountId })
  .first();

const domain = googleAccount.domain_name;

// Step 2: Filter by domain
const data = await db("table")
  .where({ domain_name: domain })
  .select("*");
```

**Tables using domain filtering:**
- `notifications` → domain_name
- `tasks` → domain
- `agent_results` → domain
- `practice_rankings` → domain
- `pms_data` → domain

### Pattern 3: **JSON Field Handling**

**Observed in:** 12 route files

```typescript
// Parse JSON from database
let properties = googleAccount.google_property_ids;
if (typeof properties === "string") {
  properties = JSON.parse(properties);
}

// Store JSON in database
await db("google_accounts").update({
  google_property_ids: JSON.stringify(data)
});
```

**Tables with JSON columns:**
- `google_accounts.google_property_ids` (GA4, GSC, GBP config)
- `google_accounts.setup_progress` (onboarding state)
- `notifications.metadata` (notification context)
- `agent_results.agent_input`, `agent_results.agent_output` (agent I/O)
- `agent_recommendations.evidence_links` (governance links)

### Pattern 4: **Transactions** (Rare)

**Only used in:** onboarding.ts, admin/websites.ts

```typescript
await db.transaction(async (trx) => {
  const googleAccount = await trx("google_accounts")
    .where({ id: googleAccountId })
    .first();

  let orgId = googleAccount.organization_id;

  if (!orgId) {
    const [newOrg] = await trx("organizations")
      .insert({ name, domain })
      .returning("id");
    orgId = newOrg.id;
  }

  await trx("google_accounts")
    .where({ id: googleAccountId })
    .update({ organization_id: orgId });
});
```

### Pattern 5: **Batch Operations**

**practiceRanking.ts** uses batch inserts for performance:
```typescript
// Insert 1000+ rows at once
await db("practice_rankings").insert(rankingsToInsert);
```

### Inconsistencies

#### Table Name Formats
- **Most tables:** public schema (implicit)
- **Website builder:** `website_builder.projects`, `website_builder.admin_settings` (explicit schema)
- **No consistency:** Some queries use schema prefix, most don't

#### Timestamp Handling
- **Most routes:** Use `new Date()` for timestamps
- **Some routes:** Use `db.fn.now()` (admin/settings.ts)
- **Inconsistency:** Mix of JS timestamps vs DB timestamps

#### Null Handling
- **Some routes:** Use `.whereNotNull("field")`
- **Other routes:** Filter nulls in JavaScript after query
- **No standard:** Inconsistent approach to null values

#### No Repository Pattern
- **Every route:** Directly imports `db` from `../database/connection`
- **No abstraction:** No repository layer, no query builders beyond Knex
- **Tight coupling:** Routes are tightly coupled to database schema

---

## Response Format Patterns

### Pattern 1: **Standardized Success Response** (Most Common)

```typescript
return res.json({
  success: true,
  data: result,
  message: "Operation completed successfully"
});
```

**Observed in:** 25+ route files

### Pattern 2: **Success with Metadata**

```typescript
return res.json({
  success: true,
  data: items,
  pagination: {
    page: pageNum,
    limit: limitNum,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limitNum)
  }
});
```

**Used in:** admin/agentOutputs.ts, adminAgentInsights.ts, admin/organizations.ts

### Pattern 3: **Simple Data Response**

```typescript
return res.json(data);
```

**Used in:** ga4.ts, gsc.ts, gbp.ts, clarity.ts (Google API proxies)

### Pattern 4: **Array Response**

```typescript
return res.json([item1, item2, item3]);
```

**Used in:** gsc.ts (`GET /sites/get`), documentation.ts (static export)

### Pattern 5: **Trend Score Response**

**ga4.ts, gsc.ts, gbp.ts, clarity.ts** use this pattern:
```typescript
return res.json({
  metricName: {
    prevMonth: number,
    currMonth: number
  },
  trendScore: number // Weighted percentage change
});
```

### Inconsistencies

#### Success Field Usage
- **With `success: true`:** 23 routes
- **Without `success` field:** 9 routes (Google API proxies, documentation.ts)

#### Data Wrapping
- **Wrapped in `data` key:** Most routes
- **Direct response:** Google API routes return data directly without wrapping

#### Message Field
- **Always included:** Some routes always return `message` field
- **Only on errors:** Other routes only include `message` for errors
- **Never included:** Some routes never include `message` field

#### Pagination
- **Standard pagination:** admin/agentOutputs.ts, adminAgentInsights.ts, admin/organizations.ts
- **No pagination:** Most routes return all results (potential memory issue for large datasets)

---

## Logging Patterns

### Pattern 1: **Prefixed Console Logs** (Most Common)

```typescript
console.log("[Context] Operation started");
console.error("[Context] Operation Error:", error?.message || error);
```

**Observed patterns:**
- `[Settings]`, `[Profile]`, `[Onboarding]`, `[Notifications]`
- `[Admin Agent Insights]`, `[Admin Agent Outputs]`, `[Support]`
- `[GA4]`, `[GSC]`, `[GBP]`, `[Clarity]`
- `[AGENTS]`, `[PMS]`, `[RANKING]`

### Pattern 2: **Checkmark for Success**

```typescript
console.log(`[Context] ✓ Operation completed successfully`);
```

**Used in:** adminAgentInsights.ts, admin/agentOutputs.ts, appLogs.ts, support.ts

### Pattern 3: **Structured Logging**

```typescript
console.log("[Context] Operation", {
  userId,
  operation: "fetch",
  duration: Date.now() - startTime
});
```

**Used rarely:** Only in settings.ts (scope debugging)

### Pattern 4: **No Logging**

**auth-otp.ts, websiteContact.ts, support.ts:** Minimal logging for security reasons

### Inconsistencies

#### Log Levels
- **Only uses:** `console.log`, `console.error`, `console.warn`
- **No structured logging:** No log levels (INFO, WARN, ERROR, DEBUG)
- **No log aggregation:** No integration with logging services

#### Log Content
- **Some routes:** Log full request/response objects
- **Other routes:** Log only operation names
- **Security concern:** Some routes log sensitive data (tokens, passwords)

#### Log Timing
- **Entry/exit logging:** Rare (only in large operations like practiceRanking.ts)
- **Error-only logging:** Most routes only log errors
- **No correlation IDs:** No way to trace a request across multiple services

---

## Authorization Patterns

### Pattern 1: **RBAC (Role-Based Access Control)**

**Used in:** settings.ts, profile.ts

```typescript
// Middleware checks role
router.post("/endpoint", tokenRefreshMiddleware, rbacMiddleware, requireRole('admin'), async (req, res) => {
  // Only admin can access
});

// Roles: 'admin' | 'manager' | 'viewer'
```

**Role hierarchy:**
- **Admin:** Full access (manage users, properties, settings)
- **Manager:** Can invite users (except admins), view data
- **Viewer:** Read-only access

### Pattern 2: **Super Admin Check**

**Used in:** auth-otp.ts, admin/auth.ts

```typescript
const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase());

const isSuperAdmin = superAdminEmails.includes(email);

if (isAdminLogin && !isSuperAdmin) {
  return res.status(403).json({ error: "Access denied" });
}
```

### Pattern 3: **Domain-Based Isolation** (Multi-Tenancy)

**Used in:** notifications.ts, tasks.ts, agent outputs

```typescript
// Step 1: Get user's domain
const domain = await getDomainFromAccountId(googleAccountId);

// Step 2: Verify resource belongs to domain
const resource = await db("table")
  .where({ id: resourceId, domain_name: domain })
  .first();

if (!resource) {
  return res.status(404).json({ error: "Resource not found or access denied" });
}
```

### Pattern 4: **Self-Action Prevention**

**settings.ts:**
```typescript
// Prevent removing yourself
if (userId === userIdToRemove) {
  return res.status(400).json({ error: "You cannot remove yourself" });
}

// Prevent changing own role
if (req.userId === userIdToUpdate) {
  return res.status(400).json({ error: "You cannot change your own role" });
}
```

### Pattern 5: **Manager Restrictions**

**settings.ts:**
```typescript
// Managers can only invite managers and viewers, not admins
if (req.userRole === 'manager' && role === 'admin') {
  return res.status(403).json({ error: "Managers cannot invite admins" });
}
```

### Inconsistencies

#### Authorization Placement
- **Middleware-based:** settings.ts, profile.ts use `requireRole()` middleware
- **Inline checks:** Most routes check permissions inside handler logic
- **No consistency:** Mix of declarative (middleware) and imperative (inline) authorization

#### Domain Filtering
- **Some routes:** Strictly enforce domain filtering (notifications.ts, tasks.ts)
- **Other routes:** No domain filtering (admin routes, Google API proxies)
- **Security risk:** Some routes accessible across domains

---

## Google API Integration Patterns

### Pattern 1: **OAuth2 Client from Middleware**

**Used in:** ga4.ts, gsc.ts, gbp.ts, clarity.ts, places.ts

```typescript
router.post("/endpoint", tokenRefreshMiddleware, async (req: RBACRequest, res) => {
  const oauth2Client = req.oauth2Client; // Provided by middleware

  const analyticsAdmin = google.analyticsadmin({
    version: "v1beta",
    auth: oauth2Client
  });

  const response = await analyticsAdmin.accountSummaries.list();
});
```

### Pattern 2: **Property ID Normalization**

**ga4.ts:**
```typescript
// Ensure property ID has "properties/" prefix
const normalizedPropertyId = propertyId.startsWith("properties/")
  ? propertyId
  : `properties/${propertyId}`;
```

### Pattern 3: **Date Range Handling**

**All Google API routes** use previous month by default:
```typescript
const now = new Date();
const currentMonth = now.getMonth();
const currentYear = now.getFullYear();

// Previous month (because current month data is incomplete)
const prevMonthDate = currentMonth === 0
  ? new Date(currentYear - 1, 11, 1) // December of last year
  : new Date(currentYear, currentMonth - 1, 1);

const startDate = prevMonthDate.toISOString().split("T")[0]; // YYYY-MM-DD
```

### Pattern 4: **Retry Logic**

**practiceRanking.ts (Google Business Profile API):**
```typescript
async function queryReviewsWithRetry(
  auth: OAuth2Client,
  accountId: string,
  locationId: string,
  retries = 3
): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await queryReviews(auth, accountId, locationId);
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
    }
  }
}
```

### Pattern 5: **Opportunity Detection**

**ga4.ts, gsc.ts, gbp.ts** analyze data and suggest improvements:
```typescript
const opportunities: any[] = [];

// Example: Low engagement rate
if (engagementRate < 0.3) {
  opportunities.push({
    type: "low_engagement",
    message: "Consider improving content quality or page speed",
    currentRate: engagementRate
  });
}
```

### Inconsistencies

#### Error Handling from Google APIs
- **Some routes:** Wrap Google API errors in custom error responses
- **Other routes:** Return Google API errors directly
- **No retry logic:** Most routes don't retry failed Google API calls (except practiceRanking.ts)

#### Data Caching
- **No caching:** All routes make live API calls on every request
- **Performance impact:** Repeated calls to Google APIs could be rate-limited

---

## Summary

### Major Patterns Identified
1. **Authentication:** 4 distinct middleware strategies (tokenRefresh, RBAC, JWT, superAdmin)
2. **Validation:** Manual inline validation (no library)
3. **Error Handling:** `handleError` helper function in 23 files
4. **Database:** 829 direct Knex queries, no repository pattern
5. **Response Format:** Mostly standardized `{ success, data, message }`
6. **Logging:** Prefixed console.log/error with context tags
7. **Authorization:** Mix of RBAC middleware + inline domain filtering
8. **Google APIs:** OAuth2 client from middleware, previous month date ranges

### Critical Inconsistencies
1. **Error responses:** 3 different formats across routes
2. **Validation timing:** Some routes validate early, others late
3. **Authentication:** Mixed header/query param extraction
4. **Logging:** No structured logging, inconsistent log levels
5. **Authorization:** Mix of declarative (middleware) and imperative (inline) checks
6. **Transactions:** Only 2 routes use transactions despite multi-step operations
7. **Pagination:** Only 3 routes implement pagination (potential memory issues)

### Recommendations for Refactoring
1. **Standardize error responses** to single format
2. **Introduce validation library** (e.g., Zod, Joi) for consistent input validation
3. **Implement repository pattern** to decouple routes from database
4. **Add structured logging** with correlation IDs
5. **Standardize authentication** to single middleware approach
6. **Add caching layer** for Google API responses
7. **Implement pagination** for all list endpoints
8. **Use transactions** for multi-step database operations
9. **Add rate limiting** to public endpoints
10. **Centralize business logic** into service layer (Phase 4: Dependency Map will detail this)
