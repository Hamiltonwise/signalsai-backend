# Identity UX + Scrape Resilience

> **Depends on:** `plans/04172026-no-ticket-project-identity-architecture` (already executed) — this builds on the Identity modal and warmup pipeline.

## Why
Three pain points in the identity flow:

1. **Brand isn't editable from the summary view.** After warmup, admins see their primary/accent/gradient in the Summary tab but can't tweak them without switching to the JSON editor or running a chat update. This is the single highest-frequency tweak clients make, and it deserves an inline edit affordance.
2. **Chat update is fire-and-forget.** The current implementation applies LLM-picked tools immediately — no review step. Clients want to see what the LLM proposed before it mutates their identity (especially for text content like UVP, founding story, archetype). The Minds learning module already has the exact pattern we want: extract → compare → propose → approve → apply.
3. **Scraping fails silently on protected sites.** Any site behind Cloudflare, Akamai, or basic anti-bot returns a challenge page or 403 — and the current scraper treats that as a successful fetch with gibberish content. Admins don't know their URL didn't work until the generated page is useless. We need (a) a "Test URL" step that detects blocks before warmup runs, and (b) a Playwright fallback + screenshot-based extraction for blocked pages.

## What
Three enhancements to the Identity flow:

**Part 1 — Editable Brand in Summary tab:**
- Add Edit/Save toggle on the Brand card
- Inline `ColorPicker` + `GradientPicker` (reusing existing components)
- Live preview of the gradient as colors change
- Save PUT `/:id/identity` with updated `brand.*` (mirrors legacy columns automatically)

**Part 2 — Chat Update replaced by Proposal Review (mirrors Minds pattern):**
- **Replaces** the existing `POST /:id/identity/chat` tool-call flow. The 14-tool direct-apply path is deleted. Only proposal-then-approve remains.
- User types instruction (e.g., "change accent to navy, we're now ADA certified, update UVP to emphasize same-day crowns")
- Backend: one Claude call does extract + compare in one shot, returns a **proposals array** (NEW/UPDATE/DELETE against any identity path)
- Each proposal is marked `critical: true|false` — critical paths require explicit admin acknowledgment before they can be approved. The Claude prompt lists which paths are considered critical (business identifiers, place_id, warmup metadata, raw inputs) so it can either flag or avoid them.
- Frontend: renders proposals as a checklist with approve/reject per row + diff view. Critical proposals show a red warning badge + a "I understand this is critical" confirm before they can be approved.
- Admin clicks "Apply Approved" — backend walks approved proposals, applies each, returns updated identity
- Proposals are **in-memory** (round-trip client, no DB table) — no BullMQ job, synchronous flow
- Unlike Minds (which uses markdown + DB proposals + compile job), identity proposals are lightweight JSON ops and apply in <1 second

**Part 3 — URL Test + Scrape Resilience:**
- Add "Test" button next to each URL input in the Identity modal
- Backend endpoint: `POST /admin/websites/:id/test-url` returns `{ ok, block_type, fallback_available, preview_chars }`
- Block detection heuristics: 403/429/503 status, Cloudflare challenge HTML patterns ("challenge-platform", "Just a moment", "Attention Required", `cf-ray` header with suspicious body)
- When blocked, the UI surfaces two fallback options per URL:
  - **"Browser scrape"** — reuses existing Puppeteer manager to render JS, extracts post-render HTML (bypasses most challenges)
  - **"Screenshot + vision"** — takes full-page screenshot via Puppeteer, runs Claude vision to extract text content (last resort; slowest)
- Warmup pipeline honors per-URL fallback strategy set by the admin: `{ url, strategy: "fetch" | "browser" | "screenshot" }`

Done when: admin can click a color in the Brand summary → change it → save. Chat Update shows a checklist of proposed changes with approve/reject before applying. Adding a URL in the Identity modal lets the admin test it first, and blocked URLs can still be scraped via Playwright or screenshot+vision.

