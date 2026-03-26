# Knowledge Graph Protocol

## Source Chain

Every Canon page (authoritative knowledge document) must include a footer with:
- **Source**: Where this knowledge originated (URL, paper, interview, observation)
- **Created**: Date first documented
- **Last Verified**: Date last confirmed accurate
- **Used By**: Which agents reference this document
- **Confidence**: High / Medium / Low
- **Outcome Notes**: What happened when this knowledge was applied

## Access Logging

When an agent accesses a Canon page or knowledge document:
1. Log the access to knowledge_access_events table
2. Include: agent name, document ID, document title, session context, action type (read/cite/apply)
3. This creates an audit trail showing which knowledge drives which outputs

## Knowledge Freshness

- Documents not accessed in 90 days are flagged for review
- Documents cited in incorrect outputs are flagged for correction
- The Nothing Gets Lost Agent runs monthly orphan scans for unreferenced documents

## Rules

- No agent creates Canon pages. Only Corey or the System Conductor can promote a document to Canon status.
- Agents can propose corrections to Canon pages. Corrections are staged, not applied directly.
- Knowledge access events are append-only. Never delete access logs.
