# Export Conversation as Markdown

## Problem Statement
User wants a button to export the current chat conversation as a downloadable markdown file, with a tooltip like "Export to continue somewhere else."

## Context Summary
- `MindChatTab.tsx` — main chat with sidebar, messages state already available
- Messages are `MindMessage[]` with `role`, `content`, `created_at`
- CompactionMessages exist as system messages with JSON content

## Existing Patterns to Follow
- Lucide icons for buttons
- Dark theme colors (`#6a6a75`, `#eaeaea`)
- Tooltip via `title` attribute

## Proposed Approach
- Add a `Download` (lucide) icon button in the chat area header (next to the sidebar toggle area, or top-right of the chat panel)
- On click: build markdown from current `messages` array, create a Blob, trigger download
- Markdown format: `# Conversation with {mindName}` + date, then each message as `**You:**` or `**Agent:**` blocks
- Skip compaction system messages or render them as a context note
- File name: `{mindName}-conversation-{date}.md`

## Risk Analysis
- **Level 1**: Pure frontend feature, no backend changes. Read-only export.

## Definition of Done
- Download button visible in chat area
- Tooltip shows export hint
- Clicking downloads a well-formatted markdown file
- TypeScript clean
