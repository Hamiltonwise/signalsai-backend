# Plan 06 — Tabs: Agent Outputs (5 Agent Types)

## Problem Statement

Five tabs (Proofline, Summary, Opportunity, CRO, Referral Engine) all display agent outputs differing only by `agent_type` filter. Creating 5 separate components would be pure duplication.

## Context Summary

- `GET /api/admin/agent-outputs?organization_id=X&agent_type=Y` — paginated list with filters.
- Agent type strings: `proofline`, `summary`, `opportunity`, `cro_optimizer`, `referral_engine`.
- `AgentOutputsList.tsx` is the existing full standalone page.
- `AgentOutputDetailModal` exists for viewing full JSON output.

## Existing Patterns to Follow

- `AgentOutputsList.tsx` — row rendering, status badges, archive actions.
- `fetchAgentOutputs` from `api/agentOutputs.ts` — reuse directly.
- `AgentOutputDetailModal` — reuse for detail view.

## Proposed Approach

### Create `signalsai/src/components/Admin/OrgAgentOutputsTab.tsx`

- Props: `organizationId: number, agentType: AgentOutputType, locationId: number | null`
- Uses `fetchAgentOutputs({ organization_id, agent_type })` from `api/agentOutputs.ts`
- Status filter, pagination, empty state
- Row click opens `AgentOutputDetailModal` for full JSON view

### Tab mapping in `OrganizationDetail.tsx`

| Tab Key | `agent_type` |
|---|---|
| `proofline` | `"proofline"` |
| `summary` | `"summary"` |
| `opportunity` | `"opportunity"` |
| `cro` | `"cro_optimizer"` |
| `referral` | `"referral_engine"` |

Single `OrgAgentOutputsTab` component handles all 5 tabs via the `agentType` prop.

## Architectural Decision

**Single parameterized component, not 5 separate components.**
All 5 tabs have identical structure, identical API call, identical row rendering. Only the filter value differs. 5 separate components would be pure duplication that would diverge over time.

## Risk Analysis

- **Level 1:** Read-only with optional archive. No mutations beyond archive toggle.
- **Level 2:** `AgentOutputDetailModal` is standalone — verify it works when rendered from embedded tab context (no z-index conflicts with admin layout).

## Definition of Done

- All 5 agent tabs render correctly with the same component
- Pagination, status filter, detail modal work
- Empty state per agent type is informative
