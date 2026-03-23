# User Test Plan — Auth Overhaul Verification

Post-migration manual test plan for the email/password auth + GBP-only architecture.
Three user personas. Every feature. Checkboxes for pass/fail.

---

## Prerequisites

- Backend running (`signalsai-backend`)
- Frontend running (`signalsai`)
- PostgreSQL database migrated (all 8 plans applied)
- A valid Google Business Profile account for GBP connection tests
- Access to a test email inbox (for verification codes)
- An existing admin-level user in the database (for admin tests)

---

## 1. NEW USER — Registration & Onboarding

### 1.1 Sign Up Page (`/signup`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 1.1.1 | Page loads | Navigate to `/signup` | See "Create your Alloro account" heading, logo, email/password/confirm fields, "Create Account" button | [ ] |
| 1.1.2 | Empty form submission | Click "Create Account" with all fields empty | Inline validation errors: "Email is required", "Password is required", "Please confirm your password" | [ ] |
| 1.1.3 | Invalid email format | Enter `notanemail`, leave password fields empty, click submit | Inline error: "Invalid email format" | [ ] |
| 1.1.4 | Weak password — too short | Enter valid email, enter `Ab1`, click submit | Inline error: "Password must be at least 8 characters" | [ ] |
| 1.1.5 | Weak password — no uppercase | Enter valid email, enter `abcdefg1`, click submit | Inline error: "Password must contain at least 1 uppercase letter" | [ ] |
| 1.1.6 | Weak password — no number | Enter valid email, enter `Abcdefgh`, click submit | Inline error: "Password must contain at least 1 number" | [ ] |
| 1.1.7 | Password mismatch | Enter valid email, enter `Abcdefg1` and `Abcdefg2`, click submit | Inline error: "Passwords do not match" | [ ] |
| 1.1.8 | Validation clears on edit | Trigger a validation error, then edit the field | Error for that field clears immediately | [ ] |
| 1.1.9 | Password visibility toggle | Click eye icon on password field | Toggles between `type="password"` and `type="text"` | [ ] |
| 1.1.10 | Confirm password visibility toggle | Click eye icon on confirm password field | Toggles independently from password field | [ ] |
| 1.1.11 | Successful registration | Enter valid email, `Abcdefg1`, confirm `Abcdefg1`, submit | Green banner "Account created! Redirecting...", then redirect to `/verify-email` with email passed in state | [ ] |
| 1.1.12 | Duplicate email | Register with an already-registered email | Red error banner with backend error message (e.g., "Email already registered") | [ ] |
| 1.1.13 | Loading state | Submit valid form | Button shows spinner + "Creating account...", all inputs disabled during request | [ ] |
| 1.1.14 | Enter key submission | Fill all fields correctly, press Enter in any field | Form submits (same as clicking button) | [ ] |
| 1.1.15 | Sign in link | Click "Sign in" link | Navigates to `/signin` | [ ] |
| 1.1.16 | Terms of Service link | Click "Terms of Service" | Opens `https://getalloro.com/terms` in new tab | [ ] |
| 1.1.17 | Authenticated redirect | Set `auth_token` in localStorage, navigate to `/signup` | Redirected to `/dashboard` (PublicRoute guard) | [ ] |

