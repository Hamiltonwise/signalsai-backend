# PMS AI-Powered Paste-to-Parse

**Ticket:** --no-ticket
**Date:** 03/06/2026

## Problem Statement

Users manually type referral data row by row in `PMSManualEntryModal`. Most users already have this data in Excel, Numbers, or Google Sheets. There's no way to paste spreadsheet data into the manual entry grid. Users should be able to Cmd+V, confirm the paste, have it sent to an AI parsing layer (Haiku), and get the form auto-populated with parsed data.

## Context Summary

- Manual entry UI: `PMSManualEntryModal.tsx` — modal with month tabs, each containing a grid of `SourceRow[]`
- `SourceRow`: `{ id, source, type ("self"|"doctor"), referrals, production }`
- `MonthBucket`: `{ id, month (YYYY-MM), rows: SourceRow[] }`
- Data flows: `MonthBucket[]` → `transformUIToBackend()` → `submitManualPMSData()` → backend auto-approves → monthly agents
- Backend PMS routes: `signalsai-backend/src/routes/pms.ts`
- Anthropic SDK already installed (`@anthropic-ai/sdk@^0.20.9`), Haiku already used elsewhere
- Existing JSON parsing pattern: strip markdown fences, validate shape, error handling

## Existing Patterns to Follow

- **Anthropic calls**: Singleton client pattern (`getClient()`), non-streaming `messages.create()`, response text extraction via `content[0]?.type === "text"`, JSON fence stripping
- **Model**: `claude-haiku-4-5-20251001` (already used in `pageEditorService.ts` and form analysis)
- **PMS services**: Controller files in `signalsai-backend/src/controllers/pms/pms-services/`, utility files in `pms-utils/`
- **Validation**: `pms-validator.util.ts` patterns (coerceBoolean, toNumber, ensureArray, validateJobId)
- **Frontend API**: `signalsai/src/api/pms.ts` for PMS-related API calls
- **Data transforms**: `signalsai/src/components/PMS/pmsDataTransform.ts`

## Proposed Approach

### Architecture: 3-Step Flow

1. **Paste → Confirm** — User pastes in the modal, confirmation dialog appears showing paste size and row estimate
2. **Parse via AI** — Raw text sent to `POST /pms/parse-paste`, Haiku parses and returns structured `MonthBucket[]`
3. **Populate Form** — Parsed data populates the existing manual entry form directly. User reviews/edits in the form before submitting.

### Batch Processing

- **Chunk size**: 25KB per AI request (~250 rows)
- **Detection**: If pasted text exceeds 25KB, split into chunks at newline boundaries
- **Processing**: Chunks sent sequentially to the same endpoint
- **Merging**: Results merged client-side — same-month rows across chunks get combined into single MonthBucket
- **UX**: Progress indicator shows "Processing chunk X of Y..."

### New Files

| File | Purpose |
|------|---------|
| `signalsai-backend/src/controllers/pms/pms-services/pms-paste-parse.service.ts` | AI parsing service — Haiku system prompt, request/response handling, JSON validation |
| `signalsai/src/components/PMS/PasteConfirmDialog.tsx` | Confirmation dialog shown on paste — displays size, row count, confirm/cancel |
| `signalsai/src/components/PMS/usePasteHandler.ts` | Custom hook — paste event listener, chunking logic, batch processing, state management |

### Modified Files

| File | Change |
|------|--------|
| `signalsai-backend/src/routes/pms.ts` | Add `POST /pms/parse-paste` route |
| `signalsai/src/components/PMS/PMSManualEntryModal.tsx` | Integrate `usePasteHandler` hook, add "Paste Data" button, wire up PasteConfirmDialog |
| `signalsai/src/api/pms.ts` | Add `parsePastedData()` API function |
| `signalsai/src/components/PMS/Types.ts` | Add paste-related types (PasteParseRequest, PasteParseResponse) |

### 1. Backend: `pms-paste-parse.service.ts`

