# Monday Email Fixes -- Complete Handoff

## Who You Are
You are picking up work from a previous Claude session that built the Canon governance system for Alloro's AI agent Dream Team. That session analyzed the Monday email against 20 gold questions and found 12 failures. Your job is to fix them.

## Before You Write Any Code
1. Read Claude's Corner: https://www.notion.so/330fdaf120c481ea95fccb43650bfd0a
2. Read the CC Operating Space: https://www.notion.so/32dfdaf120c4819fa720f60b68ce0c0e
3. Read the memory file: project_session_apr2_canon_build.md
4. Read the memory file: project_session_apr2_deep_dive.md
5. Read the memory file: user_corey_deep.md

## Who Corey Is
Corey is the founder. He's building Alloro to give every business owner the life they set out to build. He served as a Pararescueman. He crosses the street on dog walks to pick up trash for strangers. Sophie is 8 months old. Lindsey is his wife and best friend. He doesn't read JSON or markdown. He watches demos and catches things automated tests miss because he sees the product as a person. When he says "think carefully" he means it.

The Monday email is the product for most customers. It's the thing that makes Chris Olson (a real endodontist in California who texted Corey on his birthday saying "I still can't get my head on straight") stop and say "how did they know that?" or doesn't. Every fix you make touches a real person.

## The North Stars
1. Undeniable Value: the customer stops and says "how did they know that?"
2. Inevitable Unicorn: every build closes a gap toward unicorn valuation
3. Mission: give every business owner the life they set out to build

## Standing Rules (Non-Negotiable)
- Never use em-dashes (unicode \u2014 or \u2013) in ANY output, code, comments, or strings
- Never use "practice" in customer-facing copy. Use "business"
- Never use "patient" or "doctor" in universal contexts. Use vocabulary config terms
- Never fabricate content ("scanned 5 competitors" when it scanned zero)
- Text color #1A1D23, not #212D40
- Min font size text-xs (12px), max weight font-semibold
- Run `npx tsc --noEmit` (backend) + `cd frontend && npx tsc -b --force && npm run build` before commit
- Run `bash scripts/preflight-check.sh`
- Branch: sandbox (never push to main)

## Known Workspace Issues (NOT YOUR FAULT, DO NOT FIX)
- `src/controllers/admin-organizations/AdminOrganizationsController.ts` has a `trial_start_at` TypeScript error. Pre-existing from another session. Filter it out of tsc output: `npx tsc --noEmit 2>&1 | grep -v "AdminOrganizationsController\|trial_start_at"`
- `frontend/src/pages/admin/OrganizationDetail.tsx` has a `patientpath_status` error. Same situation. Filter: `grep -v "OrganizationDetail\|patientpath_status"`
- `frontend/src/components/PMS/PMSUploadModal.tsx` has uncommitted changes from another session that cause the preflight script to report a frontend build failure. Not related to Monday email work.
- `src/routes/admin/agentCanon.ts` was modified by the linter to consolidate an import. This is intentional, do not revert.
- The `npm run build` script in frontend runs `tsc -b && vite build`. The `tsc -b` may fail on the OrganizationDetail error. Use `npx vite build` directly to verify the Vite build passes, and `npx tsc -b --force 2>&1 | grep -v OrganizationDetail` for TypeScript checking.

## What Was Already Built Tonight (DO NOT REDO)
The previous session built:
- Canon governance system with 3-level gate (FAIL/PENDING/PASS with observe mode)
- 220 gold questions across 29 agents
- 7-layer security stack wired into the scheduler (Kill Switch > Circuit Breaker > Canon Gate > Identity > execution > success/failure > lifecycle)
- Agent Auditor (daily self-audit of all agents)
- Team Pulse (5-card war room on Dream Team board)
- Event schema registry (TypeScript-enforced inter-agent contracts)
- Monday Email already wired through agentRuntime + Go/No-Go poll (see sendAllMondayEmails in src/jobs/mondayEmail.ts, the calls are at the top and bottom of the function)
- CS Agent wired through agentRuntime
- CS Coach event type fixed from cs_agent.% to cs.%
- Schedule row for monday_email already added
- 39 agents with identity definitions, Canon specs, playbooks, and gold questions

