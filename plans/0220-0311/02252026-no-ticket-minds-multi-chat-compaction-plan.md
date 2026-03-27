# Minds Multi-Chat Support + Conversation Compaction

## Problem Statement

The Minds chat currently operates as a single ephemeral conversation per page load. There is no way to:
- List past conversations
- Start a new conversation
- Delete a conversation
- Resume a previous conversation after page reload

Additionally, long conversations grow unbounded, sending increasingly large context to the LLM. We need a compaction mechanism that summarizes conversation history when it reaches 50 messages, replacing old messages with a condensed summary while preserving context continuity.

## Context Summary

### What exists
- `minds.mind_conversations` table — bare: `id`, `mind_id`, `created_by_admin_id`, `created_at`. No title, no updated_at.
- `minds.mind_messages` table — `id`, `conversation_id`, `role (user|assistant|system)`, `content`, `created_at`. FK cascades on conversation delete.
- `MindConversationModel` — has `listByMind`, `createConversation`, inherits `findById` + `deleteById` from BaseModel.
- `MindMessageModel` — has `listByConversation`, `getRecentMessages(limit=20)`, `addMessage`.
- Backend routes: `POST /:mindId/chat`, `GET /:mindId/conversations/:conversationId`. No list or delete.
- Frontend `MindChatTab.tsx` — local state only, no persistence, binary bubble rendering (user=orange, else=gray).
- Chat service sends last 20 messages as context to Claude.
- DB CHECK constraint: `role IN ('user', 'assistant', 'system')`.

### Existing patterns to follow
- `BaseModel.deleteById()` for deletion (cascade handles messages)
- Controller pattern: thin async functions delegating to services
- API module pattern: `apiGet/apiPost/apiDelete` returning typed results
- Response envelope: `{ success: true, data: ... }`

## Proposed Approach

### Compaction Design

**Trigger:** When total messages in a conversation reach 50, the next user message triggers compaction before processing the new message.

**Compaction process:**
1. Load all 50 messages
2. Send to Claude with a compaction system prompt asking for a structured summary
3. Delete all 50 messages from the DB
4. Insert a single `system` role message with JSON content:
   ```json
   {
     "type": "compaction",
     "summary": "Human-readable summary of the conversation so far...",
     "message_count": 50,
     "compacted_at": "2026-02-25T..."
   }
   ```
5. Then proceed with the new user message normally

**Why `system` role with JSON:** The `role` CHECK constraint already allows `system`. We parse content as JSON in the frontend to detect compaction messages. If content doesn't parse as JSON with `type: "compaction"`, it renders normally. No migration needed.

**Context window after compaction:** The chat service loads recent messages. After compaction, context = compaction summary + new messages since. The system prompt for chat already includes the knowledge base, so the summary provides conversational continuity.

**Compaction LLM prompt:** Asks for a concise summary of key topics discussed, decisions made, and any unresolved questions. Output is plain text (the `summary` field).

### Conversation Title

Auto-generate a title from the first user message (first 60 chars, truncated at word boundary). Requires adding `title` and `updated_at` columns to `mind_conversations`.

### Multi-Chat UI

Left sidebar panel (collapsible) showing conversation list. "New Chat" button at top. Each conversation shows title + relative timestamp. Click to load. Swipe/button to delete with confirmation.

---

## Phase 1 — Migration: Add columns to `mind_conversations`

**New file:** `signalsai-backend/src/database/migrations/20260225000005_add_conversation_title.ts`

- Add `title TEXT` (nullable, for auto-generated titles)
- Add `updated_at TIMESTAMPTZ DEFAULT NOW()` (for sorting by most recent activity)
- Add `message_count INTEGER NOT NULL DEFAULT 0` (for fast compaction threshold check)

### Why `message_count` on the conversation row
Avoids a `COUNT(*)` query on `mind_messages` every time a message is sent. Incremented in `addMessage`, decremented on compaction (reset to 1 for the compaction message).

## Phase 2 — Backend: Model Updates

**Modify:** `MindConversationModel.ts`
- Add `title`, `updated_at`, `message_count` to `IMindConversation`
- Add `updateTitle(convId, title)` method
- Add `incrementMessageCount(convId)` method
- Add `resetMessageCount(convId, count)` method — sets count after compaction
- Add `touchUpdatedAt(convId)` method
- Update `listByMind` to order by `updated_at DESC` and return only last 50 conversations

**Modify:** `MindMessageModel.ts`
- Add `deleteByConversation(conversationId)` method — deletes all messages for compaction
- Add `countByConversation(conversationId)` method

## Phase 3 — Backend: Compaction Service

**New file:** `signalsai-backend/src/controllers/minds/feature-services/service.minds-compaction.ts`

- `compactConversation(conversationId, mindName)` — the core function:
  1. Load all messages via `MindMessageModel.listByConversation(convId)`
  2. Format them as a transcript
  3. Call Claude (same `MINDS_LLM_MODEL`) with a compaction system prompt
  4. Delete all messages: `MindMessageModel.deleteByConversation(convId)`
  5. Insert a single `system` message with JSON payload `{ type: "compaction", summary, message_count, compacted_at }`
  6. Reset conversation `message_count` to 1
  7. Return the summary

- `shouldCompact(conversationId)` — checks `message_count >= 50` on the conversation row

