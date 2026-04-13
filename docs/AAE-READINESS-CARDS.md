# AAE Readiness Cards

> Written by Cowork (April 12, 2026 evening). For CC to execute.
> Context: AAE conference April 15-18, Salt Lake City.
> Goal: QR scan to 7-day trial. Experience so good they bring a friend.
> Priority: Fix trust-killing issues in the self-serve checkup flow.
> Constitution check script: scripts/constitution-check.sh (run with --critical-path)

---

## Card 1: Conference Fallback -- Remove Fake Competitor Names

Blast Radius: Green
Complexity: Medium
Dependencies: none

### Problem

When Google Places API times out at the convention center (bad wifi), `personalizeConferenceFallback()` fires. It personalizes scores and review gaps from the prospect's actual place data, but competitor names stay hardcoded as "Wasatch Endodontics", "Pioneer Endodontics", "Summit Endodontics", "Desert Endodontics."

A plumber from Ohio sees "Wasatch Endodontics has 223 more reviews than you." Trust dies instantly.

### What Changes

- `frontend/src/pages/checkup/conferenceFallback.ts`:
  - `personalizeConferenceFallback()` (lines 301-385): Replace hardcoded competitor names with generic category-aware names.
  - Use `place.category` to generate plausible competitor labels. Example: if category is "Plumber", competitors become "Top-rated plumber nearby", "Nearby plumber", etc. If category is "Endodontist", "Top-rated endodontist nearby."
  - The `topCompetitor.name` on line 321 currently reads from `CONFERENCE_ANALYSIS.topCompetitor.name` ("Wasatch Endodontics"). Replace with: `"Your top competitor"` or `"Top-rated ${place.category || 'business'} in ${place.city || 'your area'}"`.
  - The `competitors` array (lines 54-59) is spread into the return value unchanged. Override it with generic entries using `place.category` and `place.city`.
  - Update `CONFERENCE_ANALYSIS.findings` detail strings that reference "Wasatch Endodontics" (lines 64, 72, 78, 86). These get overridden by `personalizeConferenceFallback` for the first two findings, but the base object should also be clean.
  - The `CONFERENCE_PLACE` constant (line 14) can stay as-is -- it's only used when no real place data exists at all.

### Touches

- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

### Verification Tests

1. Read `personalizeConferenceFallback()` output: no string "Wasatch", "Pioneer", "Summit", or "Desert" should appear anywhere in the returned object when called with a non-dental place.
2. Call `personalizeConferenceFallback({ ...CONFERENCE_PLACE, name: "Joe's Barbershop", category: "Barber", city: "Columbus" })` -- confirm competitor names reference barbering/Columbus, not endodontics/SLC.
3. Run `bash scripts/constitution-check.sh --critical-path` -- all checks pass.
4. Run `cd frontend && npx tsc --noEmit` -- zero errors.
5. Grep: `grep -n "Wasatch\|Pioneer\|Summit Endo\|Desert Endo" frontend/src/pages/checkup/conferenceFallback.ts` -- only in `CONFERENCE_PLACE` and `CONFERENCE_ANALYSIS` base constants (not in `personalizeConferenceFallback` return path).

### Done Gate

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Card 2: "Split the Check" Copy -- Keep the Tribe, Lose the False Promise

Blast Radius: Yellow (client-facing copy, no billing change)
Complexity: Low
Dependencies: none (Corey approved direction)

### Problem

The "Split the Check" concept is right -- tribal, communal, "we walked in together." But two lines make specific pricing promises the backend can't deliver yet:

- `ColleagueShare.tsx` line 177: "you each pay half for the first 3 months"
- `src/jobs/mondayEmail.ts` line 654: "you both split the first month"

No Stripe coupon implements either. Two different undeliverable claims in two places. The tribal energy is the brand. The false pricing claim is not.

### What Changes

- `frontend/src/pages/checkup/ColleagueShare.tsx` line 177:
  - OLD: "You're both building something. When they join, you each pay half for the first 3 months."
  - NEW: "You're both building something. When they join, you go in together."
- `src/jobs/mondayEmail.ts` line 654:
  - OLD: "you both split the first month. Rise together."
  - NEW: "you go in together. Rise together."

### Why this language

"Go in together" keeps the Split the Check metaphor without making a pricing claim. It's two people walking into the same restaurant, not a coupon code. When the Stripe coupon exists later, the copy upgrades to specifics. Until then, the tribe is the value, not the discount.

### Touches

- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

### Verification Tests

1. Grep: `grep -rn "pay half\|split the first\|half for the first" frontend/src/ src/` -- zero hits.
2. The phrase "Split the Check" and "go in together" should remain.
3. Run `cd frontend && npx tsc --noEmit` -- zero errors.

### Done Gate

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Card 3: Commit Pending Work

Blast Radius: Green
Complexity: Low
Dependencies: Cards 1-2 complete

### What Changes

Commit and push to sandbox:
- `scripts/constitution-check.sh` (new file -- constitution compliance Layer 1)
- `docs/AAE-READINESS-CARDS.md` (this file)
- Any changes from Cards 1-2
- Updated `CURRENT-SPRINT.md`