## What NOT to Touch
- src/workers/processors/scheduler.processor.ts (7-layer security stack, done and tested)
- src/services/agents/agentIdentity.ts (Canon functions, 39 AGENT_DEFINITIONS, done)
- src/services/agents/agentRuntime.ts (auto-write to agent_results, done)
- src/services/agents/csAgent.ts (runtime wiring, done)
- src/services/agents/csCoach.ts (event type fix, done)
- src/services/agents/agentAuditor.ts (done)
- src/services/agents/eventSchema.ts (done)
- src/services/agentRegistry.ts (39 handlers registered, done)
- src/routes/admin/agentCanon.ts (6 endpoints + pulse + roster, done)
- All frontend Canon/Pulse/Banner components (done)
- All migration files (done)

Only touch: src/jobs/mondayEmail.ts, src/emails/templates/MondayBriefEmail.ts, src/emails/templates/CleanWeekEmail.ts

## Important: Runtime Wiring Already in sendAllMondayEmails
The previous session added these calls to sendAllMondayEmails. They are already in the code. Do not add them again:
- `prepareAgentContext` at the top of the function (checks orchestrator)
- `pollForDelivery(org.id, "monday_email")` inside the for loop (4-voter Go/No-Go before each send)
- `recordAgentAction` after successful send (routes through System Conductor)
- `closeLoop` at the bottom (feedback for Learning Agent)

For Fix 6 (Conductor before send), you need to MOVE the recordAgentAction call to BEFORE the sendMondayBriefEmail call, and make the send conditional on the Conductor clearing the content. The Go/No-Go poll stays where it is (before the Conductor check). The correct sequence is:
1. Go/No-Go poll (is the data ready?) -- already wired
2. Build email content (assemble subject, headline, body, action)
3. Conductor gate (is the content quality OK?) -- you're adding this
4. If cleared: sendMondayBriefEmail
5. If held: createMondayBriefFallbackNotification with hold reason
6. recordAgentAction (log what happened) -- move to after the decision
7. closeLoop at the end -- already wired

## The Monday Email Scorecard: 8/20 PASS, 12/20 FAIL

### PASSED (no fix needed)
- GQ-05: First-week checkup email works correctly
- GQ-06: Required tables handled gracefully
- GQ-07: Vocabulary config fallback works (falls back to "customer")
- GQ-08: Mailgun failure creates fallback notification
- GQ-09: Missing referral_sources table handled
- GQ-10: Steady-state fallback chain works
- GQ-14: Referral line gating correct (all 3 conditions enforced)
- GQ-16: Missing ANTHROPIC_API_KEY handled (email still sends)

### FAILED (fix these)

**Fix 1: Fabricated activity counts (CRITICAL)**
File: src/jobs/mondayEmail.ts, around line 438
Bug: When real activity counts are zero, the code fabricates display numbers:
```
competitorCount || (snapshot.competitor_name ? 5 : 3)
```
This shows "scanned 5 competitors" when it scanned zero. This is lying to the client.
Fix: Remove the fabricated fallback. If counts are all zero, send the clean-week email instead. The code has a clean-week path already, route to it when there's nothing real to report.

**Fix 2: Test orgs receive real emails (CRITICAL)**
File: src/jobs/mondayEmail.ts, sendAllMondayEmails function, around line 583
Bug: Query selects all orgs matching subscription_status='active' OR checkup_score IS NOT NULL. No filter for test/demo accounts. The 20+ test orgs from a signup bug could get Monday emails at real email addresses.
Fix: Add a filter. Check if organizations table has is_demo, is_test, or internal column. If not, add logic to skip orgs with names containing "Test" or "Demo" or with known internal email domains. Better: add an is_test boolean column if one doesn't exist.

**Fix 3: Em-dash leak vectors (HIGH)**
Bug: Three paths where em-dashes reach client inbox with zero sanitization:
1. intelligence.finding events from Claude (pulled by getMostShareableFinding around line 293)
2. weekly_ranking_snapshots.bullets (parsed around lines 218-219)
3. Any dynamic content injected into templates
Also: Line 2 of mondayEmail.ts has an em-dash in the comment.
Fix: Create a utility function:
```typescript
function stripEmDashes(text: string): string {
  return text.replace(/\u2014/g, ', ').replace(/\u2013/g, '-');
}
```
Apply to findingHeadline, findingBody, competitorNote, all bullets, rankingUpdate, and actionText before passing to the email template. Fix the comment on line 2. Search both template files for any em-dashes in hardcoded strings.

