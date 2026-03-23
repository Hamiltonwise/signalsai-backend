# Parenting Reading UX & Session Naming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the frozen "Ready to Learn" spinner with a streaming reading phase (synapse animation + live LLM narration), and add auto-generated session titles with inline rename.

**Architecture:** New SSE endpoint streams narration chunks between extraction and comparison LLM calls. New `ParentingReadingView` component replaces chat panel during reading with a brain-absorbing animation and typewriter text. Session titles are auto-generated on completion via a fire-and-forget LLM call, stored in a new `title` column, and editable inline on session cards.

**Tech Stack:** Anthropic SDK (streaming), Express SSE, React (Framer Motion, Fetch ReadableStream), Knex migrations, PostgreSQL.

---

## Problem Statement

1. "Ready to Learn" runs two sequential LLM calls synchronously in the HTTP request. After long conversations, the user stares at a spinning button with zero feedback for 30-60+ seconds.
2. Parenting sessions have no name/title — the session list shows only status and relative time, making it hard to identify past sessions.

## Context Summary

- Existing SSE pattern: Express sets `text/event-stream` headers, streams `data: {"text": chunk}\n\n` events, frontend consumes via `fetch` + `ReadableStream` reader.
- Existing reading state UI: Simple `BookOpen` icon + spinner + static text (MindParentingTab.tsx:276-292).
- CompileAnimation: Neural network SVG — we need a **different** animation for reading (brain absorbing particles).
- Session model: `MindParentingSessionModel` — no `title` column. Cards show status pill + relative time + result text.
- Extraction: `extractKnowledgeFromTranscript()` in `service.minds-extraction.ts` — sends full transcript, returns markdown or "EMPTY".
- Comparison: `compareContent()` in `service.minds-comparison.ts` — sends extracted knowledge + brain, returns proposals array.
- Personality prompt: Available on `mind.personality_prompt`, used in `buildParentingSystemPrompt()`.

## Existing Patterns to Follow

- SSE format: `data: ${JSON.stringify(payload)}\n\n` with `[DONE]` terminator
- Frontend streaming: `fetch()` → `.body.getReader()` → `TextDecoder` → parse `data:` lines → accumulate text
- API layer: raw `fetch()` for streaming endpoints (see `sendParentingChatStream`), `apiPost`/`apiGet` for JSON endpoints
- Animations: Framer Motion `motion.div` with alloro-orange color palette (`#D66853`)
- Dark theme: `liquid-glass` containers, `text-[#eaeaea]` for primary text, `text-[#6a6a75]` for secondary
- Migrations: Raw SQL in `knex.raw()` inside transactions

## Proposed Approach

See design doc: `docs/plans/2026-02-28-parenting-reading-ux-and-session-naming-design.md`

## Risk Analysis

- **Level 1 — Suggestion:** Narration LLM calls add ~2-3s total to reading time. Acceptable trade-off for dramatically better perceived UX.
- **Level 1 — Suggestion:** Fire-and-forget title generation could silently fail. Mitigated by nullable column + fallback display.
- **Level 2 — Concern:** If extraction or comparison errors mid-stream, SSE must send error event and reset session status. Must handle gracefully.

## Definition of Done

- [x] "Ready to Learn" triggers a streaming SSE endpoint
- [x] Full panel takeover shows brain-absorbing animation + typewriter narration text
- [x] Three narration LLM calls interspersed between extraction and comparison
- [x] Error handling: SSE error events, session status rollback on failure
- [x] Session `title` column added via migration
- [x] Title auto-generated on session completion
- [x] Session cards display title when available
- [x] Inline rename on session cards
- [x] PATCH endpoint for session title updates
- [x] Old non-streaming `trigger-reading` endpoint removed

---

## Task 1: Database Migration — Add `title` Column

**Files:**
- Create: `signalsai-backend/src/database/migrations/[timestamp]_add_parenting_session_title.ts`