### 1.2 Email Verification (`/verify-email`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 1.2.1 | Page loads with email from state | Complete signup, auto-redirect to verify page | See "Verify your email" heading, email displayed in orange | [ ] |
| 1.2.2 | No email — redirects | Navigate to `/verify-email` directly (no state, no query param) | Redirected to `/signup` | [ ] |
| 1.2.3 | Email from query param | Navigate to `/verify-email?email=test@example.com` | Page loads showing `test@example.com` | [ ] |
| 1.2.4 | Code input — numbers only | Type `abc123def456` | Only `123456` accepted (non-numeric stripped) | [ ] |
| 1.2.5 | Code input — max 6 digits | Type `1234567890` | Only `123456` accepted (capped at 6) | [ ] |
| 1.2.6 | Auto-submit on 6 digits | Enter all 6 digits | Automatically submits after 300ms delay | [ ] |
| 1.2.7 | Manual submit button | Enter 6 digits, click "Verify" | Submits verification request | [ ] |
| 1.2.8 | Button disabled until 6 digits | Enter only 5 digits | "Verify" button disabled | [ ] |
| 1.2.9 | Successful verification | Enter correct 6-digit code | Green banner "Success! Redirecting...", `auth_token` saved to localStorage, redirect to `/dashboard` after 800ms | [ ] |
| 1.2.10 | User role stored | Verify with code (if backend returns user.role) | `user_role` saved to localStorage | [ ] |
| 1.2.11 | Invalid code | Enter wrong 6-digit code | Red error banner with message | [ ] |
| 1.2.12 | Resend code | Click "Resend code" | Green message "Verification code resent. Check your inbox.", 60-second cooldown starts | [ ] |
| 1.2.13 | Resend cooldown | Click "Resend code", observe button | Button shows "Resend code (59s)", counts down to 0, then re-enables | [ ] |
| 1.2.14 | Resend disabled during cooldown | Click "Resend code" during countdown | Button disabled, nothing happens | [ ] |
| 1.2.15 | Back to sign up link | Click "Back to sign up" | Navigates to `/signup` | [ ] |
| 1.2.16 | Enter key submission | Type 6 digits, press Enter | Submits (same as button click) | [ ] |
| 1.2.17 | Loading state | Submit code | Button shows spinner + "Verifying...", input disabled | [ ] |

### 1.3 Onboarding (`/new-account-onboarding`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 1.3.1 | Page loads (authenticated) | Sign in, navigate to `/new-account-onboarding` | See "Connect Your Practice" heading, Step 1 active (orange border), Step 2 locked (gray, dashed border) | [ ] |
| 1.3.2 | Unauthenticated redirect | Clear all tokens, navigate to `/new-account-onboarding` | Redirected to `/signin` (ProtectedRoute guard) | [ ] |
| 1.3.3 | Step 1 — open terms modal | Click Step 1 card | Google API Terms modal opens | [ ] |
| 1.3.4 | Step 1 — accept terms | Read and accept terms in modal | Step 1 turns green "Completed", Step 2 unlocks (orange border, Google connect button visible) | [ ] |
| 1.3.5 | Step 2 — locked state | Before completing Step 1, observe Step 2 | Step 2 grayed out, text says "Complete step 1 first to unlock this step." | [ ] |
| 1.3.6 | Step 2 — Google connect button | Complete Step 1, observe Step 2 | "Connect Google Business Profile" visible with GoogleConnectButton component | [ ] |
| 1.3.7 | Step 2 — account help modal | Click "Seeing multiple accounts?" link | Account Selection Helper modal opens | [ ] |
| 1.3.8 | Step 2 — successful GBP connection | Click Google connect, complete OAuth flow | OAuth popup opens, after success returns to app with GBP connected | [ ] |
| 1.3.9 | Skip for now | Click "Skip for now and go to dashboard" | Navigates to `/dashboard` | [ ] |
| 1.3.10 | Badge shows "New Account Setup" | Load page | Orange pill badge with pulsing dot says "New Account Setup" | [ ] |

### 1.4 Post-Onboarding Dashboard (First Load)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 1.4.1 | Dashboard loads | After signup + verify, arrive at `/dashboard` | Dashboard renders without errors | [ ] |
| 1.4.2 | Onboarding wizard triggers | First dashboard load after account creation | 22-step onboarding wizard should appear (if onboarding not yet completed) | [ ] |
| 1.4.3 | Empty state — no GBP data | New user with no GBP connected | Dashboard shows appropriate empty/placeholder states, not errors | [ ] |
| 1.4.4 | Empty state — no PMS data | New user with no PMS data | PMS section shows upload prompt or empty state | [ ] |
| 1.4.5 | Empty state — no rankings | New user with no ranking data | Rankings tab shows empty state | [ ] |
| 1.4.6 | Empty state — no tasks | New user with no tasks | Tasks tab shows empty state or "No tasks yet" | [ ] |