## Phase 4 — Backend: Chat Service Updates

**Modify:** `service.minds-chat.ts`
- After storing user message, call `MindConversationModel.incrementMessageCount(convId)`
- After storing assistant message, call `MindConversationModel.incrementMessageCount(convId)`
- Before building API messages, check `shouldCompact(convId)`:
  - If true, run compaction first, then load messages normally
- On first message (new conversation), auto-generate title from message content (first 60 chars at word boundary)
- Call `touchUpdatedAt(convId)` after each exchange
- Update `getRecentMessages` usage: load messages after the most recent compaction message (if any), plus include the compaction message itself as context

## Phase 5 — Backend: Controller + Route Updates

**Modify:** `MindsChatController.ts`
- Add `listConversations(req, res)` — returns conversations for a mind
- Add `deleteConversation(req, res)` — deletes a conversation by ID

**Modify:** `signalsai-backend/src/routes/minds.ts`
- Add: `GET /:mindId/conversations` → `chatController.listConversations`
- Add: `DELETE /:mindId/conversations/:conversationId` → `chatController.deleteConversation`

## Phase 6 — Frontend: API Module Updates

**Modify:** `signalsai/src/api/minds.ts`
- Add `MindConversation` interface: `{ id, mind_id, title, message_count, created_at, updated_at }`
- Add `listConversations(mindId): Promise<MindConversation[]>`
- Add `deleteConversation(mindId, conversationId): Promise<boolean>`
- Update `MindMessage` — no type change needed (role stays `system`), but add helper type:
  ```ts
  export interface CompactionMessage {
    type: "compaction";
    summary: string;
    message_count: number;
    compacted_at: string;
  }
  ```

## Phase 7 — Frontend: MindChatTab UI Overhaul

**Modify:** `signalsai/src/components/Admin/minds/MindChatTab.tsx`

Major changes:
1. **Conversation sidebar** — Left panel (240px, collapsible) listing conversations
   - "New Chat" button at top
   - Each item: title (truncated), relative time ("2h ago")
   - Click to select → loads messages via `getConversation`
   - Delete button (trash icon on hover) with confirmation
   - Active conversation highlighted

2. **Conversation loading** — On mount, call `listConversations`. Auto-select most recent. Load its messages.

3. **New Chat** — Clears messages, sets `conversationId = null`. First send creates the conversation.

4. **Compaction message rendering** — For `system` role messages:
   - Parse `content` as JSON
   - If `type === "compaction"`: render a distinct collapsed block:
     - Gray/purple pill: "Conversation context condensed (50 messages)"
     - Click to expand → shows the full summary text
     - Styled differently: dashed border, muted colors, centered
   - If not parseable or not compaction type: render as normal gray bubble

5. **Auto-scroll and focus** — Preserved from current implementation

## Risk Analysis

**Level 1 — Suggestion:** The 50-message threshold is arbitrary. Could make it configurable via env var (`MINDS_COMPACTION_THRESHOLD`). Low risk, easy to change later.

**Level 2 — Concern:** Compaction LLM call adds latency to the user's message when threshold is hit. Mitigation: compaction happens synchronously before the reply, but only every ~50 messages. The user sees a brief delay once. Could be made async in the future but synchronous is simpler and correct for now.

**Level 2 — Concern:** If compaction fails (LLM error), the conversation should not be corrupted. Mitigation: wrap compaction in try/catch — if it fails, skip compaction and proceed normally. Log the error. Retry on next message.

**Level 1 — Suggestion:** Message content stored as plain TEXT. JSON in a TEXT field is fine for compaction messages since they're low-frequency and only parsed on read.

## Failure Mode Analysis

- **Compaction LLM call fails:** Catch error, log it, skip compaction, proceed with normal chat. Message count stays at 50+. Retry next message.
- **Conversation delete race condition:** Cascade delete handles orphan messages. No partial state possible.
- **Concurrent messages during compaction:** Unlikely in admin tool (single user per mind). If it happens, the second message would see mid-compaction state. Mitigation: none needed for admin-only tool.

## Security Considerations

- Conversation deletion requires `superAdminMiddleware` (same as all Minds routes)
- No new auth boundaries introduced
- Compaction LLM call uses same API key as chat — no new secrets

## Performance Considerations

- `message_count` on conversation row avoids COUNT(*) on every message send
- `listConversations` limited to 50 most recent — pagination not needed for admin tool
- Compaction deletes messages in bulk, keeping table size bounded
- Index on `(conversation_id, created_at)` already exists for message queries

## Definition of Done

1. Migration adds `title`, `updated_at`, `message_count` to `mind_conversations`
2. `GET /:mindId/conversations` returns conversation list ordered by `updated_at DESC`
3. `DELETE /:mindId/conversations/:conversationId` deletes conversation + cascaded messages
4. Chat auto-generates title from first user message
5. Message count tracked on conversation row, incremented on each message
6. At 50 messages, compaction triggers: old messages deleted, summary inserted as system message
7. Chat service uses compaction summary + recent messages as LLM context
8. Frontend shows conversation sidebar with list, new chat, delete
9. Frontend loads selected conversation's messages on click
10. Compaction messages render as collapsible summary blocks in the UI
11. TypeScript compiles, Vite builds