**Endpoint**: `POST /pms/parse-paste`
**Auth**: JWT required (same middleware as other PMS routes)
**Request body**:
```
{
  rawText: string,        // The pasted clipboard content
  currentMonth: string,   // YYYY-MM — fallback month if no dates detected
  domain: string          // Client domain for org resolution
}
```

**Response**:
```
{
  success: boolean,
  data: {
    months: Array<{
      month: string,            // YYYY-MM
      rows: Array<{
        source: string,
        type: "self" | "doctor",
        referrals: number,
        production: number
      }>
    }>,
    warnings: string[],         // e.g. "3 rows had no production value"
    rowsParsed: number,
    monthsDetected: number
  },
  error?: string
}
```

**Haiku System Prompt** (key aspects):
- "You are a data extraction specialist. Parse the following pasted spreadsheet/CSV data into structured referral data."
- Explicit output JSON schema provided in the prompt
- Instructions for date detection and YYYY-MM grouping
- Instructions for type inference: source names containing "dr", "doctor", "dds", "dmd", "md" → "doctor", everything else → "self"
- Instructions for number parsing: strip currency symbols, commas, handle empty as 0
- If no date column detected, use the provided `currentMonth` for all rows
- If data is ambiguous or unparseable, return what you can with warnings
- Response must be valid JSON only, no markdown fences, no commentary

**Validation after AI response**:
- Strip markdown fences (existing pattern)
- `JSON.parse()` with try/catch
- Validate shape: `months` array, each entry has `month` (YYYY-MM regex), `rows` array, each row has required fields
- Coerce types: ensure referrals/production are numbers
- Reject if zero parseable rows

**Token limits**:
- `max_tokens: 4096` (sufficient for ~250 rows of structured output)
- Input will be ~25KB max per request = ~6,000 tokens

### 2. Frontend: `usePasteHandler.ts`

Custom React hook that encapsulates all paste logic:

```
usePasteHandler({
  currentMonth: string,
  domain: string,
  onParsed: (months: MonthBucket[]) => void,
  onError: (msg: string) => void
})
```

**Returns**:
```
{
  isPasting: boolean,           // Loading state during AI parse
  showConfirm: boolean,         // Whether confirm dialog is visible
  pasteInfo: { text: string, sizeKB: number, estimatedRows: number } | null,
  confirmPaste: () => void,     // Trigger parse after confirmation
  cancelPaste: () => void,      // Dismiss
  batchProgress: { current: number, total: number } | null,
  handlePasteEvent: (e: ClipboardEvent) => void  // Attach to onPaste
}
```

**Paste detection logic**:
- Listen for `paste` event on the modal container
- Extract `e.clipboardData.getData("text/plain")`
- Quick validation: must contain `\t` or `,` (tabular data indicator) AND have ≥ 2 lines
- If not tabular: ignore, let default paste behavior happen (user might be pasting into a text input)
- If tabular: prevent default, show confirm dialog

**Chunking logic**:
- If `rawText.length > 25_000` (25KB):
  - Split at newline boundaries into chunks ≤ 25KB each
  - Preserve the first line (headers) in every chunk
  - Process chunks sequentially via `parsePastedData()` API
  - Merge results: combine MonthBuckets with same month
- If ≤ 25KB: single request

**Form population**:
- Convert API response into `MonthBucket[]` with proper `id` fields (Date.now() based)
- Call `onParsed(parsedMonths)` which merges into existing state
- Merge strategy: if month exists, append rows. If new month, add MonthBucket.

### 3. Frontend: `PasteConfirmDialog.tsx`

Lightweight dialog (not a full modal) — appears as an overlay inside the manual entry modal.

**Content**:
- "Paste detected" header
- Size: "X KB"
- Estimated rows: "~Y rows"
- If batching required: "This will be processed in Z batches"
- Two buttons: "Parse Data" (primary, orange), "Cancel" (secondary)