---

## 2. EXISTING USER — Login & Full Feature Access

### 2.1 Sign In Page (`/signin`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.1.1 | Page loads | Navigate to `/signin` | See "Welcome to Alloro" heading, logo, email/password fields, "Sign In" button | [ ] |
| 2.1.2 | Successful login | Enter valid email + password | Green "Success! Redirecting...", `auth_token` stored in localStorage, full page redirect to `/dashboard` after 800ms | [ ] |
| 2.1.3 | User role stored | Login with user that has a role | `user_role` stored in localStorage | [ ] |
| 2.1.4 | Invalid credentials | Enter wrong email or password | Red error "Invalid email or password" | [ ] |
| 2.1.5 | Unverified email | Login with unverified email | Redirect to `/verify-email` with email in state (`requiresVerification` response) | [ ] |
| 2.1.6 | Button disabled — no email | Leave email empty | "Sign In" button disabled | [ ] |
| 2.1.7 | Button disabled — invalid email | Enter `notanemail` | "Sign In" button disabled (regex fails) | [ ] |
| 2.1.8 | Button disabled — short password | Enter valid email, password < 8 chars | "Sign In" button disabled | [ ] |
| 2.1.9 | Button enabled — valid form | Enter valid email + 8+ char password | "Sign In" button enabled | [ ] |
| 2.1.10 | Password visibility toggle | Click eye icon | Toggles password visibility | [ ] |
| 2.1.11 | Enter key submission | Fill form, press Enter | Submits form | [ ] |
| 2.1.12 | Loading state | Submit form | Button shows spinner + "Signing in...", inputs disabled | [ ] |
| 2.1.13 | Sign up link | Click "Sign up" | Navigates to `/signup` | [ ] |
| 2.1.14 | Already authenticated redirect | Set `auth_token` in localStorage, navigate to `/signin` | Redirected to `/dashboard` (PublicRoute guard) | [ ] |
| 2.1.15 | Network error | Disable network, submit | Red error "An error occurred. Please try again." | [ ] |

### 2.2 Logout

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.2.1 | Logout action | Click logout (from Profile or sidebar) | `auth_token`, `user_role` cleared from localStorage, redirected to `/signin` | [ ] |
| 2.2.2 | Cross-tab logout | Open app in 2 tabs, logout in tab 1 | Tab 2 should also reflect logout via BroadcastChannel | [ ] |
| 2.2.3 | Cookie cleared | Logout | `auth_token` cookie cleared (check via dev tools) | [ ] |
| 2.2.4 | Protected route after logout | After logout, navigate to `/dashboard` | Redirected to `/signin` | [ ] |
| 2.2.5 | Login after logout | Logout, then login again | Full flow works, dashboard loads with data | [ ] |

### 2.3 Dashboard — Overview Tab

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.3.1 | Dashboard loads | Navigate to `/dashboard` | Overview tab renders with metrics | [ ] |
| 2.3.2 | Vital Signs Score | Observe dashboard | Vital Signs score displays (or appropriate empty state) | [ ] |
| 2.3.3 | Strategic Growth Opportunities | Observe dashboard | Growth opportunity cards render | [ ] |
| 2.3.4 | Proofline Trajectory | Observe dashboard | Performance timeline/chart renders | [ ] |
| 2.3.5 | Next Best Action | Observe dashboard | Recommendation cards display | [ ] |
| 2.3.6 | Refresh agent data | Click refresh button (if present) | Data reloads without page refresh, loading indicator visible | [ ] |
| 2.3.7 | Location selector | If multi-location, use location dropdown | Dashboard metrics update for selected location | [ ] |
| 2.3.8 | organizationId used (not google_account_id) | Open Network tab, trigger any API call | API calls use `organizationId` prop, no `x-google-account-id` header | [ ] |

