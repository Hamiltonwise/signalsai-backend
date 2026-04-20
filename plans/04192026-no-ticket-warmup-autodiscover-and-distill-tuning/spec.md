# Warmup Auto-Discover + Distillation Tuning

## Why
E2E pipeline test on a real 4-location dental practice (Coastal Endodontic Studio) revealed four quality gaps that survive the earlier clean-then-cap fixes. In order of impact:

1. **Silent scrape failure on GBP-derived URLs.** GBP returns `http://coastalendostudio.com/` but Puppeteer rejects it with `ERR_BLOCKED_BY_CLIENT`. Admins who paste the URL the GBP picker surfaced get an empty identity with no error.
2. **Doctor source_urls mostly null.** Admins don't manually enumerate every doctor's page, so 3 of 4 doctors lost their `source_url` — which breaks the Posts-tab "Import from Identity" flow for doctors.
3. **`certifications[]` contaminated.** Distillation emits `["DDS", "DMD", "Board Certified Endodontist (Dr. Jonathan Fu — …)"]`. Degrees aren't practice certifications, and per-doctor credentials bundled with names belong on each doctor entry, not the practice list.
4. **No doctor↔location binding.** With 4 doctors across 4 offices, there's no way to tell which doctor works where. Multi-location template pages can't render accurate staff lists.

Goal: ship enough + accurate data so the page builder and Posts-tab imports work without admin hand-holding.

## What
Four changes grouped into two execution lanes:

- **Lane A — Scrape layer (code-only):**
  - **A1 URL normalization.** Upgrade `http://` → `https://` and add `www.` on bare domains before any navigation.
  - **A2 Auto-discover sub-pages.** After the primary page scrape, extract internal links matching dental URL patterns (doctors/services/about/treatments) and scrape up to N additional pages in parallel with concurrency limit 3.

- **Lane B — Distillation prompt + schema (prompt + type):**
  - **B1 Doctor credentials field.** Add `doctors[i].credentials?: string[]` to `ProjectIdentity.content_essentials.doctors`.
  - **B2 Distillation prompt tightening.** `certifications[]` = practice-level only. Doctor-level credentials go on `doctors[i].credentials`. Explicitly exclude standalone degrees (DDS/DMD/MD/MSD) from `certifications[]`.
  - **B3 Doctor↔location binding.** Add `doctors[i].location_place_ids?: string[]`. Prompt instructs the LLM to populate only when a doctor page explicitly names a location; otherwise leave empty (meaning "all locations").

## Context

