# Playwright Visual UI Checker

## Why
The current UI checker only analyzes raw HTML structure (duplicate classes, missing containers). It completely misses visual rendering issues — overlapping elements, broken grids, text collisions, content spilling outside containers. These are the most impactful issues and can only be caught by actually rendering the page.

## What
Add Playwright to the backend. When UI Check runs, it renders each selected page in headless Chrome, takes viewport screenshots (desktop + mobile), sends them to Sonnet's vision capability, and gets back structured visual issue reports. These become recommendations in the same approve/reject/execute flow.

## Context

**Relevant files:**
- `signalsai-backend/src/utils/website-utils/uiChecker.ts` — current HTML-only checker
- `signalsai-backend/src/controllers/admin-websites/feature-services/service.ai-command.ts` — `analyzeSpecializedBatch()` calls uiChecker
- The website-builder-rebuild renders pages at `https://{hostname}.sites.getalloro.com/`

**How pages are accessed:**
- Each project has a `generated_hostname` (e.g., `smart-health-2982`)
- Pages render at `https://{hostname}.sites.getalloro.com{path}`
- Draft pages are accessible with `?preview=true` (or the same URL since the renderer falls back)

## Constraints

**Must:**
- Use Playwright with headless Chromium
- Screenshot at desktop (1440px) and mobile (375px) viewports
- Send screenshots to Sonnet vision for analysis
- Produce actionable recommendations (not just "looks broken" but "section X overlaps section Y — fix the grid")
- Run within the existing UI Check batch flow
- Fall back to HTML-only analysis if Playwright fails

**Must not:**
- Block the entire batch if one page fails to render
- Take more than 60 seconds per page (screenshot + analysis)
- Store screenshots permanently (process and discard)

**Out of scope:**
- Cross-browser testing (Chromium only)
- Accessibility audit (WCAG compliance — separate tool)
- Performance testing (Lighthouse — separate tool)

## Risk
**Level:** 2 — New dependency (Playwright), network calls to render pages, vision API costs. But well-contained.

**Risks:**
- Playwright adds ~200MB to node_modules → **Mitigation:** install as optional dependency, UI Check gracefully degrades without it
- Vision API costs (~$0.01-0.03 per screenshot) → **Mitigation:** only runs when user explicitly triggers UI Check
- Rendered pages may differ from production (draft vs published) → **Mitigation:** use the live site URL with the actual hostname

## Tasks

### T1: Install Playwright
**Do:** Add `playwright` as a dependency. Run `npx playwright install chromium` for the headless browser.

**Files:** `signalsai-backend/package.json`
**Verify:** `npx playwright install chromium` completes, import works

### T2: Screenshot service
**Do:** Create `signalsai-backend/src/utils/website-utils/screenshotService.ts`

```typescript
screenshotPage(url: string, viewports: Viewport[]): Promise<Screenshot[]>
```

- Launches headless Chromium (reusable browser instance)
- Navigates to URL, waits for network idle
- Takes full-page screenshots at each viewport
- Returns base64-encoded PNG buffers
- 30-second timeout per page
- Graceful error handling (returns empty array on failure)

Viewports: `[{ width: 1440, height: 900, label: "desktop" }, { width: 375, height: 812, label: "mobile" }]`

**Files:** `signalsai-backend/src/utils/website-utils/screenshotService.ts`
**Verify:** Can screenshot a URL and return base64 images

### T3: Visual analysis via Sonnet vision
**Do:** Add to `aiCommandService.ts`:

```typescript
analyzeScreenshot(params: {
  screenshot: Buffer;
  viewport: string;
  pageUrl: string;
  pagePath: string;
}): Promise<VisualIssue[]>
```

System prompt for vision analysis:
- "You are a UI/UX quality analyst reviewing a website screenshot"
- Look for: overlapping elements, broken grids, text collision, content overflow, misaligned elements, broken images, incorrect spacing, responsive issues
- Return structured JSON: `{ issues: [{ area, severity, description, suggested_fix }] }`

**Files:** `signalsai-backend/src/utils/website-utils/aiCommandService.ts`
**Verify:** Vision analysis returns structured issues

### T4: Integrate into UI Check batch
**Do:** Update `analyzeSpecializedBatch()` for `ui_checker` type:

1. Run existing HTML-only checks (current uiChecker.ts)
2. For each page, build the URL from project hostname + page path
3. Call `screenshotPage()` for desktop + mobile viewports
4. Send each screenshot to `analyzeScreenshot()`
5. Convert visual issues to recommendations
6. Insert into DB alongside HTML-check recommendations

Mark visual recommendations with `flag_type: "fix_visual"`.

**Files:** `service.ai-command.ts`
**Verify:** UI Check batch produces both HTML and visual recommendations

### T5: Frontend — visual issue badge
**Do:** Add `fix_visual` to flag labels: "Visual Issue" with a distinct badge color.

**Files:** `AiCommandTab.tsx`
**Verify:** Visual issue badge renders

## Done
- [ ] Playwright installed and Chromium available
- [ ] Screenshot service captures desktop + mobile
- [ ] Vision analysis returns structured issues
- [ ] UI Check batch includes visual recommendations
- [ ] HTML-only checks still run as before
- [ ] Graceful fallback if Playwright unavailable
- [ ] `npx tsc --noEmit` passes
- [ ] Manual: run UI Check on the broken accessibility page, verify it catches overlapping elements