### 2.4 Dashboard — Patient Journey Insights Tab

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.4.1 | Tab navigation | Click "Patient Journey Insights" tab or navigate to `/patientJourneyInsights` | Tab content loads | [ ] |
| 2.4.2 | Referral metrics display | Observe page | Referral metrics render (or empty state) | [ ] |
| 2.4.3 | Referral sources | Observe page | Top referral sources listed | [ ] |
| 2.4.4 | Referral matrix | Observe page | Source-to-outcome matrix renders | [ ] |
| 2.4.5 | Monthly trends chart | Observe page | Trend chart renders with data or empty state | [ ] |

### 2.5 Dashboard — PMS Statistics Tab

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.5.1 | Tab navigation | Navigate to `/pmsStatistics` | PMS Statistics page loads | [ ] |
| 2.5.2 | No PMS data state | User with no PMS data | Upload prompt or empty state shown | [ ] |
| 2.5.3 | PMS upload — wizard | Click upload, choose "Template Upload" | Wizard modal opens with step-by-step instructions | [ ] |
| 2.5.4 | PMS upload — direct file | Click upload, choose "Direct Upload" | File upload modal opens | [ ] |
| 2.5.5 | PMS upload — manual entry | Click upload, choose "Manual Entry" | Manual entry form modal opens | [ ] |
| 2.5.6 | Template download | Click download template | CSV template file downloads | [ ] |
| 2.5.7 | Successful CSV upload | Upload valid CSV file | Upload succeeds, job status tracking begins | [ ] |
| 2.5.8 | Job status polling | After upload, observe status | Live polling shows job progress (pending → processing → completed) | [ ] |
| 2.5.9 | Vital Signs cards | User with PMS data | Vital Signs metric cards render with data | [ ] |
| 2.5.10 | Monthly statistics | User with historical PMS data | Monthly breakdown visible | [ ] |

### 2.6 Dashboard — Tasks Tab

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.6.1 | Tab navigation | Navigate to `/tasks` | Tasks page loads | [ ] |
| 2.6.2 | Task list renders | User with tasks | Tasks listed, grouped by category (ALLORO vs USER) | [ ] |
| 2.6.3 | Task status display | Observe tasks | Status badges shown (pending, in_progress, complete) | [ ] |
| 2.6.4 | Mark task complete | Click complete/checkmark on a pending task | Task status changes to "complete", visual confirmation | [ ] |
| 2.6.5 | Task detail expand | Click a task to expand | Full description, metadata, due date visible | [ ] |
| 2.6.6 | Empty state | User with no tasks | "No tasks" or similar empty state | [ ] |
| 2.6.7 | Priority display | Task with priority metadata | Priority level indicator visible (Immediate/High/Normal) | [ ] |

### 2.7 Dashboard — Rankings Tab

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.7.1 | Tab navigation | Navigate to `/rankings` | Rankings dashboard loads | [ ] |
| 2.7.2 | Ranking results display | User with ranking data | Rank position, specialty, location, score visible | [ ] |
| 2.7.3 | Competitor count | Observe rankings | Total competitors number shown | [ ] |
| 2.7.4 | Historical data | Observe rankings | Previous ranking data accessible | [ ] |
| 2.7.5 | Empty state | User with no ranking data | Appropriate empty state shown | [ ] |
| 2.7.6 | Batch status polling | Active ranking job | Status updates via polling | [ ] |

### 2.8 Settings Page (`/settings`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.8.1 | Page loads | Navigate to `/settings` | Settings page renders with profile and integration sections | [ ] |
| 2.8.2 | Profile info displayed | Observe profile section | First Name, Last Name, Email (read-only), Practice Name visible | [ ] |
| 2.8.3 | Profile edit — save | Edit First Name, click Save | Changes persisted, success feedback | [ ] |
| 2.8.4 | GBP integration status | Observe integrations | "Business Profile Integration" header visible, GBP connection status card | [ ] |
| 2.8.5 | No Clarity card | Observe integrations | Microsoft Clarity card is NOT present (removed in Plan 07) | [ ] |
| 2.8.6 | GBP reconnect | If GBP disconnected, click reconnect | OAuth flow initiates | [ ] |
| 2.8.7 | Property management | Click manage properties | Property selection modal opens | [ ] |
| 2.8.8 | Users tab | Click Users tab (if visible) | User list for organization shown | [ ] |
| 2.8.9 | Organization details | Observe organization section | Domain, address, phone displayed (read-only) | [ ] |