### Verification Tests

1. `bash scripts/constitution-check.sh --critical-path` -- 7/7 pass, 0 fail.
2. `cd frontend && npx tsc --noEmit` -- zero errors.
3. `git status` -- clean working tree after push.

### Done Gate

Sandbox auto-deploys on push. Changes are live. Constitution check passes.


---

## Card 4: APP_URL Environment Variable (Dave Task)

Blast Radius: Green (env var only)
Complexity: Low
Dependencies: Dave access to EC2

### Problem

`APP_URL` is not set in the sandbox `.env`. Every backend reference falls back to `https://app.getalloro.com` (production). This means:

- Share links from `/api/checkup/share` point to production
- Viral share URLs generated at AAE go to production
- If production isn't deployed, shared links 404

### What Changes

Dave sets on sandbox EC2:
```
APP_URL=https://sandbox.getalloro.com
```

OR: production is deployed before AAE and `app.getalloro.com` resolves correctly.

### Touches

- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

### Verification Tests

1. After setting: `curl -s https://sandbox.getalloro.com/api/checkup/geo` returns JSON with lat/lng.
2. Share a checkup result -- the URL in the response should match the sandbox domain.

### Done Gate

Share URLs point to a working domain. Test by creating a share and clicking the link.

---

## Card 5: QR Code Asset for AAE Booth

Blast Radius: Green
Complexity: Low  
Dependencies: Card 4 (need to know which domain to encode)

### Problem

No QR code has been created for the booth. The QR code is the entry point for every prospect at AAE.

### What Changes

Generate a QR code pointing to:
```
https://sandbox.getalloro.com/checkup?mode=conference&ref=aae2026
```

The `mode=conference` activates fallback protection. The `ref=aae2026` tags every signup for attribution.

### Verification Tests

1. Scan QR code on phone. Lands on checkup page with search input visible.
2. URL params `mode=conference` and `ref=aae2026` present in address bar.

### Done Gate

QR code printed/saved and ready for the booth.

---

## Card 6: Pull PMS Upload Into Post-Signup Flow (The Banner Promise)

Blast Radius: Yellow (changes post-signup navigation sequence, no auth/billing)
Complexity: Medium
Dependencies: Card 1 (conference fallback) should land first, but not blocking

### The Story Gap

The booth banner says: "Every Endodontist Has A Referring GP They're About To Lose. We Know Which One."

The prospect scans the QR code expecting to learn WHICH GP. The checkup gives them Google competitive intelligence (reviews, ratings, head-to-head). That's valuable but it doesn't close the loop the banner opened.

The answer lives in `/dashboard/referrals` -- Top Referrers, Drift Alerts, value at risk. But to see it, the prospect needs to upload PMS data. Right now that upload prompt is buried at the bottom of the Home page, after ColleagueShare and OwnerProfile. The endodontist may never find it in the first 5 minutes.

### What Changes

Resequence the post-signup flow. Current order:

```
ResultsScreen -> BuildingScreen -> ColleagueShare -> OwnerProfile -> Dashboard (upload buried)
```

New order:

```
ResultsScreen -> BuildingScreen -> PMS Upload Prompt -> ColleagueShare -> Dashboard
```

Specific changes:

1. **`frontend/src/pages/checkup/BuildingScreen.tsx`** (lines 58-73):
   - Change navigation destination from `/checkup/share` to a new route `/checkup/upload-prompt`
   - Pass existing state (businessName, referralCode, etc.) through

2. **New file: `frontend/src/pages/checkup/UploadPrompt.tsx`**:
   - Simple page, same styling as BuildingScreen/ColleagueShare
   - Headline: "Now show us your referral report."
   - Subtext: "Upload your January production report. 60 seconds, and we'll tell you which referring doctor needs attention."
   - Two paths:
     - Primary CTA: Opens PMSUploadWizardModal (already built, import it)
     - Skip link: "I'll do this later" -> navigates to `/checkup/share`
   - On successful upload: navigate to `/checkup/share` (colleague share is the next natural moment -- they just saw something amazing, now share it)
   - Must pass `clientId` = org ID from the JWT token stored in localStorage during account creation. Use the same pattern as HomePage (decode token or fetch from dashboardContext).

3. **`frontend/src/App.tsx`**: Add route for `/checkup/upload-prompt` with the new component

4. **OwnerProfile deferral**: Move OwnerProfile questions to the dashboard (show as a card on first login, not a blocking gate). The 5 Lemonis questions are important but they don't close the banner's loop. They can wait.

### Why This Sequence

