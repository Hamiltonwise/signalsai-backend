# PM Phase 4: AI Synth Engine

## Why
AI Synth is the signature differentiator — paste raw text (emails, meeting notes, Slack threads) and get structured tasks extracted by Claude. This turns unstructured communication into actionable project work.

## What
- AI Synth API endpoint that calls Claude Sonnet for task extraction
- File upload handling (txt, pdf, docx, eml) with text extraction
- Batch-create endpoint for confirmed tasks
- AISynthPanel slide-over UI with textarea + file drop zone
- ProposedTaskList review interface (edit, toggle, priority cycle)
- Sparkle badge on AI-created tasks throughout the UI
- Loading skeleton during Claude API call
- Error handling for rate limits and malformed responses

**Depends on:** Phase 2 complete (task creation API), Phase 3 complete (UI components wired)

## Context

**Relevant files:**
- `src/agents/service.llm-runner.ts` — existing Claude integration. Uses `@anthropic-ai/sdk`. `runAgent({ systemPrompt, userMessage, model, maxTokens, temperature, prefill })` returns `{ rawText, parsedJson, usage }`.
- `src/agents/service.prompt-loader.ts` — loads `.md` prompts from `src/agents/` directory with caching
- `src/controllers/pm/PmTasksController.ts` — task creation logic from Phase 2
- `frontend/src/components/pm/TaskCard.tsx` — needs sparkle badge for AI-sourced tasks
- `src/utils/` — place for file extraction utility

**Patterns to follow:**
- LLM calls: use existing `runAgent()` from `service.llm-runner.ts`
- Prompt files: `.md` files in `src/agents/pmAgents/`
- File upload: use `multer` (already installed) with memory storage
- Error handling: try/catch with structured error response

## Constraints

**Must:**
- Use existing `runAgent()` service — do NOT create a new Anthropic client
- System prompt per Section 7.4 of the spec (verb-first titles, JSON-only response)
- Proposed tasks are NOT created until user confirms — review step is mandatory
- Batch-create uses a transaction to insert all confirmed tasks atomically
- All AI-created tasks have `source: 'ai_synth'`
- File upload: accept `.txt`, `.pdf`, `.docx`, `.eml` only. Max 10MB per file.
- Rate limit the AI Synth endpoint (5 requests per minute per user)

**Must not:**
- Auto-create tasks without user review
- Store uploaded files permanently — extract text, discard file
- Expose Claude API errors to the frontend (log server-side, return generic error)

**Out of scope:**
- Daily Brief (Phase 5)
- Advanced NLP or multi-model pipelines

## Risk

**Level:** 2

**Risks identified:**
- Claude returns malformed JSON → **Mitigation:** `runAgent()` already has JSON extraction with fallback strategies. Add validation with Zod schema on the response.
- Large documents may exceed token limits → **Mitigation:** truncate input to 50,000 characters with a warning to the user.
- File extraction dependencies (pdf-parse, mammoth for docx) → **Mitigation:** install as needed, fail gracefully if extraction fails.

## Tasks

### T1: Create AI Synth prompt file
**Do:** Create `src/agents/pmAgents/AISynth.md` with the system prompt from Section 7.4:
```
You are a task extraction assistant for a project management tool. Analyze the provided text and extract actionable tasks. For each task, provide: a clear, concise title (verb-first: "Review proposal" not "Proposal review"), a brief description if context is needed, priority (P1 = blocking/urgent, P2 = important/this week, P3 = nice to have), and a deadline hint if mentioned or inferable from context. Respond ONLY with a JSON array. No markdown, no preamble.
```
Expected response schema:
```json
[{ "title": "string", "description": "string | null", "priority": "P1 | P2 | P3", "deadline_hint": "string | null" }]
```
**Files:** `src/agents/pmAgents/AISynth.md`
**Verify:** File exists, loadable via `loadPrompt("pmAgents/AISynth")`

### T2: Build file extraction utility
**Do:** Create `src/utils/pmFileExtract.ts`. Function `extractTextFromFile(buffer: Buffer, mimetype: string, filename: string): Promise<string>`. Handles:
- `.txt` — direct `buffer.toString('utf-8')`
- `.pdf` — use `pdf-parse` package (install it)
- `.docx` — use `mammoth` package (install it) to extract raw text
- `.eml` — parse as plain text (email body extraction, strip headers)
- Truncate output to 50,000 characters with `[truncated]` suffix if exceeded
- Throw descriptive error for unsupported file types
**Files:** `src/utils/pmFileExtract.ts`, install `pdf-parse`, `mammoth`
**Verify:** Unit test: pass a .txt buffer, get text back. Pass a .pdf, get extracted text.