**During processing**:
- Dialog stays open
- Button text changes to "Parsing..." with spinner
- If batching: progress bar "Processing batch X of Y"

### 4. `PMSManualEntryModal.tsx` Integration

- Import and use `usePasteHandler` hook
- Add `onPaste` handler to the modal's main container div
- Add a "Paste Data" button (clipboard icon + text) in the header area, next to existing controls
  - Clicking it focuses a hidden textarea and triggers `document.execCommand('paste')` or opens a prompt asking user to paste
  - Alternative: clicking shows a textarea overlay "Paste your data here" where user can Cmd+V
- On successful parse: merge MonthBuckets into `months` state, show success toast with row count
- On error: show error toast

### 5. `pms.ts` (API) Addition

```
export async function parsePastedData(request: {
  rawText: string;
  currentMonth: string;
  domain: string;
}): Promise<PasteParseResponse>
```

Posts to `/pms/parse-paste` with auth headers.

## Risk Analysis

**Level 2 — Concern: AI parsing accuracy.**
Haiku is good at structured extraction but not perfect. Mitigation: the user sees all parsed data in the manual entry form before submitting. They can edit any incorrect values. The form IS the verification step. Warnings from the AI (ambiguous rows, missing data) surface as a toast notification.

**Level 1 — Token cost.**
25KB limit × Haiku pricing = ~$0.002 per paste operation. Even with batching, cost is negligible. Haiku input: $0.25/MTok, output: $1.25/MTok. A 25KB chunk ≈ 6K input tokens + ~2K output tokens = ~$0.004.

**Level 2 — Concern: Paste event hijacking.**
The paste listener on the modal container could interfere with normal text input paste (e.g., pasting a source name into an input field). Mitigation: only intercept paste if the content looks tabular (contains tabs/commas AND multiple lines). If user is focused on a text input, check `e.target` — if it's an input/textarea, let default behavior through.

**Level 1 — Batch merge correctness.**
When chunking, the same month might appear in multiple chunks. The merge logic must deduplicate by month key (YYYY-MM) and combine rows. This is straightforward since we're just concatenating row arrays.

## Performance Considerations

- Haiku response time: 1-3 seconds for ≤25KB (well under the 10-second target)
- Batch of 4 chunks (100KB total): ~4-12 seconds sequential
- No database writes during parse — this is a stateless transformation endpoint
- No background jobs needed

## Security Considerations

- JWT auth required on the endpoint — no unauthenticated access
- Input size hard-capped at server level (25KB per request, reject larger)
- AI prompt instructs structured output only — no execution risk
- Raw paste data is not persisted anywhere (stateless transform)

## Definition of Done

- [x] `POST /pms/parse-paste` endpoint operational with Haiku parsing
- [x] System prompt accurately extracts source, type, referrals, production, and month
- [x] Response validation ensures correct shape before returning to client
- [x] Paste event detected in PMSManualEntryModal when content is tabular
- [x] Non-tabular paste (single values) passes through to default behavior
- [x] Confirmation dialog shows paste size and estimated rows
- [x] Parsed data populates the manual entry form (MonthBucket[] merge)
- [x] Batch processing splits >25KB pastes into chunks with header preservation
- [x] Batch progress indicator visible during multi-chunk processing
- [x] Warnings from AI surfaced via console (onWarnings callback)
- [x] Error handling: malformed AI response, network failure, empty parse result
- [x] Build passes clean, no TypeScript errors

## Implementation Notes

### Deviation from Plan
- **API function simplified**: Removed `domain` parameter from `parsePastedData()` — the endpoint doesn't need it since it's a stateless AI transform (no org lookup required for parsing).
- **Paste Data button**: Uses `navigator.clipboard.readText()` API instead of hidden textarea approach. Falls back to error message suggesting Cmd+V if clipboard access is denied.
- **Warnings**: Logged to console rather than displayed as toast to keep UX clean. Can be upgraded to toast in a future iteration if needed.
