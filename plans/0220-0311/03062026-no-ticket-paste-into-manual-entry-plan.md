# Paste-from-Clipboard into Manual Entry

**Ticket:** --no-ticket
**Date:** 03/06/2026

## Problem Statement

Users manually type referral data row by row in the manual entry modal. Most users already have this data in Excel, Numbers, or Google Sheets. There's no way to paste spreadsheet data into the manual entry grid. Users should be able to Cmd+V from a spreadsheet and have the data parsed, mapped, and populated automatically.

## Context Summary

- Manual entry UI: `PMSManualEntryModal.tsx` — modal with month tabs, each containing a grid of `SourceRow[]`
- `SourceRow`: `{ source, type ("self"|"doctor"), referrals, production }`
- `MonthBucket`: `{ month (YYYY-MM), rows: SourceRow[] }`
- Data flows: `MonthBucket[]` → `transformUIToBackend()` → `submitManualPMSData()` → backend auto-approves → monthly agents
- No backend changes needed — paste is pure frontend parsing into existing data structures

### What Spreadsheet Paste Looks Like

When you Cmd+V from Excel/Numbers/Sheets, the clipboard contains **tab-separated values (TSV)**. Rows are `\n`-separated, columns are `\t`-separated. The first row is typically headers.

Example clipboard content:
```
Date	Source	Type	Referrals	Production
01/15/2026	Dr. Smith	doctor	5	2500
01/20/2026	Website	self	3	1800
02/03/2026	Dr. Jones	doctor	2	1200
```

## Existing Patterns to Follow

- `pmsDataTransform.ts` handles all data transformation between UI and backend formats
- `types.ts` defines `SourceRow`, `MonthBucket`, `MonthSummary`
- The modal already manages `months: MonthBucket[]` state

## Proposed Approach

### Architecture: 3-Step Paste Flow

1. **Detect & Parse** — Intercept paste event, parse TSV into a raw 2D string array
2. **Map Columns** — Show a mapping UI where detected headers are mapped to target fields (source, type, referrals, production, date)
3. **Preview & Confirm** — Show parsed data grouped by month, user confirms, data merges into `MonthBucket[]` state

### New Files

| File | Purpose |
|------|---------|
| `signalsai/src/components/PMS/parsePastedData.ts` | Core parsing: TSV parse, date detection, column mapping, data normalization |
| `signalsai/src/components/PMS/PasteMapperModal.tsx` | Column mapping + preview UI shown after paste |

### Modified Files

| File | Change |
|------|--------|
| `signalsai/src/components/PMS/PMSManualEntryModal.tsx` | Add paste event listener, "Paste from Spreadsheet" button, integrate PasteMapperModal |

### 1. `parsePastedData.ts` — Parsing Engine

#### TSV Parser
```
parseTSV(raw: string): { headers: string[], rows: string[][] }
```
- Split by `\n`, then by `\t`
- Trim whitespace
- Skip empty rows
- First row = headers

#### Date Format Detection
```
detectDateFormat(samples: string[]): DateFormat | null
```

Supported date formats (ordered by specificity):
- `YYYY-MM` → already in target format
- `YYYY-MM-DD` → ISO format
- `MM/DD/YYYY`, `M/D/YYYY` → US format
- `DD/MM/YYYY`, `D/M/YYYY` → EU format (detected by values > 12 in first position)
- `MM-DD-YYYY`, `DD-MM-YYYY` → dash variants
- `Jan 2026`, `January 2026` → month name + year
- `Jan 15, 2026` → month name + day + year
- `1/2026`, `01/2026` → month/year only
- `MM/YY`, `M/YY` → short year

Detection strategy:
1. Collect all date-column values
2. Try each format parser against all values
3. Pick the format that successfully parses the most values (≥ 80% threshold)
4. For MM/DD vs DD/MM ambiguity: if any value has first number > 12, it's DD/MM; if second number > 12, it's MM/DD; if ambiguous, default to MM/DD (US locale)

```
parseDate(value: string, format: DateFormat): string | null  // returns YYYY-MM
```

#### Column Mapping
```
inferColumnMapping(headers: string[]): ColumnMapping
```

