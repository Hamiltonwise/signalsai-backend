# Parenting Reading UX & Session Naming — Design Doc

**Date:** 2026-02-28
**Status:** Approved

## Problem

1. "Ready to Learn" runs two sequential LLM calls synchronously in the HTTP request. After long conversations, the user stares at a spinning button with zero feedback for 30-60+ seconds.
2. Parenting sessions have no name/title — the session list shows only status and relative time, making it hard to identify past sessions.

## Decisions

### Feature 1: Reading Phase UX

**Approach:** Streaming SSE endpoint with LLM narration + full panel takeover with distinct animation.

**Backend — New SSE endpoint:**
`POST /:mindId/parenting/sessions/:sessionId/trigger-reading/stream`

Event format (extends existing SSE pattern):
```
data: {"type": "narration", "text": "chunk"}\n\n
data: {"type": "phase", "phase": "extracting"}\n\n
data: {"type": "complete", "proposalCount": 3, "runId": "uuid"}\n\n
data: [DONE]\n\n
```

Flow inside the handler:
1. Set session status to `reading`, flush SSE headers
2. **Narration 1** — small LLM call: system prompt tells the mind to narrate what it's about to do (1-2 sentences, in character, personality prompt included). Stream chunks as `type: narration`.
3. Send `{"type": "phase", "phase": "extracting"}`
4. Run `extractKnowledgeFromTranscript()` (unchanged)
5. **Narration 2** — small LLM call: mind reacts to what was extracted (1-2 sentences). Stream chunks.
6. Send `{"type": "phase", "phase": "comparing"}`
7. Run `compareContent()` (unchanged)
8. **Narration 3** — small LLM call: mind narrates what it found (1 sentence). Stream chunks.
9. Store proposals, update session status to `proposals`
10. Send `{"type": "complete", "proposalCount": N, "runId": "..."}`

Narration calls: same model (claude-sonnet-4-6), `max_tokens: 150`, uses mind's personality_prompt.

**Frontend — New component: `ParentingReadingView`**

Full panel takeover replacing chat view when session enters `reading` status.

Layout:
- Center: Brain absorbing animation (abstract brain with particles flowing in, alloro-orange palette, distinct from CompileAnimation's neural network)
- Below: Typewriter-streamed narration text with pulsing cursor
- On `type: phase` events: subtle animation state shift
- Between narrations: text stays, animation keeps playing, cursor pulses
- On `type: complete`: brief pause, transition to proposals view
- When new narration starts: previous text fades, new text streams in

Streaming consumption: same Fetch + ReadableStream pattern as existing chat.

### Feature 2: Session Naming

**Database:**
- Add nullable `title` text column to `mind_parenting_sessions`
- Migration file

**Auto-generation:**
- Trigger: when session transitions to `completed` (inside `completeSession()`)
- Fire-and-forget LLM call: takes knowledge_buffer, returns 3-5 word title
- Model: claude-sonnet-4-6, `max_tokens: 30`
- Stores result in `title` column
- Async — does not block completion flow

**Session card update:**
- Title exists → show as primary bold text, status pill + time below
- No title → fall back to current behavior (status + time)

**Inline rename:**
- Click title on card → editable inline input
- Blur or Enter saves
- New endpoint: `PATCH /:mindId/parenting/sessions/:sessionId` with `{ title: "..." }`

## Files Affected

**Backend:**
- `src/routes/minds.ts` — new SSE route, new PATCH route
- `src/controllers/minds/MindsParentingController.ts` — new `triggerReadingStream` handler, new `updateSession` handler
- `src/controllers/minds/feature-services/service.minds-parenting.ts` — refactor `triggerReading` into streaming version with narration calls
- `src/controllers/minds/feature-services/service.minds-parenting-chat.ts` — add narration prompt builder
- `src/models/MindParentingSessionModel.ts` — add `title` field, `updateTitle` method
- New migration for `title` column

**Frontend:**
- `src/components/Admin/minds/parenting/ParentingReadingView.tsx` — new component (animation + streaming text)
- `src/components/Admin/minds/parenting/ReadingAnimation.tsx` — new component (brain absorbing SVG/CSS)
- `src/components/Admin/minds/parenting/ParentingChat.tsx` — update button handler to use SSE endpoint
- `src/components/Admin/minds/MindParentingTab.tsx` — add reading view state, update session cards with title, add inline rename
- `src/api/minds.ts` — new `triggerParentingReadingStream()` function, new `updateParentingSession()` function