### 2.9 Notifications (`/notifications`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.9.1 | Page loads | Navigate to `/notifications` | Notification list renders | [ ] |
| 2.9.2 | Auto-mark read | Navigate to notifications page | Unread notifications auto-marked as read | [ ] |
| 2.9.3 | Notification types | Have various notification types | Task, PMS, agent, system notifications display correctly | [ ] |
| 2.9.4 | Mark all read | Click "Mark all as read" | All notifications marked read | [ ] |
| 2.9.5 | Delete all | Click "Delete all" | All notifications removed (with confirmation) | [ ] |
| 2.9.6 | Notification badge | Have unread notifications | Badge with count visible in sidebar/header | [ ] |
| 2.9.7 | Notification polling | Leave page open | New notifications appear via polling (~10 sec interval) | [ ] |
| 2.9.8 | Click notification | Click a notification with a link | Navigates to related feature | [ ] |
| 2.9.9 | Empty state | No notifications | "No notifications" message | [ ] |

### 2.10 Help Page (`/help`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.10.1 | Page loads | Navigate to `/help` | Support form renders | [ ] |
| 2.10.2 | Pre-populated fields | Observe form | User name and email pre-filled | [ ] |
| 2.10.3 | Submit inquiry | Fill subject, urgency, message, click submit | Confirmation message shown | [ ] |
| 2.10.4 | Required field validation | Submit empty form | Validation errors for required fields | [ ] |

### 2.11 DFY Website (`/dfy/website`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.11.1 | Page loads | Navigate to `/dfy/website` | Website builder/preview loads (or "not available" state) | [ ] |
| 2.11.2 | Website preview | If website exists | HTML preview renders correctly | [ ] |
| 2.11.3 | Page navigation | Click different pages | Preview updates to selected page | [ ] |
| 2.11.4 | Usage limits | Observe quota display | Storage and daily edit limits shown | [ ] |

### 2.12 Sidebar Navigation

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.12.1 | All nav items visible | Observe sidebar | Dashboard, Insights, PMS, Tasks, Rankings, Settings, Notifications, Help links present | [ ] |
| 2.12.2 | Active state | Click each nav item | Active item highlighted, correct page loads | [ ] |
| 2.12.3 | Notification badge in sidebar | Have unread notifications | Badge count shown next to Notifications link | [ ] |
| 2.12.4 | organizationId prop | Inspect component | Sidebar receives `organizationId` (not `googleAccountId`) | [ ] |

### 2.13 Pilot Mode (if applicable)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 2.13.1 | Pilot token URL | Navigate to `/?pilot_token=X&user_role=admin` | Token stored in sessionStorage (not localStorage), redirect to `/dashboard` | [ ] |
| 2.13.2 | Pilot overrides normal auth | Have localStorage auth + sessionStorage pilot | `getPriorityItem()` returns sessionStorage values first | [ ] |
| 2.13.3 | Pilot session isolation | Open pilot in one tab, normal in another | Each tab uses its own storage correctly | [ ] |

---

## 3. ADMIN — System Management

