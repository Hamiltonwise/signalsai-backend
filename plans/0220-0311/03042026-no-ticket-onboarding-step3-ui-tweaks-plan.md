# Onboarding Step 3 UI Tweaks

## Problem Statement
Two minor UI issues on the Google Connect step: the Continue button has a rocket icon that should be removed, and the "Skip for now" link is too subtle (slate-400) and needs to be alloro-orange.

## Context Summary
- `Step2_DomainInfo.tsx` lines 346 and 358
- Rocket icon imported from lucide-react

## Existing Patterns to Follow
- alloro-orange color: `text-alloro-orange`

## Proposed Approach
1. Remove `<Rocket className="w-4 h-4" />` from the Continue button
2. Change skip button color from `text-slate-400 hover:text-slate-600` to `text-alloro-orange hover:text-alloro-orange/80`
3. Remove unused `Rocket` import if no longer referenced

## Risk Analysis
- Level 1 — Suggestion. Two CSS/JSX tweaks.

## Definition of Done
- [x] Rocket icon removed from Continue button
- [x] Skip link styled in alloro-orange
