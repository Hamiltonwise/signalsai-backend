# Alloro Protect Badge + Landing Page

## Problem Statement

Forms on rendered sites have no visible branding or trust signal. Add a subtle "Protected by Alloro Protect" badge below every form and create a landing page at getalloro.com/alloro-protect explaining the protection.

## Context Summary

- `buildFormScript()` already injects honeypot + timestamp into every form (both repos)
- alloro-site is a React 18 + Vite SPA with React Router, Tailwind CSS, Framer Motion
- /privacy and /terms pages share identical layout: Header (showBackToHome) → Hero → Content → Footer

## Existing Patterns to Follow

- Privacy/Terms page structure, animation, typography, color scheme
- `buildFormScript` injects DOM elements via vanilla JS

## Proposed Approach

### 1. Badge in buildFormScript (both repos)
- After the honeypot injection, create a small anchor element below each form
- Alloro logo (SVG inline, ~12px) + "Protected by Alloro Protect" text
- Links to https://getalloro.com/alloro-protect
- Styled: muted gray, small font, centered, subtle

### 2. AlloroProtect page in alloro-site
- New file: `src/pages/AlloroProtect.tsx`
- Same layout as Privacy/Terms
- Content: explains the 6 security layers protecting form submissions
- Route: `/alloro-protect` in App.tsx

## Risk Analysis

Level 1 — purely additive, no existing behavior changes.

## Definition of Done

- [x] Badge appears below every form on rendered sites
- [x] Badge links to getalloro.com/alloro-protect
- [x] /alloro-protect page exists with security explanation content
- [x] Route registered in App.tsx
- [x] Both buildFormScript copies identical
