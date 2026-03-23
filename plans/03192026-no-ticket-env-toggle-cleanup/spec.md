# Env Toggle Cleanup

## Why
The `.env` and `.env.sandbox` files both use comment-toggling to switch between local and live values. This is error-prone and messy. Clean separation eliminates accidental misconfiguration.

## What
- `.env` contains only live/production values (no commented-out local alternatives)
- `.env.sandbox` contains only local/sandbox values (no commented-out live alternatives)
- `envtoggle.js` script swaps the active env by renaming files, with a `.env.active` marker

## Constraints

**Must:**
- Preserve all existing values — just remove the comment-toggle pattern
- Script must work with plain `node envtoggle.js` (no build step)

**Must not:**
- Change any actual env values
- Add new dependencies

**Out of scope:**
- Frontend env files
- CI/CD env management

## Risk

**Level:** 2

**Risks identified:**
- Wrong toggle could point local dev at production DB + live Stripe → **Mitigation:** Script logs clearly which env is now active, including DB host

## Tasks

### T1: Clean .env (live) and .env.sandbox (local)
**Do:** Remove all comment-toggle blocks. Each file gets only its environment's values.
**Files:** `signalsai-backend/.env`, `signalsai-backend/.env.sandbox`
**Verify:** Manual: no commented-out toggle blocks remain

### T2: Create envtoggle.js and .env.active marker
**Do:** Create toggle script and initial marker file
**Files:** `signalsai-backend/envtoggle.js`, `signalsai-backend/.env.active`
**Verify:** `node signalsai-backend/envtoggle.js` switches and logs correctly

## Done
- [ ] `.env` has only live values, no toggle comments
- [ ] `.env.sandbox` has only local/sandbox values, no toggle comments
- [ ] `node envtoggle.js` swaps between them and logs which env is active
- [ ] Both files load correctly after toggle
