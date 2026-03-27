# Newsletter Template Pages — Real Pages Instead of Fallbacks

## Problem Statement

The `/confirmed` and `/success` pages for newsletter flows are auto-rendered fallback templates — not real project pages. They can't be tracked, edited, or customized. Need real template JS files that create actual pages in the project, and update the redirect logic so newsletter forms go to `/newsletter-success` while regular forms still go to `/success`.

## Context Summary

- Template JS format: `{ wrapper, header, footer, sections: [{ name, content }] }` in `002-saas-website-template/`
- Existing templates follow a pattern: wrapper has `<head>` + body shell, header/footer are nav+footer, sections are the content blocks
- `buildFormScript` (3 copies) currently redirects all forms to `/success`
- `newsletterConfirmController.ts` redirects to `${siteUrl}/confirmed`
- `siteRoute` has fallback logic for both `/success` and `/confirmed` paths

## Proposed Approach

### 1. Create template JS files

- `saas-newsletter-success.js` — page shown after newsletter form submission ("Check your inbox")
- `saas-opt-in-confirmed.js` — page shown after clicking confirmation link ("You're subscribed!")
- Both reuse wrapper/header/footer from existing saas templates
- Simple single-section pages with themed content

### 2. Update form script redirect logic (all 3 copies)

- Newsletter forms (`formType === 'newsletter'`) → redirect to `/newsletter-success`
- All other forms → redirect to `/success` (unchanged)

### 3. Update confirm controller redirect

- Change `/confirmed` → `/opt-in-confirmed` in `newsletterConfirmController.ts`

### 4. Remove fallback auto-render for /confirmed

- Remove the `/confirmed` fallback in `siteRoute` (these will be real pages)
- Keep `/success` fallback (regular contact forms still need it)

### 5. Keep /newsletter-success fallback temporarily

- Add a `/newsletter-success` fallback in siteRoute as safety net until pages are created from templates

## Risk Analysis

Level 1 — Path rename + template creation. No data changes.

## Definition of Done

- [x] `saas-newsletter-success.js` template created in 002 folder
- [x] `saas-opt-in-confirmed.js` template created in 002 folder
- [x] `buildFormScript` (all 3 copies): newsletter forms redirect to `/newsletter-success`
- [x] `newsletterConfirmController.ts`: redirect to `/opt-in-confirmed`
- [x] `siteRoute`: removed `/confirmed` fallback (kept `/success` for regular forms)
- [x] All three repos compile clean