## Context

**Relevant files (backend):**
- `src/controllers/admin-websites/feature-services/service.identity-update.ts` — current chat update via tool calling (will be extended with proposal flow, NOT replaced — existing path stays for backward compat)
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` — multi-URL scraping loop (will honor per-URL strategy)
- `src/controllers/admin-websites/feature-services/service.website-scraper.ts` — current single-URL fetch; add Cloudflare block detection here
- `src/controllers/scraper/feature-services/service.puppeteer-manager.ts` — shared Puppeteer launcher (`launchBrowser`, `createPage`, `navigateWithRetry`)
- `src/controllers/scraper/feature-services/service.screenshot-capture.ts` — `captureDesktop()` returns `{ base64, sizeKB }`
- `src/controllers/minds/feature-services/service.minds-extraction.ts` — reference for extraction prompt structure
- `src/controllers/minds/feature-services/service.minds-comparison.ts` — reference for NEW/UPDATE/CONFLICT proposal shape
- `src/agents/service.llm-runner.ts` — already has `runWithTools()` for structured outputs
- `src/agents/websiteAgents/builder/` — new prompt files go here

**Relevant files (frontend):**
- `frontend/src/components/Admin/IdentityModal.tsx` — main target (all three parts touch this)
- `frontend/src/components/Admin/ColorPicker.tsx` — reused
- `frontend/src/components/Admin/GradientPicker.tsx` — reused
- `frontend/src/components/Admin/minds/wizard/SlideProposalsReview.tsx` — reference for proposal UI pattern (diff view, approve/reject toggles)
- `frontend/src/components/Admin/minds/parenting/ParentingProposals.tsx` — alternative reference (dark theme version)
- `frontend/src/api/websites.ts` — add new endpoints

**Patterns to follow:**
- Proposal shape — mirror `ProposalInput` from `src/validation/minds.schemas.ts` (type NEW|UPDATE|DELETE — we use DELETE where Minds uses CONFLICT)
- Proposal review UI — take visual cues from `SlideProposalsReview.tsx` (two-column red/green diff for UPDATE, green highlight for NEW, red strikethrough for DELETE)
- Puppeteer usage — reuse `launchBrowser`, `createPage`, `navigateWithRetry` from `service.puppeteer-manager.ts` — never launch a new browser directly

**Reference files:**
- Identity update: `src/controllers/minds/feature-services/service.minds-comparison.ts` (proposal generation pattern)
- Scrape fallback: `src/controllers/scraper/feature-services/service.scraping-orchestrator.ts` (existing Puppeteer flow)

## Constraints

**Must:**
- Keep the existing chat update endpoint (`POST /:id/identity/chat` with tools) functional — new proposal flow is a parallel endpoint, not a replacement, in case anyone depends on the old behavior
- Proposals are transient (round-trip client) — no DB table, no BullMQ job
- Proposal paths must be a controlled set of identity fields — free-form paths are rejected server-side to prevent the LLM from writing unsafe data
- Block detection must be cheap (single HTTP request, <5s) — don't launch Puppeteer just to test
- Puppeteer fallback must reuse the existing shared browser manager — don't launch a new Puppeteer instance per request
- Screenshot-based fallback is opt-in per URL — admin chooses it, it never runs automatically
- Brand save from Summary tab must mirror `primary_color` / `accent_color` to the legacy project columns (14 consumers depend on those)
- All three parts degrade gracefully if a dependency is missing — e.g., if Puppeteer fails to launch, fall back to the basic fetch with a warning

**Must not:**
- Auto-apply proposals — admin must explicitly approve each one
- Silently accept Cloudflare challenge HTML as page content (current bug)
- Add a new DB table for proposals (keep them transient)
- Modify the existing warmup pipeline in a way that breaks already-warmed-up projects

**Out of scope:**
- Commercial anti-bot bypass services (ScraperAPI, Bright Data) — Playwright + screenshot vision is enough for now
- Concurrent multi-URL Playwright scraping — process URLs sequentially
- CAPTCHA solving — if the page has an interactive CAPTCHA, admin must paste content manually
- Undo / revert for applied proposals (follow-up if needed)
- Saving proposal draft across sessions

## Risk

**Level:** 2 (Concern)

**Risks identified:**
- LLM could propose a path that doesn't exist in the identity schema, causing the apply step to silently no-op. → **Mitigation:** Server-side path validator rejects unknown paths with a clear error. Apply returns which proposals succeeded/skipped so the admin sees the result.
- LLM could propose dangerous deletions (e.g., wiping `business.name`). → **Mitigation:** Only `content_essentials.*` array items and a controlled scalar set can be deleted. `business.name`, `business.place_id`, and other identity-critical fields cannot be the target of DELETE proposals — validator rejects.
- Playwright fallback is slow (5-15s per page). If admins add 10 URLs all needing browser scrape, warmup runs for 2+ minutes. → **Mitigation:** Warmup job already runs in BullMQ with progress tracking. Update progress to report "Rendering {URL} with browser (3/10)..." so admin sees what's happening.
- Screenshot-based extraction costs tokens (Claude vision on a full-page screenshot can be large). → **Mitigation:** Cap screenshot height at 2 full viewports (2x720px). If page is longer, take two screenshots and process separately. Cap text extraction at ~3000 tokens.
- Inline brand editor could desync from the JSON view if admin opens JSON tab while editing. → **Mitigation:** Simple rule — if edit mode active, JSON tab is read-only until Save or Cancel. Show a banner.

**Blast radius:**
- `IdentityModal.tsx` — significant additions (editable brand card, redesigned Chat Update tab, URL test buttons)
- `service.website-scraper.ts` — adds block detection; existing callers get a new `{blocked: true, block_type}` possibility in error return
- `service.identity-warmup.ts` — accepts per-URL strategy parameter; existing callers that pass a flat array of URLs still work (strategy defaults to "fetch")
- New endpoints: `POST /:id/identity/propose-updates`, `POST /:id/identity/apply-proposals`, `POST /:id/test-url`
- New prompts: `IdentityProposer.md`, `ScreenshotTextExtractor.md`

**Pushback:**
- A full Minds-style DB proposal table is overengineered for identity. Proposals are small, flow is fast (~5 seconds to generate, ~1 second to apply). Round-tripping through the client is simpler and doesn't require a new migration.
- Browser fallback + screenshot vision are not perfect — some Cloudflare configs even block Puppeteer's default profile. Be honest with the admin: "We couldn't access this URL. Paste the content manually."

## Proposal Type (Part 2)

Server returns an array of these from `POST /:id/identity/propose-updates`:

```ts
interface IdentityProposal {
  id: string;                    // "prop-0", "prop-1" — stable per request
  action: "NEW" | "UPDATE" | "DELETE";
  path: string;                  // dot path, e.g., "brand.accent_color" or "content_essentials.certifications"
  current_value: unknown;        // current value at path (null for NEW, value for UPDATE/DELETE)
  proposed_value: unknown;       // new value (for NEW/UPDATE), null for DELETE
  summary: string;               // one-line admin-facing summary ("Change accent from #F59E0B to #0D9488")
  reason: string;                // why the LLM proposed this ("User requested navy accent")
  array_item?: boolean;          // true if path points to an array and action is NEW/DELETE of a single item
  critical: boolean;             // true if this change affects a critical identity field (see below)
  critical_reason?: string;      // if critical, brief note explaining why (e.g., "Changing place_id invalidates GBP link")
}
```

**Any path is proposable.** Critical paths are allowed but marked `critical: true` so the UI surfaces a warning and requires explicit confirmation before they can be approved.

**Critical paths (require confirmation):**
- `business.place_id` — critical identifier; changing invalidates GBP link. Re-warmup recommended instead.
- `business.name`, `business.category` — identity anchors used across generated content
- `brand.logo_s3_url` — use dedicated logo-upload flow in the Summary tab; direct edit to the S3 URL works but skips the download step
- `voice_and_tone.archetype` — drives tone across all generated pages; changing after pages are generated causes inconsistency until pages regenerate
- `version`, `warmed_up_at`, `sources_used.*` — metadata; editing these breaks the audit trail
- `raw_inputs.*` — frozen snapshot from warmup; editing breaks re-derivation
- `extracted_assets.*` — derived data; editing diverges from source-of-truth

**Non-critical paths (fast approve):**
- All other `brand.*`, `content_essentials.*`, `voice_and_tone.tone_descriptor`, and `business.*` contact fields

The `IdentityProposer.md` prompt lists the critical-path set so Claude marks proposals accordingly. If the admin approves a critical proposal, the UI requires a second click on a confirm checkbox before the Apply button enables.

## Block Detection Heuristics (Part 3)

**Core principle:** Block detection runs on the response regardless of HTTP status. A Cloudflare challenge page often returns `HTTP 200 OK` with challenge HTML — status-only checks miss this. All content-based rules run on every response.

Server-side detector analyzes a basic `fetch(url)` response. Returns one of:

```ts
type BlockVendor =
  | "cloudflare"
  | "akamai"
  | "sucuri"
  | "datadome"
  | "perimeterx"         // also known as HUMAN Security
  | "imperva"            // covers Incapsula, Distil Networks
  | "kasada"
  | "aws_waf"
  | "f5_bigip"
  | "fastly"
  | "generic_waf"
  | "captcha"            // hCaptcha, reCAPTCHA, Cloudflare Turnstile, GeeTest, Arkose
  | "rate_limit"         // 429
  | "forbidden"          // 403 without a recognized vendor signature
  | "timeout"
  | "empty"
  | "unknown";

