# Chat Garamond Font & Size Upgrade

## Problem Statement
Chat bubbles in both MindChatTab and ParentingChat use 14px system font. User wants:
1. Chat message text → ~18px Garamond font
2. Chat input textarea → larger font, Garamond, max 5 visible lines before scrollbar
3. Sidebar conversation items → Garamond font
4. Button fonts stay unchanged

## Context Summary
- `MindChatTab.tsx` — main chat with sidebar conversation list
- `ParentingChat.tsx` — parenting session chat (no sidebar)
- Both use `text-sm` (14px) on message bubbles, inputs, and sidebar items
- Dark mode `.minds-theme` scoped

## Existing Patterns to Follow
- Inline Tailwind classes + style attributes for overrides
- `.minds-theme` scoping in index.css for dark mode

## Proposed Approach

### 1. Add Garamond font import
Add `@import` for EB Garamond (Google Fonts) in `index.css`, define a CSS variable or class for easy reuse.

### 2. MindChatTab.tsx changes
- Message bubbles: `text-sm` → `text-lg` + `font-family: 'EB Garamond', Garamond, serif`
- User message `<p>` and assistant prose div: apply Garamond + 18px
- Sidebar conversation title: apply Garamond
- Input textarea: Garamond, larger font (~16-17px), maxHeight → 5 lines (~130px)
- Button font stays system default (no change)

### 3. ParentingChat.tsx changes
- Same message bubble font changes
- Same input textarea changes

## Risk Analysis
- **Level 1**: Pure cosmetic — font family + size changes only

## Definition of Done
- [x] Chat messages render in Garamond at ~18px in both chat components
- [x] Chat input uses Garamond at larger size, shows max 5 lines before scroll
- [x] Sidebar conversation titles use Garamond
- [x] Buttons unchanged
- [x] TypeScript clean
