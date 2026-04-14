# Information Architecture -- One System

## The Rule

Notion is the interface layer (cross-team status, decisions, agent status).
Repo is the build layer (code patterns, quality gates, sprint journal).
Codebase is truth (behavioral_events, Canon pipeline, agent status).

Never duplicate the same information across Notion and repo files.
Each category has ONE authoritative source. Everything else is a pointer.

## Authoritative Sources

| Category | Source of Truth | Where | Pointer |
|----------|---------------|-------|---------|
| Build state (what's committed, deployed) | CURRENT-SPRINT.md | Repo | -- |
| Dave's pending tasks | Dave Sprint page | Notion | CURRENT-SPRINT.md points to it, does not duplicate |
| Agent system status | Agent Status Dashboard | Notion (cross-read by Dave + Jo) | Canon Tab in admin dashboard is real-time |
| Operating protocol | memory/context/operating-protocol.md | Repo | CLAUDE.md references it |
| Corey's next action | Build Queue cockpit | Notion | Task routing reads it at session start |
| Locked decisions | Decision Log | Notion | -- |
| Product truth | docs/PRODUCT-OPERATIONS.md | Repo | -- |

## Session Start: What CC Reads

1. CLAUDE.md (always)
2. CURRENT-SPRINT.md (GPS)
3. Build Queue cockpit section in Notion (for active WO and decisions pending Corey)
4. docs/PRODUCT-OPERATIONS.md (Product Constitution)
5. If BUILD session: memory/context/session-contract.md

## Notion Pages CC Can Read (Cross-Read, Never Modify)

These are Corey-owned pages in Alloro HQ. CC reads them for context.
CC never modifies Notion pages owned by Dave or Jo.

- Build Queue: https://www.notion.so/32dfdaf120c48141a798f219d02ac76d
- Build State: https://www.notion.so/32dfdaf120c4810f908ee3a1ea7452b7
- Dave's Context Brief: https://www.notion.so/328fdaf120c4815cbbc8e2c6b10bfc05
- Dave's Sprint: https://www.notion.so/32bfdaf120c481aea0e5cfcdfc173292
- Agent Status Dashboard: https://www.notion.so/328fdaf120c481e8be98dd225f0bad70
- Jo's Context Brief: https://www.notion.so/328fdaf120c48148bb2dfada3a71bf21

## Notion Sync Triggers (When CC Updates Notion)

CC updates Notion pages at these natural breakpoints -- not continuously:

1. **After every Dave handoff:** Update Dave's Sprint page (new cards in card format) + Dave's Context Brief (if agent status or priorities changed)
2. **After every decision lock:** Update Build Queue cockpit (remove decided items, add new decisions pending)
3. **After every Canon Tab review:** Update Agent Status Dashboard system status section
4. **After every major milestone:** Update Build Queue with next WO

If a sync trigger fires, CC should update the relevant Notion page before ending the session.
Do not update Notion for minor changes (typo fixes, CSS tweaks, test file additions).

## Card Format for Dave's Sprint Page

Every card sent to Dave must use this format (confirmed April 11, 2026):

```
Card [N]: [Feature Name]
Blast Radius: Green / Yellow / Red
Complexity: Low / Medium / High
Dependencies: [prior cards or "none"]

What Changes:
- [file]: [specific change]

Touches:
- Database: yes/no
- Auth: yes/no
- Billing: yes/no
- New API endpoint: yes/no

Verification Tests:
1. [Specific, runnable check]
2. [Specific, runnable check]

Done Gate:
All verification tests pass? Yes = next card. No = fix before proceeding.
```

Max 5 active cards on the Sprint page at any time.

## What This Replaces

- CURRENT-SPRINT.md no longer tracks Dave's tasks (points to Notion Sprint page)
- Notion Build State page is a milestone snapshot, not a live tracker (CURRENT-SPRINT.md is the live tracker)
- briefs/ agent evaluation docs are historical records, not living references (Agent Status Dashboard is current)

## Three-Claude Ownership Rule

- Corey's Claude: reads Dave's and Jo's pages, never modifies them
- Dave's Claude: reads Corey's HQ pages, never modifies them
- Jo's Claude: reads Corey's HQ and Dave's pages, never modifies them
- Each Claude operates in its owner's lane only
- Cross-read for context. Cross-write never.
