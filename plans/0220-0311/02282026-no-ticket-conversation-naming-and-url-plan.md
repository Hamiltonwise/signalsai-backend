# Conversation Naming & URL Deep-Linking

## Problem Statement
Add ability to name/rename conversations, edit conversation names inline in the sidebar, and persist the active conversation ID in the URL so conversations are linkable.

## Context Summary
- `MindConversationModel.updateTitle()` already exists in the backend model
- No PATCH route or controller handler for renaming yet
- `apiPatch` helper already exists in the frontend API layer
- URL currently only uses `?tab=chat` — no conversation ID
- Sidebar shows `conv.title || "New conversation"` but titles are not editable

## Existing Patterns to Follow
- PATCH routes used elsewhere (e.g., `/:mindId/sources/:sourceId`)
- `useSearchParams` in MindDetail for tab navigation
- Inline editing patterns: double-click to edit, Enter/Escape to save/cancel

## Proposed Approach
1. **Backend**: Add `renameConversation` handler in `MindsChatController.ts`, add PATCH route in `minds.ts`
2. **Frontend API**: Add `renameConversation(mindId, conversationId, title)` in `minds.ts`
3. **Frontend MindChatTab**:
   - Make sidebar conversation titles editable (double-click to edit, Enter to save, Escape to cancel)
   - Add `conv` search param to URL: `?tab=chat&conv=<id>`
   - On load, read `conv` param and auto-select that conversation
   - When selecting a conversation, update URL param
   - When creating new conversation (from stream response), update URL param

## Risk Analysis
- **Level 1**: Thin PATCH endpoint using existing model method, frontend-only UX changes

## Definition of Done
- Conversations can be renamed via double-click in sidebar
- Active conversation ID appears in URL as `?tab=chat&conv=<id>`
- Loading a URL with `?conv=<id>` auto-selects that conversation
- TypeScript clean