type BlockCheckResult =
  | { ok: true; status: number; preview_chars: number; preview_text?: string }
  | {
      ok: false;
      block_type: BlockVendor;
      status: number | null;
      detail: string;
      detected_signals: string[];  // which rules matched (for debugging + admin display)
    };
```

**Detection rules — evaluated in order. Content rules run regardless of status code so we catch 200-response challenge pages.**

**Status-code rules:**
- Timeout (>10s) → `timeout`
- HTTP 429 → `rate_limit`

**Vendor signature rules (content + headers — always evaluated):**

Cloudflare:
- `Server` header contains `cloudflare`
- `cf-ray`, `cf-cache-status`, `cf-mitigated` header present
- HTML contains any of: `challenge-platform`, `cf_chl_opt`, `__cf_chl_jschl_tk__`, `cf-browser-verification`, `Just a moment...`, `Attention Required | Cloudflare`, `Checking your browser before accessing`, `cdn-cgi/challenge-platform`, `cloudflare.com/cdn-cgi/`
- Cookie `__cf_bm` or `cf_clearance` set in response

Akamai (incl. Bot Manager):
- HTML contains `Access Denied` + `Reference #` block (Akamai reference ID pattern)
- `Server` header contains `AkamaiGHost`
- `Set-Cookie` contains `ak_bmsc` or `bm_sz`
- HTML contains `_abck=` cookie-set JS pattern

