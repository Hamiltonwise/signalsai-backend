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

