# Skill Builder Chat Parity

## Problem Statement
SkillBuilderChat uses light theme, sans font, no streaming, and different bubble styles. Should match parenting/normal chat: dark theme, Literata serif, SSE streaming, ThinkingIndicator, expandable textarea.

## Context Summary
- Parenting/normal chat: dark bg (#262624), Literata serif 18px, #c2c0b6 text, SSE streaming, ThinkingIndicator, expandable textarea, markdown rendering
- Skill builder: white bg, default font 14px, no streaming, simple spinner, single-line input, plain text
- Skill builder backend returns structured JSON: `{ reply, resolvedFields, isComplete }` — can't stream raw text tokens
- Sidebar with resolved fields needs to stay but match dark theme

## Existing Patterns to Follow
- `MindChatTab.tsx` and `ParentingChat.tsx` for styling/streaming patterns
- `CHAT_FONT = "'Literata', Georgia, serif"`
- ThinkingIndicator with animated dots + cycling words
- Bubble styles: user `#141413`, assistant `rgba(255,255,255,0.035)` with `border-white/4`
- Input area: `#1e1e1c` bg, expandable textarea, orange send button

## Proposed Approach

### Backend: Add SSE streaming endpoint
- New controller function `skillBuilderChatStream` — SSE endpoint
- New service function `skillBuilderChatStream` that uses `client.messages.stream()` to collect full response, parses JSON, then sends reply text as streaming `{ text }` events followed by `{ resolvedFields, isComplete, done: true }`
- New route: `POST /:mindId/skill-builder/chat/stream`

### Frontend: Match visual parity
- Dark theme container (#262624), dark input area (#1e1e1c)
- Literata serif font, 18px message text
- Matching bubble styles (user #141413 rounded-br-md, assistant transparent rounded-bl-md)
- ThinkingIndicator (copy from MindChatTab — inline, same component)
- Expandable textarea replacing single-line input
- SSE streaming consumption with streaming text display
- ReactMarkdown for assistant messages
- Sidebar matches dark theme (dark bg, muted text)

## Risk Analysis
Level 1 — UI/UX parity. New streaming endpoint follows exact same pattern as existing ones.

## Definition of Done
- Skill builder visually matches parenting/normal chat
- Responses stream in real-time with ThinkingIndicator
- Resolved fields sidebar uses dark theme
- TypeScript clean