Sucuri (CloudProxy):
- `Server` header contains `Sucuri/Cloudproxy`
- HTML contains `Sucuri WebSite Firewall`, `sucuri_cloudproxy`

DataDome:
- HTML contains `datadome`, `dd-captcha`, `geo.captcha-delivery.com`
- `Set-Cookie` contains `datadome=`
- HTTP 403 + JSON body with `dd.captcha` field

PerimeterX / HUMAN Security:
- HTML contains `_pxhd`, `pxCaptcha`, `px-captcha`, `perimeterx.net`
- `Set-Cookie` contains `_px`, `_pxhd`, `_pxvid`
- Block page title "Please verify you are a human"

Imperva / Incapsula:
- HTML contains `_Incapsula_Resource`, `incap_ses`, `visid_incap`
- `Set-Cookie` contains `visid_incap_` or `incap_ses_`
- HTML contains `Request unsuccessful. Incapsula incident ID`

Kasada:
- HTML contains `/ips.js` + `bd-ready` pattern
- `Set-Cookie` contains `x-kpsdk-ct` or `x-kpsdk-cd`

AWS WAF:
- HTTP 403 body contains `awselb` or `AWSALB` cookie
- HTML matches `<TITLE>403 Forbidden</TITLE>` + "Request blocked" pattern
- `x-amzn-RequestId` header + 403

