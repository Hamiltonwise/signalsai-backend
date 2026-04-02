# April 2 Evening Handoff: Event Schema + PMS Parser + Board Cleanup

## Who You Are
You are picking up from two overlapping sessions that built the Canon governance system, fixed the Monday email (12/12 gold questions passing), ran the Agent Auditor for the first time, and made the Dream Team drawer self-documenting. Everything is committed and pushed to sandbox.

## Before You Write Any Code
1. Read Claude's Corner: https://www.notion.so/330fdaf120c481ea95fccb43650bfd0a
2. Read the CC Operating Space: https://www.notion.so/32dfdaf120c4819fa720f60b68ce0c0e
3. Read memory: project_session_apr2_canon_final.md
4. Read memory: feedback_listen_to_the_system.md
5. Read memory: user_corey_deep.md
6. Read memory: project_dave_call_apr2.md

## CRITICAL: Check Canon Data First
Canon specs and gold questions were cleared after migrations ran in a previous session. They were re-seeded directly, but if another migration recreates the agent_identities table, it'll wipe again. Before doing ANYTHING, run this:
```sql
SELECT count(*) FROM agent_identities WHERE canon_spec != '{}';
```
If the count is 0 or low, the Canon data was wiped. Re-run the seed migrations:
```
npx knex migrate:latest
```
If migrations are already marked as complete but data is empty, you'll need to re-seed directly. Check migration 20260402000004 (critical agents, 100 gold questions), 20260402000006 (playbooks), and 20260402000007 (all agents starter questions) for the seed logic.

## Who Corey Is
Corey is the founder. USAF veteran, Pararescueman. Building Alloro to give every business owner the life they set out to build. Sophie is 8 months old. He doesn't read JSON. He catches things automated tests miss because he sees the product as a person. When he says "think carefully" he means it.

Clients are churning. Sean said "you're doing the same thing I'm doing myself." Pollock hasn't logged in in 3 months. Cargoli's PMS upload broke. The basics must work before anything else gets added.

## The North Stars
1. Undeniable Value: the customer stops and says "how did they know that?"
2. Inevitable Unicorn: every build closes a gap toward unicorn valuation
3. Mission: give every business owner the life they set out to build

## What Was Just Built (DO NOT REDO)
- Canon governance: 3-level gate (FAIL/PENDING/PASS), 220+ gold questions, 7-layer security stack in scheduler
- Monday email: 12 gold question failures fixed (fabricated counts, test org filter, em-dash sanitization, universal language, Conductor before send, bio-economic lens, founderLine wired, timezone TODO)
- Dream Team drawer: click any agent, see Canon playbook (purpose, steps, delivers to, success metric), Canon status (verdict, gold questions, last run), then KPIs and outputs
- Agent Auditor first run: 0 critical, 83 warnings, 36 info
- CS Agent + Monday Email wired through agentRuntime + Go/No-Go
- CS Coach event type fixed (cs_agent.% to cs.%)
- Event schema registry created (src/services/agents/eventSchema.ts)
- 39 agents with identity definitions, Canon specs, playbooks
- Resume drawer is self-documenting (the agent explains itself)
- Lemonis Protocol started: archetype + personalGoal fields in CleanWeekEmail