### 3.1 Admin Authentication

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.1.1 | Admin login page | Navigate to `/admin` without admin auth | AdminLogin component renders (OTP-based) | [ ] |
| 3.1.2 | OTP request | Enter admin email, click send OTP | OTP code sent to email | [ ] |
| 3.1.3 | OTP verification | Enter 6-digit OTP code | Authentication succeeds, admin dashboard loads | [ ] |
| 3.1.4 | Non-admin denied | Login with non-admin user token | AdminGuard calls `/admin/validate`, returns false, shows login page | [ ] |
| 3.1.5 | Token validation | With admin `auth_token` in localStorage | AdminGuard calls `GET /admin/validate`, succeeds, renders admin content | [ ] |
| 3.1.6 | Admin logout | Click logout in admin top bar | `auth_token` cleared, cookie cleared, BroadcastChannel logout sent, redirect to `/admin` | [ ] |
| 3.1.7 | Cross-tab admin logout | Open admin in 2 tabs, logout in one | Other tab reflects logout | [ ] |

### 3.2 Organization Management (`/admin/organization-management`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.2.1 | Page loads | Navigate to org management | List of organizations renders | [ ] |
| 3.2.2 | Organization details | Click/expand an organization | Name, domain, created date, user count, user list, connected accounts visible | [ ] |
| 3.2.3 | Edit organization name | Edit org name, save | Name updated, success feedback | [ ] |
| 3.2.4 | User list per org | Expand org details | Users shown with roles and join dates | [ ] |
| 3.2.5 | Connected accounts | Expand org details | GBP properties/connections shown | [ ] |
| 3.2.6 | Website status | Expand org with DFY site | Website status indicator shown | [ ] |
| 3.2.7 | Tier management | Change tier (DWY/DFY) | Confirmation dialog, then tier updated | [ ] |
| 3.2.8 | Pilot URL uses organization_id | Click pilot button | URL contains `organization_id` parameter (not `google_account_id`) | [ ] |

### 3.3 Action Items Hub (`/admin/action-items`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.3.1 | Page loads | Navigate to action items | Task list renders with filters | [ ] |
| 3.3.2 | Create new task | Click create, fill modal, submit | Task created, appears in list | [ ] |
| 3.3.3 | Task categorization | Create ALLORO task and USER task | Both categories display correctly | [ ] |
| 3.3.4 | Bulk archive | Select multiple tasks, click archive | All selected tasks archived | [ ] |
| 3.3.5 | Bulk unarchive | Select archived tasks, click unarchive | Tasks restored | [ ] |
| 3.3.6 | Bulk approve | Select unapproved tasks, click approve | Tasks approved, visible to users | [ ] |
| 3.3.7 | Bulk status update | Select tasks, change status | Status updated for all selected | [ ] |
| 3.3.8 | Filtering — by domain | Filter by specific domain | Only matching tasks shown | [ ] |
| 3.3.9 | Filtering — by status | Filter by "pending" | Only pending tasks shown | [ ] |
| 3.3.10 | Filtering — by category | Filter by "ALLORO" | Only ALLORO-generated tasks shown | [ ] |
| 3.3.11 | Pagination | Have 20+ tasks, navigate pages | Pagination works, correct page counts | [ ] |

### 3.4 Agent Outputs Management (`/admin/agent-outputs`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.4.1 | Page loads | Navigate to agent outputs | Agent output list renders | [ ] |
| 3.4.2 | Filter by agent type | Select "proofline" filter | Only proofline outputs shown | [ ] |
| 3.4.3 | Filter by status | Select "success" filter | Only successful outputs shown | [ ] |
| 3.4.4 | Filter by date range | Set date from/to | Only outputs in range shown | [ ] |
| 3.4.5 | Filter by domain | Select domain | Only domain-specific outputs shown | [ ] |
| 3.4.6 | View output detail | Click an output | Modal shows input + output data (JSON) | [ ] |
| 3.4.7 | Archive output | Click archive on an output | Status changes to "archived" | [ ] |
| 3.4.8 | Bulk archive | Select multiple, click bulk archive | All selected archived | [ ] |
| 3.4.9 | Bulk unarchive | Select archived outputs, unarchive | All restored to "success" | [ ] |
| 3.4.10 | Delete output | Click delete on an output | Output permanently removed (with confirmation) | [ ] |
| 3.4.11 | Bulk delete | Select multiple, bulk delete | All selected permanently removed | [ ] |
| 3.4.12 | organization_id in data | View output detail | `organization_id` field present (not `google_account_id`) | [ ] |
| 3.4.13 | Pagination | 20+ outputs, navigate | Correct pagination behavior | [ ] |