Target fields and their aliases:
- **date**: `date`, `month`, `period`, `time`, `year`, `mo`, `reporting period`
- **source**: `source`, `name`, `referring doctor`, `doctor`, `referral source`, `provider`, `dr`, `referred by`, `from`
- **type**: `type`, `referral type`, `category`, `kind`, `classification`
- **referrals**: `referrals`, `referral count`, `count`, `patients`, `new patients`, `# referrals`, `qty`, `volume`
- **production**: `production`, `revenue`, `amount`, `$`, `total`, `collections`, `value`, `dollars`

Strategy:
1. Normalize headers: lowercase, trim, remove special chars
2. Exact match first against alias lists
3. Fuzzy match: check if header `includes` an alias keyword
4. Unmapped columns: mark as "skip"
5. If no date column found: all rows default to the currently active month in the modal

#### Data Normalization
```
normalizeRows(rows: string[][], mapping: ColumnMapping, dateFormat: DateFormat | null): MonthBucket[]
```
- For each row, extract mapped fields
- Parse dates → YYYY-MM, group rows by month
- Parse referrals → number (strip non-numeric)
- Parse production → number (strip `$`, `,`, non-numeric)
- Infer type: if column exists use it; if source name contains "dr", "doctor", "dds", "dmd" → "doctor"; else "self"
- Build `MonthBucket[]` grouped by parsed month

### 2. `PasteMapperModal.tsx` — Mapping UI

A lightweight inline panel (not a separate modal) that appears inside `PMSManualEntryModal` when paste is detected:

**Step 1: Column Mapping**
- Shows detected headers in a horizontal row
- Each header has a dropdown to map to: Date, Source, Type, Referrals, Production, or Skip
- Auto-filled from `inferColumnMapping()`, user can override
- "Apply" button to proceed

**Step 2: Preview**
- Shows parsed data grouped by month
- Each month section shows rows with source, type, referrals, production
- Date format shown: "Detected: MM/DD/YYYY"
- Row count: "X rows across Y months"
- "Import" button to merge into state, "Cancel" to discard

### 3. `PMSManualEntryModal.tsx` — Integration

- Add a "Paste from Spreadsheet" button (clipboard icon) next to the "Add Source" button
- Register a `paste` event listener on the modal container
- On paste: parse TSV, if valid (≥ 2 columns, ≥ 1 data row), show PasteMapperModal
- On import: merge parsed `MonthBucket[]` into existing `months` state
  - If month already exists: append rows to existing month
  - If month is new: add new MonthBucket
- If paste doesn't look like TSV (single column, no tabs): ignore, let default paste behavior happen

## Risk Analysis

**Level 2 — Concern.** Date format detection is the hardest part. The DD/MM vs MM/DD ambiguity is inherently unsolvable for values like `01/02/2026` without additional context. Our strategy (check for values > 12 to disambiguate, default to MM/DD for US locale) covers the vast majority of real-world cases. The user can always see the preview and correct before importing.

Edge cases:
- **No date column**: Fine — all rows go to the currently selected month
- **Mixed date formats**: We detect once for the whole column, not per-row. If formats are mixed, the most-parseable format wins and unparseable rows get the current month
- **No headers**: If first row looks like data (numeric values), treat as headerless and show all columns as "unmapped" for user to assign
- **Empty paste or non-TSV**: Silently ignore, don't show mapper

## Definition of Done

- [ ] Cmd+V from Excel/Numbers/Sheets parses TSV data
- [ ] Column headers auto-mapped to target fields (source, type, referrals, production, date)
- [ ] User can override column mappings via dropdowns
- [ ] Date format auto-detected from 10+ common formats
- [ ] MM/DD vs DD/MM ambiguity handled with smart detection
- [ ] Rows grouped by parsed month into MonthBucket[]
- [ ] Preview shows parsed data before import
- [ ] Import merges into existing months state (append rows if month exists)
- [ ] Type inference from source name when no type column (doctor keywords → "doctor")
- [ ] "Paste from Spreadsheet" button as alternative to keyboard paste
- [ ] Non-TSV paste silently ignored
- [ ] Build passes clean