## What NOT to Touch
- src/workers/processors/scheduler.processor.ts (7-layer security stack, done)
- src/services/agents/agentIdentity.ts (39 AGENT_DEFINITIONS, done)
- src/services/agents/agentRuntime.ts (auto-write to agent_results, done)
- src/services/agents/agentAuditor.ts (done)
- src/services/agents/eventSchema.ts (you'll ADD to this, not rewrite it)
- src/services/agentRegistry.ts (39 handlers, done)
- src/routes/admin/agentCanon.ts (endpoints done)
- src/routes/admin/dreamTeam.ts (Canon data in drawer, done)
- All frontend Canon/Pulse/Banner/Drawer components (done)
- All migration files 000001 through 000007 (done, already ran)

## Known Workspace Issues (NOT YOUR FAULT)
- AdminOrganizationsController.ts: trial_start_at TypeScript error (pre-existing). Filter: `grep -v "AdminOrganizationsController\|trial_start_at"`
- OrganizationDetail.tsx: patientpath_status error (pre-existing). Filter: `grep -v "OrganizationDetail\|patientpath_status"`
- PMSUploadModal.tsx: uncommitted changes from another session
- These do NOT affect your work. Filter them from tsc output.

## What Needs Doing (Priority Order)

### 1. Event Schema Wiring (38 Unknown Event Types)
The Auditor found 38 event types being written to behavioral_events that aren't registered in src/services/agents/eventSchema.ts. These are real signals disappearing because no consumer knows they exist.

Run the Auditor to get the current list:
```
npx tsx -e 'import { runAgentAudit } from "./src/services/agents/agentAuditor"; runAgentAudit().then(r => { r.findings.filter(f => f.check === "broken.unknown_event_type").forEach(f => console.log(f.title)); process.exit(0); });'
```

For each unknown event type:
1. Add it to EVENT_TYPES in eventSchema.ts
2. Add its properties interface if the schema is known
3. Add its consumers to EVENT_CONSUMERS (which agents read this event?)

This is mechanical work. Low risk. Fixes 38 of the 83 warnings in one pass.

### 2. PMS Parser Investigation (Clients Seeing Wrong Data)
Dr. Pollock sees 133% referral increase but 50% production decrease. Contradictory data. Cargoli tried to upload PMS data and everything broke. Google showing as top referral source with 19,000 total but recent months showing 6 referrals.

Files to investigate:
- src/services/pmsParser.ts (or wherever PMS parsing lives)
- The PMS source column detection (tries "Referral Source", "Referring source", "referral_source")
- How raw_input_data in pms_jobs is parsed and stored
- Why Google appears as a referral source (likely website self-referrals not filtered)

This is the highest-impact client fix. Wrong data destroys trust faster than no data.

### 3. Gray Dot Decision (24 Org Chart Placeholders)
24 dream_team_nodes have no agent_key. They show as gray dots on the Dream Team board. For each one, decide:

**Keep (has a real purpose, just not built yet):**
- Onboarding Agent, Retention Alert Agent, Follow-Up Agent

**Remove (aspirational, no near-term plan):**
- AEO Writer Agent, Video Script Agent, Distribution Agent, IT Agent, Finance Monitor Agent, Spec Writer Agent, and others with no service file and no clear spec

The board should reflect reality. Dave said "some of them are showing gray" and couldn't tell what was real. A board with 25 green dots and 0 gray dots is more credible than one with 25 green dots and 24 gray dots.

### 4. Code Audit (What Claude CAN Check)
Claude can't walk through the app as a user. But Claude can:
- Grep every client-facing string for "practice", "patient", "doctor" (universality check)
- Search for hardcoded business values (ORG_MONTHLY_RATE, pricing, burn rate outside business_config)
- Check every route in src/routes/ for missing authenticateToken middleware (security audit)
- Verify every component in frontend/src/ imports correctly (no dead imports)
- Search for em-dashes in all .ts and .tsx files
- List every TODO and FIXME in the codebase

This is the code-level audit Dave was asking for.

### 5. Full App Walkthrough (HUMAN, NOT CLAUDE)
This must be done by Corey or Jordan with a real browser:
- Checkup flow end to end (QR code to signup to dashboard)
- Client dashboard as each paying client
- Admin HQ all tabs
- PMS uploader
- Mobile experience

Claude can prepare a checklist. A human has to walk it. The experience can't be tested from a terminal.

### 6. Lemonis Protocol Completion (AFTER BASICS WORK)
The five Lemonis questions (confidence, what keeps you up, extra time, "worth it", what you want) are a personalization layer. They should wait until:
- PMS parser shows correct data
- Monday email delivers real intelligence
- Clients are actually logging in

Adding personality profiling on top of broken plumbing is polishing before fixing.

## Dave Call Context (April 2, 100 min)
Dave's concerns, current status:
- "What does this agent do?" -> Drawer now shows playbook. ADDRESSED.
- "Some are showing gray" -> 30 camelCase mismatches fixed. 24 genuinely unbuilt (decision needed, item 3).
- "Are they actually running?" -> BullMQ worker runs on EC2, not locally. All show last_run_at: never locally. Expected.
- "We can't just dump everything" -> Cherry-pick process, hours per feature. Homepage + checkup tool first.
- "I'm skeptical about the agents" -> Fair. 38 event types unregistered, 14 silent producers. Item 1 fixes this.

## Standing Rules
- Never use em-dashes (unicode \u2014 or \u2013)
- Never use "practice" in customer-facing copy. Use "business"
- Never use "patient" or "doctor" in universal contexts. Use vocabulary config terms
- Never fabricate content
- Text color #1A1D23, not #212D40
- Min font text-xs (12px), max weight font-semibold
- Run `npx tsc --noEmit` (backend) + `cd frontend && npx tsc -b --force` (frontend) before commit
- COMMIT AND PUSH before ending session. Do not leave work uncommitted.
- Branch: sandbox (never push to main)

## The Standard
Would Chris Olson open this product and feel like someone was watching his business while he slept? Would the data be accurate? Would the language make sense to a barber, a CPA, and a physical therapist, not just an endodontist? If yes, ship it. If no, fix it first.