**Step 1: Create migration file**

```typescript
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE minds.mind_parenting_sessions
    ADD COLUMN title TEXT
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE minds.mind_parenting_sessions
    DROP COLUMN IF EXISTS title
  `);
}
```

**Step 2: Run migration**

Run: `cd signalsai-backend && npx knex migrate:latest`
Expected: Migration applies successfully.

**Step 3: Commit**

```bash
git add signalsai-backend/src/database/migrations/*_add_parenting_session_title.ts
git commit -m "feat(parenting): add title column to parenting sessions"
```

---

## Task 2: Update Session Model — Title Field & Methods

**Files:**
- Modify: `signalsai-backend/src/models/MindParentingSessionModel.ts`

**Step 1: Add `title` to interface**

Add `title: string | null;` to the `IMindParentingSession` interface, after `result`.

**Step 2: Add `updateTitle` method**

```typescript
static async updateTitle(
  sessionId: string,
  title: string,
  trx?: QueryContext
): Promise<number> {
  return this.table(trx)
    .where({ id: sessionId })
    .update({ title, updated_at: new Date() });
}
```

**Step 3: Commit**

```bash
git add signalsai-backend/src/models/MindParentingSessionModel.ts
git commit -m "feat(parenting): add title field and updateTitle method to session model"
```

---

## Task 3: Backend — Title Generation Service Function

**Files:**
- Modify: `signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting-chat.ts`

**Step 1: Add `generateSessionTitle` function**

Add at the bottom of the file:

```typescript
/**
 * Generate a short title for a parenting session based on what was discussed.
 * Fire-and-forget — caller should not await this in the critical path.
 */
export async function generateSessionTitle(
  sessionId: string,
  knowledgeBuffer: string
): Promise<void> {
  if (!knowledgeBuffer || knowledgeBuffer.trim().length < 20) return;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 30,
      system: "Generate a 3-5 word title summarizing what was taught in this session. Output ONLY the title, nothing else. No quotes, no punctuation at the end.",
      messages: [
        {
          role: "user",
          content: `Session notes:\n${knowledgeBuffer.slice(0, 2000)}`,
        },
      ],
    });

    const title =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : null;

    if (title && title.length > 0 && title.length < 100) {
      await MindParentingSessionModel.updateTitle(sessionId, title);
    }
  } catch (err) {
    console.error("[MINDS] Failed to generate session title:", err);
    // Non-critical — swallow the error
  }
}
```

Add the import at the top: `import { MindParentingSessionModel } from "../../../models/MindParentingSessionModel";`

(Check if this import already exists — if not, add it.)

**Step 2: Commit**

```bash
git add signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting-chat.ts
git commit -m "feat(parenting): add generateSessionTitle function"
```

---

## Task 4: Backend — Fire Title Generation on Session Completion

**Files:**
- Modify: `signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting.ts`

**Step 1: Import `generateSessionTitle`**

Add to the import from `./service.minds-parenting-chat`:

```typescript
import { generateGreeting, generateSessionTitle } from "./service.minds-parenting-chat";
```

**Step 2: Call title generation in `completeSession`**

In the `completeSession` function (line 228-238), after setting result to "learned", fire-and-forget:

```typescript
export async function completeSession(
  sessionId: string
): Promise<void> {
  const session = await MindParentingSessionModel.findById(sessionId);

  await MindParentingSessionModel.updateStatus(sessionId, "completed");
  await MindParentingSessionModel.setResult(sessionId, "learned");

  await MindParentingMessageModel.createMessage(
    sessionId,
    "assistant",
    "All done! My brain just got an upgrade. Thanks for the lesson — I'll put it to good use. Now if you'll excuse me, I have some neurons to reorganize. Session complete! 🧠✨"
  );

  // Fire-and-forget title generation
  if (session?.knowledge_buffer) {
    generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
  }
}
```

**Step 3: Commit**

```bash
git add signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting.ts
git commit -m "feat(parenting): fire-and-forget title generation on session completion"
```

---

## Task 5: Backend — Add Narration Streaming Function

**Files:**
- Modify: `signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting-chat.ts`

**Step 1: Add `streamNarration` function**

Add this function below the existing functions:

```typescript
/**
 * Stream a short in-character narration from the mind.
 * Used during the reading phase to give the user live feedback.
 */