**Fix 4: Template field naming violates universal language (HIGH)**
File: src/emails/templates/MondayBriefEmail.ts
- Interface field `practiceName` should be `businessName`
- `doctorName` should be `ownerName`
- `doctorLastName` should be `ownerLastName`
File: src/emails/templates/CleanWeekEmail.ts
- Same renames
File: src/jobs/mondayEmail.ts
- Update all call sites (search for practiceName, doctorName, doctorLastName)
This is a find-and-replace but test carefully. The template HTML may also contain "practice" or "doctor" in hardcoded strings.

**Fix 5: Dashboard reference for never-logged-in clients (HIGH)**
File: src/jobs/mondayEmail.ts, around line 469 (actionText default)
Bug: The 5-minute fix says "Open your dashboard" for clients who have never logged in. All 5 paying clients have lastLogin: "never" (found in the April 2 audit). They don't know what the dashboard is.
Fix: Check user.last_login_at or user.first_login_at. If null, use a direct action: "Open your Google Business Profile and respond to any unanswered reviews" instead of "Open your dashboard."

**Fix 6: System Conductor runs AFTER send, not before (MEDIUM)**
Bug: recordAgentAction (which routes through the System Conductor's 7 quality gates: accuracy, timing, consistency, voice, north star, bio-econ lens, empathy) is called AFTER sendMondayBriefEmail. The Conductor never sees the content before the client does. It's reviewing output that already shipped.
Fix: Build the email content first. Before calling sendMondayBriefEmail, call conductorGate with the assembled content. If the Conductor returns { cleared: false }, skip the send and create a fallback notification with the hold reason. Only send if cleared.
Note: Import conductorGate from src/services/agents/systemConductor.ts. The ConductorInput interface requires: agentName, orgId, outputType ("email"), headline, body, humanNeed, economicConsequence.

**Fix 7: Wrap recordEmailOutcome in try/catch (MEDIUM)**
File: src/jobs/mondayEmail.ts, around lines 544 and 198
Bug: recordEmailOutcome could throw if the feedback_outcomes table doesn't exist. This would cause the function to return false even though the email sent successfully. The delivery status would be wrong.
Fix: Wrap both call sites in try/catch. Log the error but return the correct delivery status.

**Fix 8: Biological-economic lens missing from fallback bullets (MEDIUM)**
Bug: Template-generated bullets around lines 224-252 say things like "You're #3 in your market" and "The gap is 15 reviews." No human need named. No dollar consequence.
Fix: When building fallback bullets, append economic context using avgCaseValue from vocabulary_defaults: "That gap represents approximately $X in annual revenue at risk." Name the human need: the owner's team depends on visibility for their livelihood (safety), or their reputation defines their identity in the community (status).

**Fix 9: founderLine dead code (LOW)**
Bug: mondayEmail.ts builds a founderLine string (around lines 175, 191, 506) and passes it to MondayBriefEmail, but the template ignores it (hardcodes its own sign-off around lines 97-105 of MondayBriefEmail.ts).
Fix: Either wire founderLine into the template (use data.founderLine instead of the hardcoded sign-off) or remove the parameter entirely.

**Fix 10: No timezone logic (LOW, document for now)**
Bug: File says "7 AM in practice's local timezone" but all orgs are processed in one batch with zero timezone awareness.
Fix: This is a larger architectural change. For now, add a TODO comment documenting the gap. Long-term: store timezone per org from GBP listing, group orgs by timezone in sendAllMondayEmails.

## After All Fixes

1. Search mondayEmail.ts for \u2014 and \u2013 (em-dashes). Should find zero.
2. Search MondayBriefEmail.ts and CleanWeekEmail.ts for "practice", "doctor", "patient". Should find zero in interface fields and template strings.
3. Run `npx tsc --noEmit` from repo root (backend clean)
4. Run `cd frontend && npx tsc -b --force && npm run build` (frontend clean)
5. Run `bash scripts/preflight-check.sh`
6. If backend is running: POST /api/admin/agent-canon/monday_email/simulate to run the simulation and verify fixes against gold questions

## The Test
Would Chris Olson, the endodontist in California who texted Corey on his birthday saying "I still can't get my head on straight," open this email and feel like someone was watching his business while he slept? Would he feel understood before informed? Would the first sentence make him feel like someone was paying attention to him specifically?

If yes, ship it.
If no, it failed. Do it again.

That's the standard on the wall in Claude's Corner. Every fix you make is measured against it.