F5 Big-IP ASM:
- `Set-Cookie` contains `TS01` (common Big-IP prefix) or `BIGipServer`
- HTML contains `The requested URL was rejected. Please consult with your administrator`

Fastly:
- `Via` header contains `varnish` + `Fastly`
- HTML contains `Request blocked` + Fastly error format

Generic WAF / ModSecurity:
- HTML contains `Mod_Security`, `Generated by Wordfence`, `You don't have permission to access`, `WAF rules`

CAPTCHA (not necessarily blocked — but user cannot proceed):
- `h-captcha`, `g-recaptcha` elements in HTML
- `turnstile` div (Cloudflare Turnstile)
- `data-sitekey=` pattern with hCaptcha/Turnstile/reCAPTCHA domains
- HTML contains `Verify you are human`, `I'm not a robot`, `Please complete the security check`
- GeeTest: `gt_captcha`, `gt-captcha-box`
- Arkose Labs: `arkoselabs`, `funcaptcha`

**Last-resort rules:**
- HTTP 403 without any vendor signature → `forbidden`
- Response body < 200 chars AND status 200 → `empty` (often a JS-loaded shell we can't read)
- Otherwise → `ok`

**What counts as "blocked" for the admin:**
Any non-`ok` result shows the "blocked" warning and exposes fallback strategies. `captcha` and `forbidden` are shown as blocks even when the site is technically reachable — the content we'd scrape is unusable.

**`detected_signals` field:**
Array of rule names that matched — shown in the modal's debug panel so admins can report false positives. Example: `["cf_ray_header", "challenge_platform_html", "cf_bm_cookie"]`.

## Tasks

### T1: Backend — URL Test endpoint + block detection
**Do:**
1. Add detection helper in `src/controllers/admin-websites/feature-utils/util.url-block-detector.ts`:
   - `detectBlock(url): Promise<BlockCheckResult>` — implements the rules above
   - Uses axios with 10s timeout, captures status, headers, first 5KB of body
2. Add endpoint `POST /:id/test-url` in `AdminWebsitesController.ts`:
   - Body: `{ url }`
   - Calls `detectBlock()`, returns `BlockCheckResult`
3. Add route in `routes/admin/websites.ts`

**Files:**
- `src/controllers/admin-websites/feature-utils/util.url-block-detector.ts` (new)
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify)
- `src/routes/admin/websites.ts` (modify)
**Depends on:** none
**Verify:** `curl -X POST /:id/test-url -d '{"url": "https://example.com"}'` returns `{ok: true}`. Hit a known Cloudflare-protected site, returns `{ok: false, block_type: "cloudflare"}`.

### T2: Backend — Puppeteer scrape fallback
**Do:**
1. Add `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts`:
   - `scrapeWithFetch(url): Promise<ScrapeResult>` — wraps existing `service.website-scraper.ts` flow
   - `scrapeWithBrowser(url): Promise<ScrapeResult>` — uses shared `launchBrowser` / `navigateWithRetry` / returns `page.content()` (post-JS HTML)
   - `scrapeWithScreenshot(url): Promise<ScrapeResult>` — same Puppeteer navigate, then `captureDesktop(page)` returns base64, then Claude vision extracts text (max 2 screenshots per URL)
   - Common return shape: `{ baseUrl, text: string, images: string[], strategy_used: "fetch" | "browser" | "screenshot", was_blocked: boolean }`
