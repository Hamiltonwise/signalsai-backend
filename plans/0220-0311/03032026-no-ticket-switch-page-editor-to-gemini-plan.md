# Switch Page Editor LLM to Gemini 2.5 Flash

## Problem Statement
The page editor service currently uses Anthropic Claude Haiku 4.5 via the `@anthropic-ai/sdk`. The user wants to switch to Google Gemini 2.5 Flash using the `@google/genai` SDK and `GEMINI_API_KEY` environment variable.

## Context Summary
- Single file owns all LLM calls: `signalsai-backend/src/utils/website-utils/pageEditorService.ts`
- Prompt file (`pageEditorPrompt.ts`) is SDK-agnostic — fetches from DB, returns a string. No changes needed.
- The Anthropic SDK is still used elsewhere (Minds chat), so `@anthropic-ai/sdk` stays in `package.json`.
- System prompts are stored in DB (`admin_settings` table) — no code changes needed for prompts.

## Existing Patterns to Follow
- Lazy singleton client initialization pattern (already in place)
- Same error handling and JSON/HTML parsing logic
- Same `EditRequest` / `EditResponse` interfaces

## Proposed Approach

### 1. Install `@google/genai` SDK
```
npm install @google/genai
```

### 2. Rewrite `pageEditorService.ts`
Key mappings:
| Anthropic | Gemini |
|---|---|
| `@anthropic-ai/sdk` | `@google/genai` |
| `ANTHROPIC_API_KEY` | `GEMINI_API_KEY` |
| `claude-haiku-4-5-20251001` | `gemini-2.5-flash` |
| `role: "assistant"` | `role: "model"` |
| `system: prompt` | `config.systemInstruction: prompt` |
| `max_tokens: 4096` | `config.maxOutputTokens: 4096` |
| `response.content[0].text` | `response.text` |
| `response.usage.input_tokens` | `response.usageMetadata.promptTokenCount` |
| `response.usage.output_tokens` | `response.usageMetadata.candidatesTokenCount` |

### 3. No changes to
- `pageEditorPrompt.ts` (SDK-agnostic)
- Controllers (they call `editHtmlComponent` with same interface)
- Frontend (no model awareness)

## Risk Analysis
- **Level 1 — Low risk.** Single file swap, same interface contract.
- Prompt behavior may differ slightly between models — but prompts are DB-configurable so tuning is easy.
- No breaking API changes for consumers of `editHtmlComponent`.

## Definition of Done
- `@google/genai` installed
- `pageEditorService.ts` uses Gemini 2.5 Flash via `GEMINI_API_KEY`
- All existing interfaces (`EditRequest`, `EditResponse`, `EditDebugInfo`) preserved
- Token usage tracking updated to Gemini field names
- No other files modified
