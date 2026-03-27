# Replace Native Confirms with Glass Effect Modals

## Problem Statement
All destructive/confirmation actions use native `window.confirm()` which is ugly, inconsistent with the app's design, and not customizable. Replace with animated glass-effect modals with blur backdrop overlay.

## Context Summary
- 37 `confirm()` calls across 18 files
- App uses Framer Motion for animations, Tailwind for styling
- Two themes: light (regular admin) and dark (.minds-theme) — modal must work in both
- DesignSystem.tsx has existing animated components (ActionButton, AnimatedCard, etc.)
- App root is in App.tsx with providers wrapping routes

## Existing Patterns to Follow
- Framer Motion AnimatePresence for enter/exit animations
- Context-based providers (AuthProvider, GBPProvider, etc.)
- react-hot-toast for non-blocking notifications
- ActionButton component for styled buttons

## Proposed Approach

### 1. Create `ConfirmModal.tsx` in `components/ui/`
- `ConfirmProvider` — React context provider managing modal state
- `useConfirm` — hook returning `confirm(options)` → `Promise<boolean>`
- `ConfirmModal` — animated glass panel with blur backdrop
- Supports: title, message, confirmLabel, cancelLabel, variant (danger/default)
- Keyboard: Escape to cancel, Enter to confirm

### 2. Add `ConfirmProvider` to App.tsx
- Wrap inside `<AuthProvider>` so it's available everywhere

### 3. Replace all 37 confirm() calls across 18 files
- Each file: import `useConfirm`, add hook call, replace confirm() with await confirm({...})

## Risk Analysis
- **Level 1**: UI-only change, no business logic affected
- All confirmations remain blocking (Promise-based) so control flow is unchanged

## Definition of Done
- Zero native confirm() calls in codebase
- Glass modal with blur backdrop renders for all confirmations
- Animated entrance/exit
- Works in both light and dark themes
- TypeScript clean
