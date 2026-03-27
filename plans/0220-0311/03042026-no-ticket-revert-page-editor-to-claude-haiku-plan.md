# Revert Page Editor LLM to Claude Haiku

## Problem Statement
The page editor service currently uses Google Gemini 2.5 Flash via `@google/genai`. Reverting back to Anthropic Claude Haiku 4.5 via `@anthropic-ai/sdk`.

## Context Summary
- Single file owns all LLM calls: `signalsai-backend/src/utils/website-utils/pageEditorService.ts`
- `@anthropic-ai/sdk` (^0.20.9) is already in `package.json` — used by Minds chat. No install needed.
- `ANTHROPIC_API_KEY` already present in `.env`.
- Prompt file (`pageEditorPrompt.ts`) is SDK-agnostic — no changes needed.
- Controllers call `editHtmlComponent` with same interface — no changes needed.
- Frontend has no model awareness — no changes needed.

## Existing Patterns to Follow
- Lazy singleton client initialization
- Same `EditRequest` / `EditResponse` / `EditDebugInfo` interfaces preserved
- Same JSON/HTML parsing and validation logic

## Proposed Approach

### 1. Rewrite `pageEditorService.ts`
Reverse the Gemini → Anthropic mapping:

| Gemini (current) | Anthropic (target) |
|---|---|
| `@google/genai` | `@anthropic-ai/sdk` |
| `GEMINI_API_KEY` | `ANTHROPIC_API_KEY` |
| `gemini-2.5-flash` | `claude-haiku-4-5-20251001` |
| `role: "model"` | `role: "assistant"` |
| `config.systemInstruction` | `system` param |
| `config.maxOutputTokens: 4096` | `max_tokens: 4096` |
| `response.text` | `response.content[0].text` |
| `response.usageMetadata.promptTokenCount` | `response.usage.input_tokens` |
| `response.usageMetadata.candidatesTokenCount` | `response.usage.output_tokens` |

### 2. No changes to
- `pageEditorPrompt.ts`
- Any controller files
- Frontend
- `package.json` (SDK already installed)

## Risk Analysis
- **Level 1 — Low risk.** Single file swap, same interface contract, reverting to previously working state.
- Prompts are DB-configurable so any model-specific tuning can be adjusted without code changes.

## Definition of Done
- `pageEditorService.ts` uses Claude Haiku 4.5 via `ANTHROPIC_API_KEY`
- All existing interfaces preserved
- Token usage tracking uses Anthropic field names
- No other files modified