### 3.5 PMS Automation (`/admin/ai-pms-automation`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.5.1 | Page loads | Navigate to PMS automation | Job cards render | [ ] |
| 3.5.2 | Job status display | Observe cards | Status badge (pending/processing/completed/failed/awaiting approval) | [ ] |
| 3.5.3 | Status filtering | Filter by "completed" | Only completed jobs shown | [ ] |
| 3.5.4 | Domain filtering | Filter by domain | Only matching domain jobs shown | [ ] |
| 3.5.5 | Approval filtering | Filter by "pending" approval | Only jobs awaiting approval shown | [ ] |
| 3.5.6 | Admin approval | Click approve on a job awaiting admin approval | Job advances to next step | [ ] |
| 3.5.7 | Admin rejection | Click reject with comment | Job marked as rejected with comment visible | [ ] |
| 3.5.8 | Step progress tracker | Observe a processing job | Step-by-step progress visible (file_upload → parsing → approval → agents → tasks) | [ ] |
| 3.5.9 | Agent output preview | Click view on a completed agent step | Agent output data shown | [ ] |
| 3.5.10 | Response editing | Click edit on agent response | JSON editor opens, validation on save | [ ] |
| 3.5.11 | Manual step retry | Click retry on a failed step | Step re-executes | [ ] |
| 3.5.12 | Elapsed time display | Observe running job | Elapsed time and time remaining estimates shown | [ ] |
| 3.5.13 | Pagination | 20+ jobs, navigate | Pagination works | [ ] |

### 3.6 AI Data Insights (`/admin/ai-data-insights`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.6.1 | Page loads | Navigate to AI data insights | Insight list renders | [ ] |
| 3.6.2 | View insight detail | Click an insight | Full detail view opens | [ ] |
| 3.6.3 | Approval workflow | Approve/reject an insight | Status updates accordingly | [ ] |

### 3.7 Practice Rankings Management (`/admin/practice-ranking`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.7.1 | Page loads | Navigate to practice ranking | Ranking management page renders | [ ] |
| 3.7.2 | Trigger ranking job | Select location, click trigger | New ranking job created, status polling begins | [ ] |
| 3.7.3 | Job detail view | Click a ranking job | Specialty, location, rank position, competitors, status detail visible | [ ] |
| 3.7.4 | Batch status polling | Active ranking batch | Status updates via polling | [ ] |
| 3.7.5 | Error handling | Job with error | Error message displayed, retry option available | [ ] |
| 3.7.6 | Bulk delete completed | Select completed jobs, delete | Jobs removed | [ ] |
| 3.7.7 | Filter by domain | Select domain filter | Only matching domain rankings | [ ] |
| 3.7.8 | Filter by status | Select status filter | Only matching status rankings | [ ] |
| 3.7.9 | organization_id in ranking data | View ranking detail | Uses `organization_id` (not `google_account_id`) | [ ] |

### 3.8 Website Management (`/admin/websites`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.8.1 | Website list | Navigate to websites | List of websites with status, domain, timestamps | [ ] |
| 3.8.2 | Website detail | Click a website | Metadata, pages, settings visible | [ ] |
| 3.8.3 | Page management | View pages for a website | Page list with create/edit/delete options | [ ] |
| 3.8.4 | Page editor | Click edit on a page | Full-screen visual editor loads with preview | [ ] |
| 3.8.5 | AI chat editing | Use chat panel to request edit | AI processes request, preview updates | [ ] |
| 3.8.6 | Component selection | Click a section in preview | Component highlighted, editable | [ ] |
| 3.8.7 | Code snippet injection | Add a code snippet | Snippet saved and applied | [ ] |
| 3.8.8 | Layout editor | Click edit header/footer | Layout editor opens | [ ] |
| 3.8.9 | Create new page | Click create page | Modal opens, page created successfully | [ ] |
| 3.8.10 | Delete page | Click delete on a page | Confirmation, then page removed | [ ] |

