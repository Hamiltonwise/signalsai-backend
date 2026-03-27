# Animate Message Send

## Problem Statement
When user presses Enter to send a message, animate the text becoming a chat bubble in the message area, then animate the input textarea shrinking back to its original single-line height.

## Context Summary
- `MindChatTab.tsx` and `ParentingChat.tsx` both have chat with submit flows
- Framer Motion already imported in both components
- `handleSubmit` clears input via `setInput("")` and adds user message to state
- Textarea height is managed via `onInput` handler (grows as user types)
- User messages rendered as `<div>` containers with inline styles

## Existing Patterns to Follow
- Framer Motion `motion.div` with `initial`/`animate` already used for ThinkingIndicator
- `AnimatePresence` already imported

## Proposed Approach
1. Track the ID of the just-sent message via state (`animatingMsgId`)
2. Render that message's outer `<div>` as `motion.div` with entrance animation (`opacity: 0, y: 20, scale: 0.97` → `opacity: 1, y: 0, scale: 1`)
3. Clear `animatingMsgId` after animation completes via `onAnimationComplete`
4. In `handleSubmit`, after clearing input, animate textarea height back to `44px` using a temporary CSS transition on the element

## Risk Analysis
- **Level 1**: Frontend-only, cosmetic animation, no backend impact

## Definition of Done
- Newly sent user messages animate into the chat area
- Textarea smoothly shrinks back to original height after send
- Historical messages load without animation
- TypeScript clean
- Applied to both MindChatTab and ParentingChat