export async function streamNarration(
  mindName: string,
  personalityPrompt: string,
  instruction: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const client = getClient();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 150,
    system: `You are ${mindName}. ${personalityPrompt}\n\nYou are in the middle of a learning session with your parent. Narrate your thoughts briefly — 1-2 short sentences max. Stay in character. Be warm and playful.`,
    messages: [
      {
        role: "user",
        content: instruction,
      },
    ],
  });

  let fullText = "";

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
      onChunk(event.delta.text);
    }
  }

  return fullText;
}
```

**Step 2: Commit**

```bash
git add signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting-chat.ts
git commit -m "feat(parenting): add streamNarration function for reading phase"
```

---

## Task 6: Backend — Streaming `triggerReading` Service Function

**Files:**
- Modify: `signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting.ts`

**Step 1: Import `streamNarration`**

Update import:

```typescript
import { generateGreeting, generateSessionTitle, streamNarration } from "./service.minds-parenting-chat";
```

**Step 2: Add `triggerReadingStream` function**

Add below the existing `triggerReading` function:

```typescript
/**
 * Streaming version of triggerReading.
 * Sends SSE events: narration chunks, phase transitions, and completion.
 */
export async function triggerReadingStream(
  mindId: string,
  sessionId: string,
  onEvent: (event: { type: string; [key: string]: any }) => void
): Promise<void> {
  const session = await MindParentingSessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "chatting") {
    throw new Error("Session must be in chatting state to trigger reading");
  }

  await MindParentingSessionModel.updateStatus(sessionId, "reading");

  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  // Load current brain
  let currentBrain = "";
  if (mind.published_version_id) {
    const version = await MindVersionModel.findById(mind.published_version_id);
    if (version) currentBrain = version.brain_markdown;
  }

  const messages = await MindParentingMessageModel.listBySession(sessionId);

  // --- Narration 1: About to read ---
  await streamNarration(
    mind.name,
    mind.personality_prompt,
    "You're about to read through a conversation you just had with your parent to extract what they taught you. Narrate what you're about to do.",
    (chunk) => onEvent({ type: "narration", text: chunk })
  );

  onEvent({ type: "phase", phase: "extracting" });

  // --- Extraction ---
  const extractedKnowledge = await extractKnowledgeFromTranscript(
    messages.map((m) => ({ role: m.role, content: m.content })),
    session.knowledge_buffer,
    { source: "parenting" }
  );

  if (extractedKnowledge === "EMPTY" || !extractedKnowledge.trim()) {
    await MindParentingSessionModel.updateStatus(sessionId, "completed");
    await MindParentingSessionModel.setResult(sessionId, "no_changes");
    await MindParentingMessageModel.createMessage(
      sessionId,
      "assistant",
      "I went through everything we discussed, and it looks like I already know all of this! Nothing new to add. Session complete — back to my room! 🎮"
    );

    // Fire-and-forget title generation even for no_changes
    if (session.knowledge_buffer) {
      generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
    }

    onEvent({ type: "complete", proposalCount: 0, runId: "" });
    return;
  }

  // --- Narration 2: Found stuff, comparing ---
  await streamNarration(
    mind.name,
    mind.personality_prompt,
    "You just finished reading through the conversation and found some new things. Now you're about to compare them against what you already know. Narrate briefly.",
    (chunk) => onEvent({ type: "narration", text: chunk })
  );

  onEvent({ type: "phase", phase: "comparing" });

  // --- Comparison ---
  const proposals = await compareContent(mindId, currentBrain, extractedKnowledge, { source: "parenting" });

  if (proposals.length === 0) {
    await MindParentingSessionModel.updateStatus(sessionId, "completed");
    await MindParentingSessionModel.setResult(sessionId, "no_changes");
    await MindParentingMessageModel.createMessage(
      sessionId,
      "assistant",
      "I studied everything you shared, but my brain already has all of this covered. No updates needed! Session complete. ✌️"
    );

    if (session.knowledge_buffer) {
      generateSessionTitle(sessionId, session.knowledge_buffer).catch(() => {});
    }

    onEvent({ type: "complete", proposalCount: 0, runId: "" });
    return;
  }

  // --- Narration 3: Done, found proposals ---
  await streamNarration(
    mind.name,
    mind.personality_prompt,
    `You finished comparing and found ${proposals.length} thing${proposals.length === 1 ? "" : "s"} worth updating in your brain. Narrate what you found — keep it to one sentence.`,
    (chunk) => onEvent({ type: "narration", text: chunk })
  );

  // --- Store proposals ---
  const run = await MindSyncRunModel.createRun(mindId, "scrape_compare");
  await MindSyncRunModel.markRunning(run.id);

  for (const p of proposals) {
    await MindSyncProposalModel.create({
      sync_run_id: run.id,
      mind_id: mindId,
      type: p.type,
      summary: p.summary,
      target_excerpt: p.target_excerpt || null,
      proposed_text: p.proposed_text,
      reason: p.reason,
      status: "pending",
    });
  }

  await MindSyncRunModel.markCompleted(run.id);
  await MindParentingSessionModel.setSyncRunId(sessionId, run.id);
  await MindParentingSessionModel.updateStatus(sessionId, "proposals");

  await MindParentingMessageModel.createMessage(
    sessionId,
    "assistant",
    `I've finished reading! Found ${proposals.length} thing${proposals.length === 1 ? "" : "s"} to review. Take a look at what I picked up — approve or reject each one, then hit Submit.`
  );

  onEvent({ type: "complete", proposalCount: proposals.length, runId: run.id });
}
```

**Step 3: Commit**

```bash
git add signalsai-backend/src/controllers/minds/feature-services/service.minds-parenting.ts
git commit -m "feat(parenting): add triggerReadingStream with narration interspersed"
```

---

## Task 7: Backend — SSE Controller Endpoint & Route

**Files:**
- Modify: `signalsai-backend/src/controllers/minds/MindsParentingController.ts`
- Modify: `signalsai-backend/src/routes/minds.ts`

**Step 1: Add `triggerReadingStream` controller handler**

Add in `MindsParentingController.ts` after the existing `triggerReading` function:

```typescript
export async function triggerReadingStream(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, sessionId } = req.params;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    await parentingService.triggerReadingStream(
      mindId,
      sessionId,
      (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("[MINDS] Error in reading stream:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || "Reading failed" });
    }
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
}
```

**Step 2: Add `updateSession` controller handler for title rename**

```typescript
export async function updateSession(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;

    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "Title is required" });
    }

    if (title.length > 100) {
      return res.status(400).json({ error: "Title must be under 100 characters" });
    }

    await MindParentingSessionModel.updateTitle(sessionId, title.trim());
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[MINDS] Error updating session:", error);
    return res.status(500).json({ error: "Failed to update session" });
  }
}
```

**Step 3: Add routes in `minds.ts`**

Add after the existing `trigger-reading` route (line 87):

```typescript
mindsRoutes.post("/:mindId/parenting/sessions/:sessionId/trigger-reading/stream", parentingController.triggerReadingStream);
mindsRoutes.patch("/:mindId/parenting/sessions/:sessionId", parentingController.updateSession);
```

**Step 4: Commit**

```bash
git add signalsai-backend/src/controllers/minds/MindsParentingController.ts signalsai-backend/src/routes/minds.ts
git commit -m "feat(parenting): add SSE reading stream endpoint and session update endpoint"
```

---

## Task 8: Frontend — API Functions for New Endpoints

**Files:**
- Modify: `signalsai/src/api/minds.ts`

**Step 1: Add `triggerParentingReadingStream` function**

Add after the existing `triggerParentingReading` function (around line 855):

```typescript
export async function triggerParentingReadingStream(
  mindId: string,
  sessionId: string
): Promise<Response> {
  const api = (import.meta as any)?.env?.VITE_API_URL ?? "/api";

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;
  if (isPilot) {
    jwt = window.sessionStorage.getItem("token");
  } else {
    jwt = localStorage.getItem("auth_token") || localStorage.getItem("token");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  return fetch(
    `${api}/admin/minds/${mindId}/parenting/sessions/${sessionId}/trigger-reading/stream`,
    {
      method: "POST",
      headers,
    }
  );
}
```

**Step 2: Add `updateParentingSession` function**

```typescript
export async function updateParentingSession(
  mindId: string,
  sessionId: string,
  data: { title: string }
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}`,
    passedData: data,
  });
  return res.success;
}
```

**Step 3: Add `title` to `ParentingSession` interface**

In the `ParentingSession` interface (line 757), add:

```typescript
title: string | null;
```

**Step 4: Commit**

```bash
git add signalsai/src/api/minds.ts
git commit -m "feat(parenting): add frontend API functions for reading stream and session update"
```

---

## Task 9: Frontend — Reading Animation Component

**Files:**
- Create: `signalsai/src/components/Admin/minds/parenting/ReadingAnimation.tsx`

**Step 1: Create the brain-absorbing animation**

Create a new SVG-based animation component that shows an abstract brain with particles flowing into it. Use Framer Motion for animations and alloro-orange color palette.

```typescript
import { motion } from "framer-motion";

/**
 * Brain-absorbing animation for the reading phase.
 * Abstract brain shape with particles flowing inward.
 * Distinct from CompileAnimation (neural network).
 */
export function ReadingAnimation() {
  // 8 particles that float inward toward center
  const particles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const radius = 80;
    return {
      id: i,
      startX: 100 + Math.cos(angle) * radius,
      startY: 80 + Math.sin(angle) * radius,
      endX: 100,
      endY: 80,
    };
  });

  return (
    <div className="flex flex-col items-center justify-center">
      <svg
        width="200"
        height="160"
        viewBox="0 0 200 160"
        className="overflow-visible"
      >
        <defs>
          <filter id="reading-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="brain-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#D66853" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#D66853" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Center brain glow */}
        <motion.circle
          cx={100}
          cy={80}
          r={30}
          fill="url(#brain-gradient)"
          animate={{
            r: [28, 34, 28],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Brain icon - simple abstract shape */}
        <motion.circle
          cx={100}
          cy={80}
          r={16}
          fill="none"
          stroke="#D66853"
          strokeWidth={1.5}
          opacity={0.6}
          filter="url(#reading-glow)"
          animate={{
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Particles flowing inward */}
        {particles.map((p) => (
          <motion.circle
            key={p.id}
            cx={p.startX}
            cy={p.startY}
            r={3}
            fill="#D66853"
            filter="url(#reading-glow)"
            animate={{
              cx: [p.startX, p.endX],
              cy: [p.startY, p.endY],
              r: [3, 0],
              opacity: [0.8, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: p.id * 0.3,
              ease: "easeIn",
            }}
          />
        ))}

        {/* Concentric ripples at center */}
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={`ripple-${i}`}
            cx={100}
            cy={80}
            r={16}
            fill="none"
            stroke="#D66853"
            strokeWidth={0.5}
            animate={{
              r: [16, 45],
              opacity: [0.4, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 1,
              ease: "easeOut",
            }}
          />
        ))}
      </svg>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add signalsai/src/components/Admin/minds/parenting/ReadingAnimation.tsx
git commit -m "feat(parenting): add brain-absorbing ReadingAnimation component"
```

---

## Task 10: Frontend — `ParentingReadingView` Component

**Files:**
- Create: `signalsai/src/components/Admin/minds/parenting/ParentingReadingView.tsx`

**Step 1: Create the reading view component**

```typescript
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReadingAnimation } from "./ReadingAnimation";
import { triggerParentingReadingStream } from "../../../../api/minds";

interface ParentingReadingViewProps {
  mindId: string;
  mindName: string;
  sessionId: string;
  onComplete: (proposalCount: number) => void;
  onError: (error: string) => void;
}

export function ParentingReadingView({
  mindId,
  mindName,
  sessionId,
  onComplete,
  onError,
}: ParentingReadingViewProps) {
  const [narrationText, setNarrationText] = useState("");
  const [phase, setPhase] = useState<string>("starting");
  const [narrationKey, setNarrationKey] = useState(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let cancelled = false;

    async function runStream() {
      try {
        const response = await triggerParentingReadingStream(mindId, sessionId);

        if (!response.ok) {
          const errText = await response.text();
          onError(errText || "Stream request failed");
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentNarration = "";

        while (true) {
          if (cancelled) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "error") {
                onError(parsed.error || "Reading failed");
                return;
              }

              if (parsed.type === "narration") {
                currentNarration += parsed.text;
                setNarrationText(currentNarration);
              }

              if (parsed.type === "phase") {
                // New phase — reset narration for next batch
                currentNarration = "";
                setNarrationText("");
                setNarrationKey((k) => k + 1);
                setPhase(parsed.phase);
              }

              if (parsed.type === "complete") {
                // Brief pause before transitioning
                await new Promise((r) => setTimeout(r, 1500));
                onComplete(parsed.proposalCount);
                return;
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          onError(err.message || "Reading failed");
        }
      }
    }

    runStream();

    return () => {
      cancelled = true;
    };
  }, [mindId, sessionId, onComplete, onError]);

  return (
    <div className="liquid-glass rounded-xl p-8">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ReadingAnimation />

        <h3 className="text-base font-semibold text-[#eaeaea] mt-6 mb-2">
          {mindName} is reading...
        </h3>

        {/* Narration text — typewriter style */}
        <div className="max-w-md min-h-[3rem] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={narrationKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              {narrationText ? (
                <p
                  className="text-sm text-[#6a6a75] italic"
                  style={{ fontFamily: "'Literata', serif" }}
                >
                  "{narrationText}"
                  <span className="inline-block w-1.5 h-3.5 bg-alloro-orange/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                </p>
              ) : (
                <p className="text-sm text-[#6a6a75]">
                  {phase === "extracting"
                    ? "Extracting knowledge..."
                    : phase === "comparing"
                      ? "Comparing against existing brain..."
                      : "Getting ready..."}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add signalsai/src/components/Admin/minds/parenting/ParentingReadingView.tsx
git commit -m "feat(parenting): add ParentingReadingView with streaming narration"
```

---

## Task 11: Frontend — Wire Reading View into MindParentingTab

**Files:**
- Modify: `signalsai/src/components/Admin/minds/MindParentingTab.tsx`
- Modify: `signalsai/src/components/Admin/minds/parenting/ParentingChat.tsx`

**Step 1: Update imports in MindParentingTab.tsx**

Add import:

```typescript
import { ParentingReadingView } from "./parenting/ParentingReadingView";
```

Add to API imports:

```typescript
import {
  // ... existing imports ...
  updateParentingSession,
} from "../../../api/minds";
```

**Step 2: Replace the reading state UI**

Replace the existing reading state block (lines 276-292):

```typescript
{/* Reading state */}
{showReading && (
  <div className="liquid-glass rounded-xl p-8">
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <BookOpen className="h-10 w-10 text-alloro-orange mb-4 animate-pulse" />
      ...
    </div>
  </div>
)}
```

With:

```typescript
{/* Reading state — streaming narration view */}
{showReading && (
  <ParentingReadingView
    mindId={mindId}
    mindName={mindName}
    sessionId={activeSession.id}
    onComplete={async (proposalCount) => {
      if (proposalCount === 0) {
        toast.success("No new knowledge found — session complete!");
      }
      const details = await getParentingSession(mindId, activeSession.id);
      if (details) {
        setActiveSession(details.session);
        setMessages(details.messages);
        setProposals(details.proposals || []);
      }
    }}
    onError={(error) => {
      toast.error(error || "Reading failed");
      // Re-fetch to get actual session state
      getParentingSession(mindId, activeSession.id).then((details) => {
        if (details) {
          setActiveSession(details.session);
          setMessages(details.messages);
        }
      });
    }}
  />
)}
```

**Step 3: Update ParentingChat.tsx — change button to trigger streaming**

In `ParentingChat.tsx`, update `handleTriggerReading` to:
1. Set `triggeringReading` to true
2. Call `onTriggerReading()` which will transition session status to `reading`
3. The parent component (`MindParentingTab`) handles the reading view switch

Replace the `handleTriggerReading` function (lines 251-265):

```typescript
const handleTriggerReading = () => {
  // Signal to parent to switch to reading view
  // The parent will handle the streaming SSE call
  onTriggerReading(0);
};
```

Update the `onTriggerReading` prop type and the parent's handler:

In `ParentingChat.tsx`, change the prop type:
```typescript
onTriggerReading: () => void;
```

In `MindParentingTab.tsx`, update the chat's `onTriggerReading` handler (lines 260-271):

```typescript
onTriggerReading={() => {
  // Optimistically switch to reading state — the reading view
  // component will handle the SSE stream
  setActiveSession({ ...activeSession, status: "reading" });
}}
```

**Step 4: Commit**

```bash
git add signalsai/src/components/Admin/minds/MindParentingTab.tsx signalsai/src/components/Admin/minds/parenting/ParentingChat.tsx
git commit -m "feat(parenting): wire ParentingReadingView into session flow"
```

---

## Task 12: Frontend — Session Cards with Title & Inline Rename

**Files:**
- Modify: `signalsai/src/components/Admin/minds/MindParentingTab.tsx`

**Step 1: Add inline rename state**

In the `MindParentingTab` component, add state:

```typescript
const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
const [editingTitleValue, setEditingTitleValue] = useState("");
```

**Step 2: Add title save handler**

```typescript
const handleSaveTitle = async (sessionId: string) => {
  if (!editingTitleValue.trim()) {
    setEditingTitleId(null);
    return;
  }
  const ok = await updateParentingSession(mindId, sessionId, {
    title: editingTitleValue.trim(),
  });
  if (ok) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, title: editingTitleValue.trim() } : s
      )
    );
  }
  setEditingTitleId(null);
};
```

**Step 3: Update session card rendering**

In the sessions grid (inside `sessions.map`), add the title display between the status pill row and the info row. Replace the content inside the `motion.div` session card (lines 380-414):

```typescript
<motion.div
  key={session.id}
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0 }}
  className="group liquid-glass rounded-xl p-4 cursor-pointer hover:border-alloro-orange/30 transition-colors border border-transparent"
  onClick={() => handleOpenSession(session.id)}
>
  <div className="flex items-start justify-between mb-2">
    <DarkPill
      label={STATUS_LABELS[session.status]}
      status={session.status}
    />
    <span className="text-[10px] text-[#6a6a75]">
      {timeAgo(session.created_at)}
    </span>
  </div>

  {/* Title — editable inline */}
  <div className="mb-2 min-h-[1.5rem]">
    {editingTitleId === session.id ? (
      <input
        type="text"
        value={editingTitleValue}
        onChange={(e) => setEditingTitleValue(e.target.value)}
        onBlur={() => handleSaveTitle(session.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSaveTitle(session.id);
          if (e.key === "Escape") setEditingTitleId(null);
        }}
        onClick={(e) => e.stopPropagation()}
        autoFocus
        maxLength={100}
        className="w-full bg-transparent border-b border-alloro-orange/40 text-sm font-medium text-[#eaeaea] outline-none placeholder:text-[#6a6a75]"
        placeholder="Name this session..."
      />
    ) : (
      <p
        className="text-sm font-medium text-[#eaeaea] truncate hover:text-alloro-orange/80 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setEditingTitleId(session.id);
          setEditingTitleValue(session.title || "");
        }}
        title={session.title || "Click to name this session"}
      >
        {session.title || (
          <span className="text-[#6a6a75] italic text-xs">Untitled session</span>
        )}
      </p>
    )}
  </div>

  <div className="flex items-center gap-2 text-xs text-[#6a6a75]">
    <Clock className="h-3 w-3" />
    <span>
      {session.result === "learned"
        ? "Knowledge learned"
        : session.result === "no_changes"
          ? "No new knowledge"
          : session.result === "all_rejected"
            ? "All proposals rejected"
            : session.status === "abandoned"
              ? "Session abandoned"
              : "In progress"}
    </span>
  </div>

  <div className="mt-3 flex items-center justify-between">
    <button
      onClick={(e) => handleDeleteSession(session.id, e)}
      className="rounded-lg p-1.5 text-[#6a6a75] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
      title="Delete session"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
    <ChevronRight className="h-4 w-4 text-[#6a6a75]" />
  </div>
</motion.div>
```

**Step 4: Commit**

```bash
git add signalsai/src/components/Admin/minds/MindParentingTab.tsx
git commit -m "feat(parenting): add session title display and inline rename on cards"
```

---

## Task 13: Cleanup — Remove Old Non-Streaming Reading Endpoint

**Files:**
- Modify: `signalsai-backend/src/routes/minds.ts`
- Modify: `signalsai/src/api/minds.ts`

**Step 1: Remove old route**

In `minds.ts`, remove the line:
```typescript
mindsRoutes.post("/:mindId/parenting/sessions/:sessionId/trigger-reading", parentingController.triggerReading);
```

**Step 2: Remove old API function**

In `signalsai/src/api/minds.ts`, remove the `triggerParentingReading` function (lines 847-855).

**Step 3: Remove old controller handler**

In `MindsParentingController.ts`, remove the `triggerReading` function (lines 91-100). Keep the service function `triggerReading` in `service.minds-parenting.ts` for now — it can serve as a fallback or be removed later.

**Step 4: Commit**

```bash
git add signalsai-backend/src/routes/minds.ts signalsai/src/api/minds.ts signalsai-backend/src/controllers/minds/MindsParentingController.ts
git commit -m "chore(parenting): remove old non-streaming trigger-reading endpoint"
```

---

## Task 14: Manual Testing & Verification

**Step 1: Run backend**

```bash
cd signalsai-backend && npm run dev
```

**Step 2: Run frontend**

```bash
cd signalsai && npm run dev
```

**Step 3: Test reading flow**

1. Open a mind's parenting tab
2. Start a new session
3. Send 2+ messages teaching the agent something
4. Click "Ready to Learn"
5. Verify: panel switches to reading animation with streaming narration text
6. Verify: narration text changes between phases (extracting → comparing → done)
7. Verify: transitions to proposals view after completion
8. Verify: error case — if something fails, toast shows and session state is recoverable

**Step 4: Test session naming**

1. Complete a full parenting session (approve proposals → compile)
2. Return to session list
3. Verify: completed session shows auto-generated title
4. Click the title → verify inline edit works
5. Type new title, press Enter → verify it saves
6. Press Escape → verify it cancels
7. Verify: sessions without titles show "Untitled session"

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(parenting): streaming reading phase with narration + session naming"
```