### T3: Build `POST /api/pm/ai-synth` endpoint
**Do:** Controller handler:
1. Accept `{ text }` in body OR file upload via multer (single file, field name `file`)
2. If file: extract text using `pmFileExtract`
3. If text: use directly
4. Validate: text must be non-empty, max 50,000 chars
5. Call `runAgent()` with AISynth prompt as system, user text as message
6. Parse response as JSON array of proposed tasks
7. Validate with Zod: array of `{ title: string, description: string | null, priority: "P1" | "P2" | "P3", deadline_hint: string | null }`
8. Return `{ success: true, data: { proposed_tasks: [...] } }`
9. On error: log, return `{ success: false, error: "Failed to extract tasks. Please try again." }`

Add rate limiting: 5 requests per minute per user (use `express-rate-limit` already installed).
**Files:** `src/controllers/pm/PmAiSynthController.ts`, `src/routes/pm/aiSynth.ts`, `src/validation/pm.schemas.ts` (Zod schemas)
**Verify:** `curl -X POST /api/pm/ai-synth -d '{"text":"Meeting notes: We need to fix the hero section by Friday. Also review the proposal from Dr. Smith. Low priority: update the about page."}' ` returns 3 proposed tasks with priorities

### T4: Build `POST /api/pm/ai-synth/batch-create` endpoint
**Do:** Controller handler:
1. Accept `{ project_id, column_id, tasks: [{ title, description, priority, deadline }] }`
2. Validate project exists, column exists and belongs to project
3. In a Knex transaction: insert all tasks at position 0 (shift existing), all with `source: 'ai_synth'`
4. Log `task_created` activity for each task with `{ source: 'ai_synth' }` in metadata
5. Return created tasks
**Files:** `src/controllers/pm/PmAiSynthController.ts`, `src/routes/pm/aiSynth.ts`
**Verify:** Create 3 tasks via batch-create → all appear in kanban with `source: 'ai_synth'`

### T5: Build AISynthPanel slide-over component
**Do:** Right slide-over panel (like TaskDetailPanel). Opens when clicking the sparkle button in kanban header. Contains:
- Large textarea with placeholder "Paste an email, meeting notes, or any document..."
- Sparkle icon in placeholder
- File drop zone below textarea: dashed border, accepts drag-and-drop or click-to-upload. Shows file name + size after selection. Accepts `.txt, .pdf, .docx, .eml`.
- "Extract Tasks" button (Alloro orange)
- Loading state: skeleton animation (3-4 skeleton task cards pulsing)
- After extraction: switches to ProposedTaskList view
- Close on Escape or backdrop click
**Files:** `frontend/src/components/pm/AISynthPanel.tsx`
**Verify:** Manual: click sparkle → panel opens → paste text → click extract → loading skeleton → proposed tasks appear

### T6: Build ProposedTaskList review interface
**Do:** Renders inside AISynthPanel after extraction completes. Each proposed task card shows:
- Checkbox (include/exclude, default checked)
- Editable title (inline input)
- Priority pill (P1/P2/P3, clickable to cycle)
- Deadline input (pre-populated from `deadline_hint`, editable)
- "Add to" column selector dropdown (default: To Do)
Bottom bar: "Create X Tasks" button (X = count of checked tasks). Clicking fires batch-create API call. On success: close panel, refresh kanban. Framer Motion: task cards stagger-enter.
**Files:** `frontend/src/components/pm/ProposedTaskList.tsx`
**Verify:** Manual: proposed tasks render → toggle checkbox → change priority → edit title → create → tasks appear in kanban

### T7: Add sparkle badge to AI-created tasks
**Do:** In `TaskCard.tsx`: if task `source === 'ai_synth'`, render a small sparkle icon (Lucide `Sparkles`) in the top-right of the card. Subtle, not distracting — `text-alloro-orange opacity-60`. Also show in TaskDetailPanel as a "Created by AI Synth" badge.
**Files:** `frontend/src/components/pm/TaskCard.tsx`, `frontend/src/components/pm/TaskDetailPanel.tsx`
**Verify:** Manual: AI-created tasks show sparkle, manual tasks don't

## Done
- [ ] `npx tsc --noEmit` passes
- [ ] AI Synth extracts tasks from pasted text via Claude
- [ ] File upload works for .txt, .pdf, .docx
- [ ] Proposed tasks show in review interface with editable fields
- [ ] Batch-create inserts all confirmed tasks with source 'ai_synth'
- [ ] Sparkle badge visible on AI-created task cards
- [ ] Rate limiting prevents abuse (5/min)
- [ ] Malformed Claude responses handled gracefully