2. Add `ScreenshotTextExtractor.md` prompt — instructs Claude vision to extract visible text content (headings, body copy, CTAs) from a full-page screenshot, ignoring navigation chrome and cookie banners
3. Extend `service.identity-warmup.ts`:
   - `WarmupInputs.urls` can now be `Array<string>` OR `Array<{ url: string; strategy?: "fetch" | "browser" | "screenshot" }>` — backward-compatible
   - For each URL, call the corresponding strategy
   - Progress log reflects strategy: "Rendering {url} with browser (2/5)..."

**Files:**
- `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts` (new)
- `src/agents/websiteAgents/builder/ScreenshotTextExtractor.md` (new)
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` (modify)
**Depends on:** T1 (reuses block detection output optionally for auto-strategy selection)
**Verify:** Warmup with `{url, strategy: "browser"}` launches Puppeteer, extracts post-JS HTML, cleans it, feeds to distiller. Same for screenshot strategy but via Claude vision.

### T3: Backend — Proposal generation + apply (replaces old chat flow)
**Do:**
1. New prompt `src/agents/websiteAgents/builder/IdentityProposer.md`:
   - System prompt: "You are an identity update proposer. Given a user instruction and a snapshot of the current project identity, produce a structured list of proposals using the `propose_updates` tool. Each proposal targets a specific identity path and is marked `critical: true` if it affects a listed critical path."
   - Explains NEW/UPDATE/DELETE semantics, the proposal schema, and the critical-path list (place_id, business.name/category, logo_s3_url, archetype, metadata/raw_inputs/extracted_assets)
   - Instructs: any path may be proposed, but critical paths MUST have `critical: true` and a `critical_reason` explaining the consequence
2. New service `src/controllers/admin-websites/feature-services/service.identity-proposer.ts`:
   - `generateProposals(projectId, instruction): Promise<IdentityProposal[]>`
   - Reads `project_identity`, builds minimal summary context focused on current state (~500 tokens)
   - Calls `runWithTools` with a `propose_updates` tool schema → parses tool input into typed proposals
   - Server-side validates each proposal: path exists in the identity schema (reachable via dot-walk), action is valid, `critical` flag is consistent with the critical-paths list (server can overwrite `critical=true` defensively even if LLM forgot)
   - `applyProposals(projectId, approvedProposals): Promise<{identity, appliedCount, skippedCount, warnings}>`
     - Walks each approved proposal, applies to identity JSON (NEW appends to array, UPDATE replaces, DELETE removes from array or nulls scalar)
     - Mirrors brand color updates to legacy `primary_color`/`accent_color` columns
     - If `brand.logo_s3_url` is proposed as UPDATE and the value isn't an Alloro S3 URL: triggers logo download → S3 upload (reuses existing helper), substitutes the hosted URL before writing
     - Validates hex colors, HTTPS URLs, enum archetypes server-side — rejects with `warnings` entry if invalid
     - Returns updated identity + counts
3. **Remove the old immediate-apply chat flow:**
   - Delete `src/controllers/admin-websites/feature-services/service.identity-update.ts` entirely (along with the 14-tool definitions)
   - Remove `chatUpdateIdentity` handler from `AdminWebsitesController.ts`
   - Remove route `POST /:id/identity/chat` from `routes/admin/websites.ts`
   - Remove frontend `chatUpdateIdentity` call from `frontend/src/api/websites.ts`
4. New endpoints in `AdminWebsitesController.ts`:
   - `POST /:id/identity/propose-updates` → body `{ instruction }` → returns `{ proposals: IdentityProposal[] }`
   - `POST /:id/identity/apply-proposals` → body `{ proposals: IdentityProposal[] }` → returns `{ identity, appliedCount, skippedCount, warnings }`
5. Add routes

**Files:**
- `src/agents/websiteAgents/builder/IdentityProposer.md` (new)
- `src/controllers/admin-websites/feature-services/service.identity-proposer.ts` (new)
- `src/controllers/admin-websites/AdminWebsitesController.ts` (modify — remove chat handler, add proposer handlers)
- `src/routes/admin/websites.ts` (modify — remove /identity/chat, add propose + apply routes)
- `src/controllers/admin-websites/feature-services/service.identity-update.ts` (delete)
- `frontend/src/api/websites.ts` (modify — remove chatUpdateIdentity)
**Depends on:** none (independent of T1, T2)
**Verify:** POST `/:id/identity/propose-updates` with "change accent to navy and add ADA certification" returns 2 proposals (UPDATE on brand.accent_color, NEW on content_essentials.certifications). Critical paths are marked. POST apply-proposals with just `[proposals[0]]` updates accent only. Old `POST /:id/identity/chat` returns 404.

### T4: Frontend — URL Test UI in Identity modal
**Do:**
1. Add test API call in `frontend/src/api/websites.ts`:
   - `testUrl(projectId, url): Promise<BlockCheckResult>`
2. Update `IdentityModal.tsx` URL inputs:
   - Each URL row gains a "Test" button (icon + tooltip)
   - After test, row shows status icon: ✅ ok / ⚠️ blocked / ⏱ timeout
   - If blocked, row expands to show strategy picker: radio buttons for "Use browser scrape" / "Use screenshot + AI" / "Skip this URL"
   - Selected strategy travels along with the URL into the warmup submit payload
3. Update the warmup submit type in `startIdentityWarmup` API signature to accept per-URL strategies

**Files:**
- `frontend/src/components/Admin/IdentityModal.tsx` (modify)
- `frontend/src/api/websites.ts` (modify)
**Depends on:** T1
**Verify:** Manual: enter a Cloudflare-protected URL, click Test, see yellow warning, pick "Use browser scrape", run warmup, confirm the backend uses Puppeteer for that URL.

### T5: Frontend — Editable Brand in Summary tab
**Do:**
1. In `IdentityModal.tsx` Summary tab's Brand card:
   - Add an Edit button (top-right of the card)
   - Edit mode: replaces the swatches with `<ColorPicker>` for primary and accent, shows `<GradientPicker>` below
   - Save button calls `updateIdentity()` (PUT /:id/identity) with the updated `brand.*` block
   - Cancel discards changes, reverts to view mode
   - While edit mode is active, disable the JSON tab (show tooltip "Save or cancel brand edits first")
2. Brand save mirrors colors to legacy project columns automatically (backend already does this in PUT handler)

**Files:**
- `frontend/src/components/Admin/IdentityModal.tsx` (modify)
**Depends on:** none (reuses existing PUT endpoint + components)
**Verify:** Click Edit on Brand card, change accent, enable gradient, click Save → modal refreshes with new values, JSON tab shows updated brand block.

### T6: Frontend — Chat Update proposal review UI (replaces existing Chat tab)
**Do:**
1. Fully replace the Chat Update tab content in `IdentityModal.tsx`:
   - Top: instruction textarea + "Propose Changes" button
   - On submit: calls `POST /:id/identity/propose-updates`, renders returned proposals as a checklist
   - **Proposal row layout:**
     - Left: checkbox (approved). Default state: approved for non-critical; unchecked for critical.
     - Badge: NEW (green) / UPDATE (blue) / DELETE (red)
     - **Critical badge (red ⚠)** if `critical: true` — tooltip shows `critical_reason`
     - Summary text + expand toggle for the diff view
     - Expanded diff:
       - UPDATE: two-column current (red strike) → proposed (green)
       - NEW: green-highlighted proposed value
       - DELETE: red strikethrough current value
     - "Why" row showing `reason`
   - **Critical confirmation gate:** If any approved proposal is critical, the "Apply Approved" button is disabled until the admin checks a box below the list: "☐ I understand these critical changes (see red badges)". Unchecking any critical proposal removes the gate.
   - Bottom: "Apply Approved" button + "Discard" button
   - On Apply: calls `POST /:id/identity/apply-proposals` with only approved proposals, shows toast with counts ("Applied 3 of 5 changes. 1 skipped (see warnings)."), refreshes identity, clears the proposals view
2. Add API calls in `frontend/src/api/websites.ts`:
   - `proposeIdentityUpdates(projectId, instruction): Promise<{proposals: IdentityProposal[]}>`
   - `applyIdentityProposals(projectId, proposals): Promise<{identity, appliedCount, skippedCount, warnings}>`
3. Remove the `chatUpdateIdentity` API function entirely (replaced by the two above)
4. Remove any call sites of the old tool flow in the modal (dead after removal)

**Files:**
- `frontend/src/components/Admin/IdentityModal.tsx` (modify — replace Chat Update content)
- `frontend/src/api/websites.ts` (modify)
**Depends on:** T3
**Verify:** Type "change accent to navy, add ADA cert, change archetype to pediatric (affects all generated pages), tone should be more clinical". See 4 proposals — archetype change shows a red critical badge. Can't apply until I check the "I understand" box. Apply with only some proposals approved → toast shows counts → summary reflects only the approved changes.

## Done
- [ ] `npx tsc --noEmit` — zero errors (backend)
- [ ] `cd frontend && npx tsc --noEmit` — zero errors (frontend)
- [ ] **Part 1 — Editable Brand**
  - [ ] Brand card in Summary has Edit button
  - [ ] Edit mode shows ColorPicker for primary/accent + GradientPicker
  - [ ] Save writes through to `project_identity.brand` + legacy columns
  - [ ] JSON tab is disabled while editing brand
- [ ] **Part 2 — Proposal Review (replaces old chat flow)**
  - [ ] `POST /:id/identity/propose-updates` returns typed proposals array with `critical` flag
  - [ ] Proposals validated server-side (path must dot-walk to identity schema; invalid paths rejected)
  - [ ] Critical paths auto-flagged even if LLM forgets
  - [ ] Frontend shows proposal checklist with NEW/UPDATE/DELETE badges + diff view + critical badges
  - [ ] Critical proposals require explicit "I understand" confirmation to approve
  - [ ] Admin can approve/reject per proposal
  - [ ] `POST /:id/identity/apply-proposals` applies only approved, mirrors brand colors, triggers logo download when logo_s3_url UPDATE isn't already Alloro S3, returns counts + warnings
  - [ ] Old `POST /:id/identity/chat` and `service.identity-update.ts` deleted; `chatUpdateIdentity` removed from frontend API
- [ ] **Part 3 — URL Test + Fallback**
  - [ ] `POST /:id/test-url` detects Cloudflare, 403, 429, empty, timeouts
  - [ ] IdentityModal URL inputs have a Test button with visible status
  - [ ] Blocked URLs expose strategy picker (browser / screenshot / skip)
  - [ ] Warmup pipeline honors per-URL strategy
  - [ ] Puppeteer-based scrape reuses shared browser manager
  - [ ] Screenshot-based extraction runs Claude vision and feeds cleaned text into the distiller
  - [ ] No new Puppeteer instance leaks — every browser is closed in a finally block
- [ ] **Backward compat**
  - [ ] Existing identity modal flows (empty warmup form, JSON edit, old chat-with-tools) unchanged
  - [ ] Projects already warmed up don't need to re-warmup
  - [ ] `WarmupInputs.urls` accepts both string[] and object[] (with strategy)
