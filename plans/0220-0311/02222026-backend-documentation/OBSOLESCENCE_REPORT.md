# SignalsAI Backend - Obsolescence Report

**Generated:** 2026-02-18
**Purpose:** Identify routes that may be dead, broken, deprecated, or require attention

---

## Table of Contents
1. [TODO Comments](#todo-comments)
2. [Deprecated Features](#deprecated-features)
3. [Temporarily Disabled Code](#temporarily-disabled-code)
4. [Commented-Out Code](#commented-out-code)
5. [Low/No Usage Indicators](#lowno-usage-indicators)
6. [Broken Patterns](#broken-patterns)
7. [External Dependency Risks](#external-dependency-risks)
8. [Summary and Recommendations](#summary-and-recommendations)

---

## TODO Comments

### 1. **user/website.ts:251** - Missing Token Usage Tracking
```typescript
tokens_used: 0, // TODO: get from result if available
```

**Context:** AI page editing endpoint
**Issue:** Token usage is hardcoded to 0 instead of being extracted from Claude API response
**Impact:** Low - Analytics/billing tracking missing
**Recommendation:** Extract token usage from Claude API response object

**Priority:** 🟡 Medium

---

### 2. **agentsV2.ts:463** - Temporary Code Change
```typescript
// TODO: Revert this when needed
```

**Context:** Agent execution logic (unclear which feature)
**Issue:** Temporary code change without explanation
**Impact:** Unknown - Need to investigate what was changed
**Recommendation:** Review git history to understand what was reverted and whether it needs to be restored

**Priority:** 🟡 Medium

---

### 3. **practiceRanking.ts:484, 507** - User Email Notification Disabled (1st occurrence)
```typescript
// TODO: REVERT - User email temporarily disabled
// ... email sending code commented out ...
// TODO: REVERT - Uncomment to re-enable user email notification
```

**Context:** Practice ranking computation completion notifications
**Issue:** User email notifications are disabled
**Impact:** High - Users don't get notified when rankings are computed
**Reason:** Unclear why disabled (testing? spam prevention?)
**Recommendation:** Re-enable if rankings are stable, otherwise clarify permanent removal

**Priority:** 🔴 High

---

### 4. **practiceRanking.ts:883, 906** - User Email Notification Disabled (2nd occurrence)
```typescript
// TODO: REVERT - User email temporarily disabled
// ... email sending code commented out ...
// TODO: REVERT - Uncomment to re-enable user email notification
```

**Context:** Weekly ranking computation notifications (same issue as #3)
**Issue:** Duplicate disabled email notification logic
**Impact:** High - Users don't get weekly ranking updates
**Recommendation:** Re-enable or remove permanently

**Priority:** 🔴 High

---

## Deprecated Features

### 1. **imports.ts** - Deprecated Versions Handling
```typescript
// Deprecated versions return 410 Gone
if (record.status === "deprecated") {
  return res.status(410).json({
    error: "DEPRECATED",
    message: `Version ${versionNum} of "${filename}" has been deprecated`
  });
}
```

**Context:** PMS import version management
**Issue:** System supports deprecated import versions (graceful degradation)
**Impact:** Low - Handled correctly with 410 Gone response
**Recommendation:** Monitor usage, remove deprecated versions after grace period

**Priority:** 🟢 Low

---

### 2. **agentsV2.ts:3803** - DEPRECATED Endpoint
```typescript
/**
 * DEPRECATED - Use /proofline-run instead
 */
router.post("/old-endpoint", ...)
```

**Context:** Old proofline agent execution endpoint
**Issue:** Endpoint marked as deprecated but still exists in codebase
**Impact:** Medium - May confuse developers, could be accidentally used
**Recommendation:** Remove entirely if no longer used, or add runtime warning + redirect

**Priority:** 🟡 Medium

---

### 3. **admin/imports.ts** - Status Management for Deprecated Imports
```typescript
if (!["published", "active", "deprecated"].includes(status)) {
  return res.status(400).json({
    message: "Status must be one of: published, active, deprecated"
  });
}
```

**Context:** Import file status management
**Issue:** System explicitly supports "deprecated" status
**Impact:** Low - Part of version management workflow
**Recommendation:** Keep as-is, document deprecation workflow

**Priority:** 🟢 Low

---

## Temporarily Disabled Code

### 1. **agentsV2.ts:413, 466** - Clarity Data Disabled
```typescript
// clarity: params.clarityData || null,  // Temporarily disabled for testing
```

**Context:** Agent input construction
**Issue:** Microsoft Clarity data integration disabled
**Impact:** High - Agents don't have access to Clarity heatmap/session data
**Reason:** Testing purposes (according to comment)
**Recommendation:** Re-enable after testing, or remove if Clarity is no longer used

**Priority:** 🔴 High

---

### 2. **practiceRanking.ts:484, 883** - Email Notifications Disabled (see TODO section)
**Priority:** 🔴 High

---

## Commented-Out Code

### No Large Blocks of Commented-Out Code Found

**Observation:** During file review, no large commented-out route handlers or significant logic blocks were found. Most commented code is limited to:
- Email notification logic (see TODO section)
- Clarity data integration (see Temporarily Disabled section)

**Recommendation:** Clean up remaining commented code after decisions are made on re-enabling

---

## Low/No Usage Indicators

### 1. **documentation.ts** - Static API Documentation
```typescript
export const API_DOCUMENTATION = {
  ga4: { ... },
  gbp: { ... },
  gsc: { ... }
} as const;
```

**Issue:** Static documentation export (not a route endpoint)
**Impact:** Low - May be unused or outdated
**Recommendation:** Check if any code imports this, otherwise convert to Swagger/OpenAPI

**Priority:** 🟡 Medium

---

### 2. **appLogs.ts** - File-Based Logging
```typescript
const LOG_FILES: Record<string, string> = {
  "agent-run": path.join(__dirname, "../logs/agent-run.log"),
  email: path.join(__dirname, "../logs/email.log"),
  "scraping-tool": path.join(__dirname, "../logs/scraping-tool.log"),
  "website-scrape": path.join(__dirname, "../logs/website-scrape.log")
};
```

**Issue:** File-based logging in production environment
**Impact:** Medium - Logs not rotated, could fill disk
**Recommendation:** Migrate to structured logging service (e.g., CloudWatch, Datadog)

**Priority:** 🟡 Medium

---

### 3. **websiteContact.ts** - Public Contact Form (No Auth)
```typescript
router.post("/contact", async (req: Request, res: Response) => {
  // reCAPTCHA verification only
});
```

**Issue:** Public endpoint with only reCAPTCHA protection
**Impact:** Medium - Potential spam target
**Recommendation:** Add rate limiting (e.g., 5 submissions per IP per hour)

**Priority:** 🟡 Medium

---

### 4. **support.ts** - Public Support Form (No Auth)
```typescript
router.post("/inquiry", async (req: Request, res: Response) => {
  // Email regex validation only
});
```

**Issue:** Public endpoint with minimal validation
**Impact:** Medium - Potential spam target
**Recommendation:** Add rate limiting + reCAPTCHA like websiteContact.ts

**Priority:** 🟡 Medium

---

## Broken Patterns

### 1. **agentsV2.ts** - Test Mode Without Guard Rails
```typescript
// Test mode - no database writes, no emails
if (req.query.test === "true") {
  console.log("[TEST-AGENTS] NOTE: This is a TEST run - NO data will be persisted");
  // ... runs full agent logic ...
}
```

**Issue:** Test mode controlled by query parameter (no authentication)
**Impact:** High - Anyone can trigger test mode, potentially skipping important side effects
**Recommendation:** Require admin authentication for test mode

**Priority:** 🔴 High

---

### 2. **practiceRanking.ts** - No Rollback on Partial Failure
```typescript
// Delete old rankings for this week
await db("practice_rankings").where({ week_start_date, domain }).delete();

// Insert new rankings (batch)
await db("practice_rankings").insert(rankingsToInsert);
```

**Issue:** If insert fails after delete, data is lost
**Impact:** High - Rankings could be permanently deleted without replacement
**Recommendation:** Use transaction to ensure atomic delete+insert

**Priority:** 🔴 High

---

### 3. **Multiple Routes** - No Input Length Limits
**Issue:** Most routes don't limit string input lengths
**Impact:** Medium - Potential memory exhaustion, database overflow
**Recommendation:** Add max length validation (e.g., 1000 chars for text, 10MB for JSON)

**Priority:** 🟡 Medium

---

### 4. **auth-otp.ts** - Test Account Bypass
```typescript
const TEST_EMAIL = "tester@google.com";

if (normalizedEmail === TEST_EMAIL) {
  console.log("[AUTH] Test account detected, skipping OTP email");
  return res.json({
    success: true,
    message: "Test account - no OTP required",
    isTestAccount: true
  });
}
```

**Issue:** Hardcoded test account with no OTP verification
**Impact:** Medium - Security bypass for testing
**Recommendation:** Remove in production or add environment check (only allow in dev/staging)

**Priority:** 🟡 Medium

---

## External Dependency Risks

### 1. **n8n Webhook Dependency** - Single Point of Failure
**Routes Affected:** websiteContact.ts, admin/websites.ts, mail service
**Issue:** All emails routed through single n8n webhook
**Impact:** High - If n8n is down, no emails are sent (OTP, invitations, contact forms)
**Recommendation:** Add fallback email provider (e.g., SendGrid, AWS SES)

**Priority:** 🔴 High

---

### 2. **Google API Rate Limits** - No Caching
**Routes Affected:** ga4.ts, gsc.ts, gbp.ts, clarity.ts, places.ts
**Issue:** Every request hits Google APIs directly (no cache layer)
**Impact:** High - Could hit rate limits during high traffic
**Recommendation:** Implement Redis cache with TTL (e.g., 5 minutes for analytics data)

**Priority:** 🔴 High

---

### 3. **Apify Service** - No Error Recovery
**Routes Affected:** scraper.ts, audit.ts
**Issue:** If Apify actor fails, no retry logic
**Impact:** Medium - Scraping/audit requests fail without recovery
**Recommendation:** Add retry logic with exponential backoff (3 attempts)

**Priority:** 🟡 Medium

---

### 4. **AWS S3** - No CDN Layer
**Routes Affected:** admin/media.ts, admin/websites.ts
**Issue:** Media files served directly from S3 (slow for global users)
**Impact:** Medium - High latency for international users
**Recommendation:** Add CloudFront CDN in front of S3 bucket

**Priority:** 🟡 Medium

---

### 5. **Claude API** - No Rate Limit Handling
**Routes Affected:** admin/websites.ts (pageEditorService)
**Issue:** No rate limit handling for Claude API calls
**Impact:** Medium - Could hit API limits during bulk editing
**Recommendation:** Add rate limiting + queue system for AI requests

**Priority:** 🟡 Medium

---

### 6. **reCAPTCHA** - Only on 1 Public Endpoint
**Routes Affected:** websiteContact.ts (has it), support.ts (missing it)
**Issue:** Inconsistent spam protection across public forms
**Impact:** Medium - support.ts is vulnerable to spam
**Recommendation:** Add reCAPTCHA to support.ts

**Priority:** 🟡 Medium

---

## Hardcoded Configuration Risks

### 1. **auth-otp.ts** - Hardcoded Test Email
```typescript
const TEST_EMAIL = "tester@google.com";
```

**Issue:** Test account email is hardcoded in source
**Impact:** Low - Security bypass in non-production
**Recommendation:** Move to environment variable

**Priority:** 🟢 Low

---

### 2. **admin/auth.ts** - Pilot Token Expiry Hardcoded
```typescript
const pilotToken = jwt.sign({ ... }, JWT_SECRET, { expiresIn: "1h" });
```

**Issue:** Pilot session timeout hardcoded to 1 hour
**Impact:** Low - Could be configurable
**Recommendation:** Move to environment variable for flexibility

**Priority:** 🟢 Low

---

## Summary and Recommendations

### Critical Issues (🔴 High Priority)

1. **User Email Notifications Disabled** (practiceRanking.ts lines 484, 507, 883, 906)
   - **Impact:** Users don't receive ranking completion notifications
   - **Action:** Re-enable or document permanent removal

2. **Clarity Data Integration Disabled** (agentsV2.ts lines 413, 466)
   - **Impact:** Agents missing Microsoft Clarity insights
   - **Action:** Re-enable after testing or remove if abandoned

3. **Test Mode Without Auth** (agentsV2.ts)
   - **Impact:** Anyone can trigger test mode via query parameter
   - **Action:** Require admin authentication

4. **No Transaction for Atomic Operations** (practiceRanking.ts)
   - **Impact:** Data loss if insert fails after delete
   - **Action:** Wrap delete+insert in transaction

5. **n8n Single Point of Failure**
   - **Impact:** All emails fail if n8n is down
   - **Action:** Add fallback email provider

6. **Google API Rate Limits** (no caching)
   - **Impact:** Could hit API limits during high traffic
   - **Action:** Implement Redis cache layer

---

### Medium Issues (🟡 Medium Priority)

7. **Deprecated Endpoint Still Active** (agentsV2.ts line 3803)
   - **Action:** Remove or redirect to new endpoint

8. **Missing Token Usage Tracking** (user/website.ts line 251)
   - **Action:** Extract token usage from Claude API response

9. **Public Endpoints Vulnerable to Spam** (websiteContact.ts, support.ts)
   - **Action:** Add rate limiting + reCAPTCHA

10. **No Input Length Limits** (multiple routes)
    - **Action:** Add max length validation

11. **Apify No Retry Logic** (scraper.ts, audit.ts)
    - **Action:** Add exponential backoff retry

12. **S3 No CDN** (admin/media.ts, admin/websites.ts)
    - **Action:** Add CloudFront CDN

13. **Claude API No Rate Limiting** (admin/websites.ts)
    - **Action:** Add queue system for AI requests

14. **Inconsistent reCAPTCHA Usage**
    - **Action:** Add reCAPTCHA to support.ts

15. **File-Based Logging** (appLogs.ts)
    - **Action:** Migrate to structured logging service

---

### Low Issues (🟢 Low Priority)

16. **Static Documentation Export** (documentation.ts)
    - **Action:** Check usage, convert to Swagger if needed

17. **Hardcoded Test Account** (auth-otp.ts)
    - **Action:** Move to environment variable

18. **Hardcoded Pilot Token Expiry** (admin/auth.ts)
    - **Action:** Move to environment variable

19. **Deprecated Import Versions** (imports.ts)
    - **Action:** Monitor usage, remove after grace period

---

## Obsolescence Score by Route File

| Route File | Critical Issues | Medium Issues | Low Issues | Total Score |
|------------|-----------------|---------------|------------|-------------|
| **practiceRanking.ts** | 2 | 1 | 0 | 🔴 High Risk |
| **agentsV2.ts** | 2 | 1 | 0 | 🔴 High Risk |
| **scraper.ts** | 0 | 2 | 0 | 🟡 Medium Risk |
| **admin/websites.ts** | 0 | 2 | 0 | 🟡 Medium Risk |
| **websiteContact.ts** | 0 | 1 | 0 | 🟡 Medium Risk |
| **support.ts** | 0 | 1 | 0 | 🟡 Medium Risk |
| **user/website.ts** | 0 | 1 | 0 | 🟡 Medium Risk |
| **auth-otp.ts** | 0 | 1 | 1 | 🟡 Medium Risk |
| **admin/auth.ts** | 0 | 0 | 1 | 🟢 Low Risk |
| **imports.ts** | 0 | 0 | 1 | 🟢 Low Risk |
| **documentation.ts** | 0 | 0 | 1 | 🟢 Low Risk |
| **appLogs.ts** | 0 | 1 | 0 | 🟡 Medium Risk |

---

## Next Steps

**Phase 6:** Large Files Deep Dive (agentsV2.ts, practiceRanking.ts, admin/websites.ts)
**Phase 7:** Final Consolidated Report (ROUTE_ANALYSIS.md)