- BuildingScreen confirms "your readings are live" (2 seconds of brand moment)
- Upload Prompt closes the banner loop ("We Know Which One" -- upload and we'll show you)
- ColleagueShare capitalizes on the excitement AFTER they've seen their referral data (now they have a real reason to share -- "I just found out my top referral source dropped 30% last quarter")
- Dashboard has data from checkup AND PMS when they arrive

### Touches

- Database: no
- Auth: no (uses existing JWT from account creation)
- Billing: no
- New API endpoint: no (uses existing /pms/upload)

### Verification Tests

1. Complete the checkup flow end-to-end. After BuildingScreen, the next screen should be the upload prompt, not ColleagueShare.
2. Upload a CSV on the upload prompt screen. On success, navigate to ColleagueShare.
3. Click "I'll do this later" on the upload prompt. Navigate to ColleagueShare.
4. `cd frontend && npx tsc --noEmit` -- zero errors.
5. OwnerProfile questions still accessible from dashboard (not lost, just deferred).

### Done Gate

All verification tests pass? Yes = next card. No = fix before proceeding.

---

## Card 7: UploadPrompt + PMSUploadWizardModal Polish (Pre-AAE)

Blast Radius: Green (copy change + Known 14 fix, no logic changes)
Complexity: Low
Dependencies: Card 6 (UploadPrompt must exist)

### Problems

1. **UploadPrompt.tsx line 75**: "Upload your January production report" -- hardcoded month. It's April. Endodontist at AAE reads this and wonders if the product is stale.

2. **PMSUploadWizardModal.tsx lines 343, 354, 372, 390**: Uses `font-bold` (Known 14 violation). Max weight is `font-semibold`.

3. **PMSUploadWizardModal.tsx line 138**: Success message says "We'll notify you once it's ready" but there is no notification mechanism. The referral sync actually completes near-instantly via `syncReferralSourcesFromPmsJob()`. The promise misleads.

### What Changes

1. `frontend/src/pages/checkup/UploadPrompt.tsx` line 75:
   - OLD: "Upload your January production report. 60 seconds, and we'll tell you which referring doctor needs attention."
   - NEW: "Upload a recent production report. 60 seconds, and we'll tell you which referring source needs attention."
   - Also changes "referring doctor" to "referring source" (vertical-agnostic for non-dental).

2. `frontend/src/components/PMS/PMSUploadWizardModal.tsx`:
   - Line 343: `font-bold` -> `font-semibold`
   - Line 354: `font-bold` -> `font-semibold`
   - Line 372: `font-bold` -> `font-semibold`
   - Line 390: `font-bold` -> `font-semibold`

3. `frontend/src/components/PMS/PMSUploadWizardModal.tsx`:
   - Line 138: OLD: "We're processing your PMS data now. We'll notify you once it's ready."
     NEW: "Your referral data is being analyzed. You'll see it on your dashboard shortly."
   - Line 143: OLD: "We'll notify when ready for checking"
     NEW: "Referral insights loading on dashboard"
   - Line 367: OLD: "Full analysis is running now. We'll notify you when it's ready."
     NEW: "Full analysis is running now. Check your dashboard in a moment."

### Touches

- Database: no
- Auth: no
- Billing: no
- New API endpoint: no

### Verification Tests

1. `grep -n "font-bold" frontend/src/components/PMS/PMSUploadWizardModal.tsx` -- zero hits.
2. `grep -n "January" frontend/src/pages/checkup/UploadPrompt.tsx` -- zero hits.
3. `grep -n "notify" frontend/src/components/PMS/PMSUploadWizardModal.tsx` -- zero hits.
4. `bash scripts/constitution-check.sh --critical-path` -- all pass.
5. `cd frontend && npx tsc --noEmit` -- zero errors.

### Done Gate

All verification tests pass? Yes = done. No = fix before proceeding.

---

## Card 8: GBP OAuth Callback Must Read From Environment (Dave Task)

Blast Radius: Red (auth)
Complexity: Low
Dependencies: Card 4 (APP_URL must be set first)

### Problem

`src/routes/auth/gbp.ts` line 22 hardcodes the OAuth2 redirect URI:

```typescript
"https://app.getalloro.com/api/auth/google/callback"
```

This means Google Business Profile connection only works on `app.getalloro.com`. On sandbox (or any other domain), the OAuth flow silently fails because Google rejects the redirect URI mismatch.

GBP connection is a core feature. Without it, the customer cannot connect their Google Business Profile and the dashboard shows empty readings for review velocity, GBP completeness, and presence data.

### What Changes

`src/routes/auth/gbp.ts` line 22:
- OLD: `"https://app.getalloro.com/api/auth/google/callback"`
- NEW: `\`${process.env.APP_URL || "https://app.getalloro.com"}/api/auth/google/callback\``

Then in Google Cloud Console, add the sandbox callback URL to the authorized redirect URIs:
```
https://sandbox.getalloro.com/api/auth/google/callback
```

### Touches

- Database: no
- Auth: yes (OAuth redirect URI)
- Billing: no
- New API endpoint: no

### Verification Tests

1. On sandbox: click "Connect Google Business Profile" in dashboard settings. Google consent screen appears (does not error with "redirect_uri_mismatch").
2. Complete the OAuth flow. GBP data populates in the dashboard within 60 seconds.
3. `grep -n "getalloro.com/api/auth/google/callback" src/routes/auth/gbp.ts` -- zero hardcoded hits.

### Done Gate

GBP connection works on sandbox. OAuth flow completes without redirect URI mismatch.