**Relevant files:**
- `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts` — `scrapeUrl` + `scrapeUrlWithEscalation`. A1 lands at the entry of both. A2 uses these helpers as leaves.
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` — lines 169–220 own the URL loop. A2 inserts a discovery pass right after the primary scrape and before image processing.
- `src/controllers/admin-websites/feature-utils/util.identity-context.ts` — `ProjectIdentity` type. B1 and B3 extend `doctors[i]`.
- `src/agents/websiteAgents/builder/IdentityDistiller.md` — distillation prompt. B2 and B3 surgical edits to the `certifications[]`, `doctors[]` sections.
- `frontend/src/components/Admin/IdentityModal.tsx` — Doctors tab reads `doctors[]` defensively (displays whatever fields exist). B1 and B3 are back-compat on the UI side.

**Patterns to follow:**
- **Concurrency-3 worker pool:** `runWithConcurrency` in `service.identity-warmup.ts` (the same helper used for multi-location GBP scrapes). Reuse for A2 sub-page scraping.
- **Scrape result merging:** the existing URL loop iterates user-entered URLs and writes into `scrapedPagesRaw[\`${url}#${key}\`]`. A2 discovered pages join the same dict — no separate bucket.
- **Prompt-level schema extension:** mirror how `service_areas[]` is described in the distiller (rules + "only include if explicitly present" framing).

**Reference files:**
- For A2 sub-page discovery: closest analog is how `service.identity-warmup.ts` already reads `imageUrls` from `gbpData`. Same idea: scrape primary → pull internal links → fan out.
- For URL normalization: the existing `util.url-block-detector.ts` already uses `new URL(u)` for parsing; same API in the normalizer.

## Constraints

**Must:**
- A1 URL normalization must be applied to:
  - Every admin-entered URL in `inputs.urls[]`.
  - Every GBP-derived `website_url` if ever used as a scrape target.
  - Every discovered sub-page URL from A2.
- A1 must preserve the admin's intent: if an admin explicitly types `http://intranet.example.com/` (rare but possible for internal testing), the normalizer attempts `https://` first AND falls back to the original `http://` on failure. Don't kill HTTP-only sites.
- A2 sub-page discovery runs **only when the admin-entered URL count is < 5**. If the admin already entered many URLs, skip auto-discovery (assume intent is explicit).
- A2 cap: 10 TOTAL pages scraped per warmup (user-entered + discovered combined). If admin entered 3, discover up to 7 more. If admin entered 8, discover up to 2 more.
- A2 URL pattern whitelist is narrow — only match `/meet-dr-*`, `/dr-*`, `/doctor*`, `/our-team*`, `/our-doctors*`, `/services*`, `/treatments*`, `/procedures*`, `/about*`, `/our-practice*`.
- A2 discovered URLs must be same-origin as the primary URL. Cross-origin links are dropped.
- A2 runs with concurrency 3 (same as multi-location scrape).
- B1 new fields on `doctors[]` must be **optional**. Existing identities without them render correctly.
- B2 prompt change must not regress testimonial, UVP, service, or service-area extraction on the coastalendostudio.com ground-truth.
- B3 prompt rule: `location_place_ids` is set **only when the doctor page explicitly names an office** (by city/address match against the known locations list). Empty array means "all locations" — the UI treats this as "unspecified."

**Must not:**
- Don't add a denylist/whitelist for specific URLs per-project. One global whitelist covers 99% of dental sites.
- Don't rewrite the scraper's retry logic. A1 and A2 sit above it.
- Don't break the existing singular `certifications[]: string[]` shape — keep it string array, just populate it more strictly.
- Don't require the admin to do anything differently. If they still enter URLs manually, warmup respects their set; A2 only augments when the count is low.
- Don't scrape `/blog/*`, `/news/*`, `/post/*` — too much content volume, low signal.

**Out of scope:**
- Per-treatment page scraping (e.g. `/services/invisalign`, `/services/root-canal`) — high sprawl, low ROI.
- Redirect chain unwinding. If a normalized URL 301s to a canonical form, we scrape the final URL as-is.
- Auto-discovery of content beyond dental patterns. Other verticals need their own whitelists (future plan).
- Retroactively re-distilling existing projects. New schema fields populate on next warmup; old identities keep whatever they had.

## Risk

**Level:** 2. A2 adds meaningful warmup latency (up to +120s worst case). B2 is a prompt change with regression risk. A1 and B1/B3 are Level 1.

**Risks identified:**
- **A2 latency blowup.** 10 pages × ~15s per browser scrape = 150s. → **Mitigation:** concurrency limit 3, per-URL 60s budget (already set), and skip A2 entirely when admin entered ≥ 5 URLs. Worst realistic case: 4 discovered pages × 15s / 3 workers = ~20s added.
- **A2 false-positive URLs.** A link like `/services-overview` matches `/services*` and is fine. But `/services-intake-form.pdf` would also match. → **Mitigation:** reject URLs with file extensions (`.pdf`, `.doc`, `.jpg`, `.png`, `.mp4`), reject URLs containing `?download=`, reject URLs longer than 200 chars.
- **A2 loop risk if primary page links to itself.** Homepage often has a "services" link that's itself. → **Mitigation:** dedupe discovered URLs against already-scheduled URLs (admin + primary). Never scrape the same URL twice.
- **A1 breaks HTTP-only dev sites.** Rare, but possible during development against local tunnels. → **Mitigation:** on normalization failure, fall back to the original URL once. Log the attempt.
- **B2 prompt regression.** Tightening `certifications[]` and splitting doctor credentials could confuse the LLM into producing empty certifications when a dental site does mention a practice-level certification. → **Mitigation:** before/after test on the e2e harness (`/Users/rustinedave/Desktop/alloro/scripts/debug-warmup/e2e-pipeline.ts`). Spec's Done checklist requires this comparison.
- **B3 doctor↔location binding over-reach.** LLM may guess wrong when a doctor page vaguely mentions a city. → **Mitigation:** prompt says "only when explicitly named" + require an address or city match against the known `locations[]` list passed in context. On ambiguity, leave empty.

**Blast radius:**
- A1 touches every scrape — but the normalization is a no-op on already-`https://www` URLs, so existing working warmups are unaffected.
- A2 adds new scrape cost per warmup — flag in cost tracking telemetry (`ai_cost_events` already exists for LLM costs; scrape cost is operational but not dollar-tracked yet).
- B1 is additive schema. Back-compat.
- B2 changes distillation output shape for all future warmups. Existing identities are not migrated.
- B3 additive schema + additive prompt rule. Back-compat.

**Pushback:**
- **A2 latency vs completeness tradeoff:** a full 10-page scrape adds meaningful time. Worth it because doctors[].source_url is the gate for Posts-tab imports — without it, the whole import-from-identity flow fails for doctor posts. The latency cost buys a working feature.
- **B2's split of certifications vs doctor credentials is cleaner but more rigid.** If a dental site lists "Board Certified in Endodontics" without attributing to a specific doctor, it becomes ambiguous — does it go on the practice or on every doctor? Recommendation: if unattributed, include in `certifications[]` (practice-level). Doctor-attributed always goes on the doctor.
- **B3 is nice-to-have, not must-have.** For single-location practices the field is noise. Shipping it now so multi-location template rendering has the data; if underused, easy to drop later.

## Tasks

Two parallel agents. Lane A (scrape) and Lane B (distillation + schema) share no files.

---

### Lane A — Scrape layer (Agent 1)

#### T1: URL normalization helper
**Do:** Add `normalizeScrapeUrl(url: string): { primary: string; fallback: string | null }` to `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts`.

Rules:
- Parse with `new URL(url)`.
- If `protocol === "http:"`, set `primary.protocol = "https:"`. Record original as `fallback`.
- If hostname has 2 labels (e.g. `example.com`, no subdomain), add `www.` prefix to `primary`. Record bare as `fallback`.
- If both conditions apply, try `https://www.bare.com/` first, fall back to `http://bare.com/` on failure.
- If neither condition applies, return `{primary: url, fallback: null}`.
- Preserve path, query, hash from the input.

Wire into `scrapeUrlWithEscalation`: if the primary attempt returns `was_blocked: true` or empty `pages`, retry once with the fallback URL before escalating strategies. Only retry-with-fallback once per URL.

**Files:** `src/controllers/admin-websites/feature-services/service.url-scrape-strategies.ts`.
**Depends on:** none.
**Verify:** run `npx tsx scripts/debug-warmup/test-url-normalize.ts` — all three variants should return non-zero `raw` chars.

#### T2: Sub-page auto-discovery
**Do:** In `service.identity-warmup.ts` URL loop (~line 169), after all admin-entered URLs are scraped, add a discovery pass:

1. Skip if admin entered ≥ 5 URLs OR total scraped-page count already ≥ 10.
2. Aggregate all `href` attributes from every scraped page's HTML (use `cheerio` to parse). Already a dependency.
3. Normalize each link: resolve against the page's URL, drop cross-origin, drop file-extension URLs (`.pdf|.doc|.jpg|.jpeg|.png|.gif|.mp4|.zip`), drop `?download=*`, drop URLs > 200 chars.
4. Filter against the dental-pattern whitelist:
   - `/meet-dr-*`, `/dr-*`, `/doctor*`, `/our-team*`, `/our-doctors*`, `/team*`
   - `/services*`, `/treatments*`, `/procedures*`
   - `/about*`, `/our-practice*`, `/our-story*`
5. Dedupe against URLs already scraped. Cap at `10 - (admin-URL count + 1)`. (The +1 accounts for the primary.)
6. Scrape the discovered URLs with concurrency 3 via the existing `runWithConcurrency` helper. Call `scrapeUrlWithEscalation` per URL, merge into `scrapedPagesRaw` + `scrapedImages` + `discoveredPages` like the main loop.
7. Log: `[IdentityWarmup] Auto-discovered sub-pages: N (primary: X, admin: Y, discovered: Z)`.

**Files:** `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` (+ `import * as cheerio` at top if not already imported).
**Depends on:** T1 (discovered URLs go through normalization).
**Verify:** run e2e harness on coastalendostudio.com entering only `https://www.coastalendostudio.com/` (no sub-pages). Expect ≥ 3 additional pages scraped (homepage + ≥ 3 discovered = ≥ 4 `scrapedPagesRaw` entries). `doctors[].source_url` should populate for at least 2 doctors.

---

### Lane B — Distillation prompt + schema (Agent 2)

#### T3: Schema — doctors[].credentials + location_place_ids
**Do:** In `src/controllers/admin-websites/feature-utils/util.identity-context.ts`, extend the `ProjectIdentity.content_essentials.doctors[]` type:

```ts
doctors?: Array<{
  name: string;
  source_url: string | null;
  short_blurb: string | null;
  credentials?: string[];           // NEW — per-doctor (DDS, DMD, Board Certified in X)
  location_place_ids?: string[];    // NEW — empty means "all locations"
  last_synced_at: string;
  stale?: boolean;
}>;
```

No migration needed — JSONB absorbs additions. Existing identities without these fields render correctly (both are optional).

**Files:** `src/controllers/admin-websites/feature-utils/util.identity-context.ts`.
**Depends on:** none.
**Verify:** `npx tsc --noEmit` in backend root — no errors.

#### T4: Distillation prompt — certifications split + doctor credentials + location binding
**Do:** Surgical edits to `src/agents/websiteAgents/builder/IdentityDistiller.md`:

(a) **certifications[] rule tightening** — replace the current rule block with:

```
- For `certifications`: PRACTICE-LEVEL ONLY. Only include credentials that
  describe the practice as a whole, such as:
    - Practice accreditations: "ADA-accredited", "AAE member practice"
    - Provider designations: "Invisalign Diamond+ Provider", "Platinum Provider"
    - State / specialty affiliations: "California Dental Association member"
  DO NOT include:
    - Standalone degrees (DDS, DMD, MD, MSD) — these are doctor credentials
    - Per-doctor board certifications (e.g. "Dr. X is Board Certified in Y")
      — put these on the doctor entry's `credentials` field instead
    - Unattributed "Board Certified Endodontist" statements that clearly refer
      to a specific named doctor elsewhere on the page
  If the practice has no unambiguous practice-level credentials, return an
  empty array. Do not invent or infer.
```

(b) **doctors[i].credentials rule — new** — add to the `doctors[]` section:

```
- `credentials`: string array of this doctor's own credentials.
  Include degrees (DDS, DMD, MD), board certifications ("Board Certified in
  Endodontics", "Diplomate of the American Board of Orthodontics"), and
  professional memberships specific to them ("AAE member", "AAO Fellow").
  Do NOT put practice-wide designations here.
  If the page doesn't explicitly list credentials, return an empty array.
```

(c) **doctors[i].location_place_ids rule — new** — add to the `doctors[]` section, noting the list of known locations is injected into the user message (task also has to pass it in — see below):

```
- `location_place_ids`: array of place_ids (from the LOCATIONS block in the
  user message) for offices where this doctor explicitly works. Only include
  a place_id when the doctor's page explicitly names that office by city or
  address. If ambiguous or not stated, return an empty array (interpreted as
  "works all locations" by the UI).
```

(d) Update the call site in `service.identity-warmup.ts` `distillContent()` so the known-locations list is included in the user message BEFORE the `## Website Content` block:

```
## LOCATIONS (use these place_ids for doctors[].location_place_ids when the doctor is explicitly tied to an office)

- {place_id} — {name} — {address}
- ...
```

Populate from the `locations[]` array assembled earlier in warmup. Pass the locations array through `distillContent`'s signature.

**Files:** `src/agents/websiteAgents/builder/IdentityDistiller.md`, `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` (pass locations into distillContent + assemble LOCATIONS block).
**Depends on:** T3.
**Verify:** re-run `scripts/debug-warmup/e2e-pipeline.ts` stage 4 on coastalendostudio.com. Expected output changes:
- `certifications[]` — no more `DDS`, `DMD`, or `Board Certified Endodontist (Dr. ...)` entries. Likely empty (no practice-level creds on this specific site).
- `doctors[i].credentials` — populated with per-doctor degrees + board certs.
- `doctors[i].location_place_ids` — empty array for all 4 doctors (site doesn't explicitly pin doctors to specific offices).
- UVP, testimonials, service_areas, core_values, services — unchanged.

## Done
- [ ] `npx tsc --noEmit` clean in both workspaces.
- [ ] Running e2e harness (`npx tsx scripts/debug-warmup/e2e-pipeline.ts "" 2`) on a warmup starting from `http://coastalendostudio.com/` (the GBP-returned form) now succeeds — no `ERR_BLOCKED_BY_CLIENT`.
- [ ] Running e2e harness stage 2 on a project where admin only entered `https://www.coastalendostudio.com/` → ≥ 4 pages scraped (primary + auto-discovered doctor/service pages).
- [ ] Re-run stage 4 distillation → `certifications[]` is either empty or contains only practice-level designations (no DDS/DMD, no doctor-attributed entries).
- [ ] Doctors returned from distillation each have a `credentials[]` array populated.
- [ ] At least 2 of 4 doctors have non-null `source_url` (previously only 1 did).
- [ ] No regression: UVP, testimonials, services, service_areas, core_values all still populated on the same ground-truth.
- [ ] UI renders correctly with new `doctors[i].credentials` field displayed (even if as just a comma-joined list under the name).

## Revision Log
_(empty — populate during --continue if scope changes)_