### 3.9 Template Management (`/admin/templates`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.9.1 | Template list | Navigate to templates | Template list renders | [ ] |
| 3.9.2 | Template detail | Click a template | Template editor/detail view opens | [ ] |
| 3.9.3 | Template imports | Navigate to imports for a template | Import history shown | [ ] |

### 3.10 Admin Settings (`/admin/settings`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.10.1 | Page loads | Navigate to admin settings | Configuration page renders | [ ] |
| 3.10.2 | Edit system prompt | Modify website editing LLM prompt | Changes saved successfully | [ ] |
| 3.10.3 | Reset to default | Click reset | Prompt reverts to default value | [ ] |

### 3.11 App Logs (`/admin/app-logs`)

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 3.11.1 | Page loads | Navigate to app logs | Log entries render | [ ] |
| 3.11.2 | Log search | Search for specific term | Matching log entries filtered | [ ] |

---

## 4. CROSS-CUTTING CONCERNS

### 4.1 Auth Token Lifecycle

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 4.1.1 | Token expiry | Wait for token to expire (or manually expire) | Next API call fails, user redirected to signin | [ ] |
| 4.1.2 | No google_account_id dependency | Grep localStorage after login | `google_account_id` key NOT present (auth works without it) | [ ] |
| 4.1.3 | No x-google-account-id header | Monitor Network tab on any page | No `x-google-account-id` header sent on API requests | [ ] |
| 4.1.4 | JWT in Authorization header | Monitor Network tab | `Authorization: Bearer <token>` header sent on API requests | [ ] |

### 4.2 Data Scoping — organization_id

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 4.2.1 | Agent results scoped to org | Run an agent, check DB | `agent_results.organization_id` = correct org ID (not connection row ID) | [ ] |
| 4.2.2 | Tasks scoped to org | Create a task, check DB | `tasks.organization_id` = correct org ID | [ ] |
| 4.2.3 | Rankings scoped to org | Run ranking, check DB | `practice_rankings.organization_id` = correct org ID | [ ] |
| 4.2.4 | Notifications scoped to org | Trigger notification, check DB | `notifications.organization_id` = correct org ID | [ ] |
| 4.2.5 | Cross-org isolation | Login as User A, check data | Cannot see User B's org data | [ ] |

### 4.3 API Backward Compatibility

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 4.3.1 | Rankings API query param | Trigger rankings fetch, check Network | URL contains `?googleAccountId=` (backend still expects old param name) | [ ] |
| 4.3.2 | Backend parses old param names | API calls with old query param names | Backend processes correctly, no 400 errors | [ ] |

### 4.4 Error Handling

| # | Test Case | Steps | Expected Result | Pass |
|---|-----------|-------|-----------------|------|
| 4.4.1 | Backend down | Stop backend, use frontend | Appropriate error messages, no white screens | [ ] |
| 4.4.2 | Network timeout | Throttle network to extreme slowness | Loading states show, eventual timeout message | [ ] |
| 4.4.3 | 401 response | Send request with expired/invalid token | Redirect to signin (not infinite loop) | [ ] |
| 4.4.4 | 403 response | Non-admin hits admin endpoint | Access denied, not crash | [ ] |

---

## Test Execution Log

| Date | Tester | Section | Pass/Fail Count | Notes |
|------|--------|---------|-----------------|-------|
|      |        |         |                 |       |

---

## Summary Counts

| Section | Test Cases |
|---------|-----------|
| 1. New User (Signup + Verify + Onboarding + First Load) | 50 |
| 2. Existing User (Login + All Features) | 75 |
| 3. Admin (Auth + All Admin Pages) | 63 |
| 4. Cross-Cutting (Auth, Scoping, Compat, Errors) | 14 |
| **Total** | **202** |
