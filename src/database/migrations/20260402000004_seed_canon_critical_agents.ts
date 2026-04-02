/**
 * Seed Canon Governance for 5 Critical Agents -- 100 Gold Questions
 *
 * 20 questions per agent, drawn from three categories:
 *   1. Bugs found (April 2 session) -- geo null, CS Coach event mismatch, zero logins, dupes, wrong MRR
 *   2. Data dependencies (undercover boss audit) -- tables, event types, external APIs
 *   3. Canon compliance (Governance Canon v1.0) -- confidence, citations, freshness, lineage,
 *      Execution Gate, System Conductor, biological-economic lens
 *
 * Gate Packet structure per Canon: verdict, confidence, checks summary, recommendations,
 * artifact refs, citations, lineage, freshness.
 *
 * Not one question generated from imagination. Every question traces to a real failure,
 * a real data dependency, or a real governance standard.
 */

import type { Knex } from "knex";

interface GoldQ {
  id: string;
  question: string;
  expectedAnswer: string;
  actualAnswer: string | null;
  passed: boolean | null;
  testedAt: string | null;
}

function gq(id: string, question: string, expectedAnswer: string): GoldQ {
  return { id, question, expectedAnswer, actualAnswer: null, passed: null, testedAt: null };
}

export async function up(knex: Knex): Promise<void> {
  async function seedCanon(
    slug: string,
    agentKey: string,
    spec: object,
    questions: GoldQ[],
  ) {
    await knex("agent_identities")
      .where({ slug })
      .update({
        agent_key: agentKey,
        canon_spec: JSON.stringify(spec),
        gold_questions: JSON.stringify(questions),
        gate_verdict: "PENDING",
      });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. CLIENT MONITOR -- 20 Gold Questions
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("client_monitor", "client_monitor", {
    purpose: "Daily health scoring for every active/trial org. Classifies GREEN/AMBER/RED based on behavioral_events from last 7 days. RED creates a dream_team_task. AMBER writes a nudge event.",
    expectedBehavior: "Every active or trial org gets a client_health.scored event. RED orgs get a task created (deduplicated). AMBER orgs get a nudge event. GREEN orgs are silent. Classification stored on organizations row.",
    constraints: [
      "Classification thresholds use raw event count, not weighted score",
      "Must not count its own client_health.scored events as engagement",
      "RED task deduplication uses title LIKE match, not idempotency key",
      "Must handle orgs with zero behavioral_events without error",
      "Must not run twice in one day without idempotency guard",
      "No em-dashes in any output string",
      "No dental-specific language (use 'business' not 'practice')",
    ],
    owner: "Corey",
    citations: ["Governance Canon v1.0", "Agent Build Playbook v1.0", "Specialist Sentiment Lattice"],
    lineage: "client_monitor.canon.2026-04-02.v1.0",
    freshness: "2026-04-02",
  }, [
    // ── Category 1: Bugs Found ──
    gq("gq_cm_01",
      "A paying client (subscription_status='active') has never logged in. Zero behavioral_events in last 7 days. What classification do they get, and what action is taken?",
      "RED classification. A dream_team_task is created with priority 'urgent' and owner 'Corey', unless one already exists with the org name in the title. This is the zero-login churn timebomb found in the April 2 audit: all 5 paying clients had lastLogin: 'never'."),
    gq("gq_cm_02",
      "Client Monitor runs at 6 AM. The org had 2 events yesterday, both client_health.scored from the previous day's run. No real user activity. What classification?",
      "Should be RED (no real engagement), but current implementation counts all event types including its own output. Classifies as AMBER (2 events). Known bug: self-referential event inflation."),
    gq("gq_cm_03",
      "An org has 2 events: both one_action.completed (weight 3 each, weighted score = 6). What classification?",
      "AMBER. Classification uses raw eventCount (2), not weighted score (6). Threshold is >= 3 events for GREEN. The weighted score is stored but never used for branching."),
    gq("gq_cm_04",
      "Two orgs: 'Smile Dental' and 'Smile Dental Partners'. First already has RED task. Second goes RED. Does it get its own task?",
      "No. RED task dedup uses title LIKE '%Smile Dental%', which matches both. Second org silently gets no task. Known fragility in substring-based deduplication."),
    gq("gq_cm_05",
      "13 duplicate 'One Endodontics' orgs exist from a signup bug. Client Monitor runs. How many RED tasks are created?",
      "At most 1. After the first RED task is created for 'One Endodontics', all subsequent orgs match the LIKE '%One Endodontics%' check. But all 13 get scored and their client_health_status updated, polluting metrics."),

    // ── Category 2: Data Dependencies ──
    gq("gq_cm_06",
      "What tables must exist and have data for Client Monitor to run successfully?",
      "Required: organizations (subscription_status column), behavioral_events (event_type, org_id, created_at columns). Optional: dream_team_tasks (for RED task creation). If behavioral_events table does not exist, the agent errors on the first org query."),
    gq("gq_cm_07",
      "What event_type does Client Monitor write, and which downstream agents consume it?",
      "Writes: client_health.scored (every org) and client_monitor.amber_nudge (AMBER orgs). Morning Briefing reads behavioral_events broadly. CS Agent checks client_health_status on the organizations row, not the events. Dreamweaver does not consume these."),
    gq("gq_cm_08",
      "The behavioral_events table has 50,000 rows. Client Monitor queries per-org with no index on org_id. What happens?",
      "Full table scan per org. With 33 orgs, that's 33 sequential scans. Performance degrades linearly. The query filters on org_id + created_at >= 7 days ago. An index on (org_id, created_at) would fix this."),
    gq("gq_cm_09",
      "The organizations table has a new subscription_status value: 'paused'. Client Monitor queries for IN ('active', 'trial'). Are paused orgs scored?",
      "No. Paused orgs are silently excluded. If a paused org should still be monitored (they are still paying), the query must be updated. This is a data dependency on the exact enum values."),
    gq("gq_cm_10",
      "Client Monitor writes to agent_results or behavioral_events? Which table does the Dream Team dashboard read?",
      "Writes to behavioral_events. But the Dream Team dashboard's computeAgentHealth function reads from agent_results (agent_type = 'client_monitor'). If Client Monitor only writes to behavioral_events, it appears as 'gray' (no outputs) on the Dream Team board. This is the invisible output bug from the audit."),

    // ── Category 3: Canon Compliance ──
    gq("gq_cm_11",
      "Does Client Monitor's output include confidence, citations, freshness, and lineage as required by the Gate Packet schema?",
      "No. The client_health.scored event properties contain {score, classification, event_count} but no confidence score, no citations array, no freshness timestamp, no lineage reference. This fails the Output Schema mandatory fields check from the Validator Prompt Pack."),
    gq("gq_cm_12",
      "Does Client Monitor pass the Execution Gate? Is its output an action or a suggestion?",
      "Mixed. GREEN = no output (correct). AMBER = writes a nudge event (suggestion that decays). RED = creates a dream_team_task (action that compounds). The AMBER path should have a roadmap to convert to autonomous action per the Execution Gate standard."),
    gq("gq_cm_13",
      "Does the RED classification output use the biological-economic lens (names a human need + dollar consequence)?",
      "No. The dream_team_task title is '{orgName} has not engaged in 7 days' with no human need identified (safety? belonging?) and no dollar consequence (what revenue is at risk at 30/90/365 days). Fails the alloro-context.md requirement."),
    gq("gq_cm_14",
      "Does Client Monitor's output contain em-dashes or dental-specific language?",
      "Must verify. The nudge message and task title should use 'business' not 'practice'. No em-dashes in any string. Violation of standing rules if found."),
    gq("gq_cm_15",
      "Does Client Monitor have a rollback token? If it writes bad data, can it be reversed?",
      "Partially. The client_health_status update on organizations is overwritten daily (self-correcting). But dream_team_tasks are append-only with no cleanup if the classification was wrong. The behavioral_events are append-only by design. No formal rollback mechanism exists."),

    // ── Cross-cutting ──
    gq("gq_cm_16",
      "What happens when Client Monitor runs while the organizations table has 20+ test/smoke orgs (the signup bug duplicates)?",
      "All 20+ test orgs are scored. If subscription_status is 'trial', they get classified and scored, creating noise. dream_team_tasks may be created for test orgs. The agent has no way to distinguish real from test orgs."),
    gq("gq_cm_17",
      "Client Monitor updates organizations.client_health_status. The column update has .catch(() => {}). What happens if the update fails?",
      "Silent failure. The scored event is written to behavioral_events, but the organizations row is not updated. Downstream consumers that read organizations.client_health_status see stale data. No error is logged."),
    gq("gq_cm_18",
      "The agent_key in the schedules table is 'client_monitor'. The slug in agent_identities is 'client_monitor'. Do these match for the Canon gate check?",
      "Yes, but only because they happen to be identical. The checkGateStatus function queries agent_key first, then slug. If someone renamed the schedule's agent_key without updating agent_identities.agent_key, the gate check would fall through to the slug lookup. The agent_key column on agent_identities is the explicit bridge."),
    gq("gq_cm_19",
      "If the Canon gate verdict is PENDING (observe mode), Client Monitor runs but action scopes are denied. What specifically is blocked?",
      "In observe mode, Client Monitor can read organizations, read behavioral_events, and write behavioral_events (client_health.scored). But tasks:write is denied (no RED dream_team_tasks created), organizations:write is denied (no client_health_status update). The agent observes and records findings but cannot act on them."),
    gq("gq_cm_20",
      "Client Monitor runs for org_id=5 (Caswell Endodontics, 37% of MRR). The org has 1 event in 7 days. Classification is AMBER. Is this the right response for the highest-value client?",
      "Technically correct per the threshold (1-2 events = AMBER). But AMBER only writes a nudge event, not a task. For a client representing 37% of revenue with declining engagement, AMBER may be insufficient. The biological-economic lens would flag this: safety need (revenue concentration risk), $4,995/month at stake at 30 days. The scoring does not weight by revenue."),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 2. MONDAY EMAIL -- 20 Gold Questions
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("monday_email", "monday_email", {
    purpose: "Weekly intelligence brief delivered every Monday morning. Synthesizes ranking snapshots, competitor intel, review gaps, referral drift, and activity data into one actionable email per org.",
    expectedBehavior: "Every eligible org gets exactly one email. First-week orgs get checkup findings. Normal orgs get ranking + finding + 5-minute fix. Steady-state orgs get fresh competitive data or activity proof. Failed deliveries write a fallback notification.",
    constraints: [
      "Never send to orgs without an admin user with a valid email",
      "Referral line only after TTFV + first_win_attributed + referral_code",
      "Must handle missing weekly_ranking_snapshots gracefully",
      "Must handle missing behavioral_events table gracefully",
      "Clean week requires ALL three: no finding + position unchanged + no bullets",
      "Feedback loop record after every successful send",
      "No em-dashes in email content",
      "Use vocabulary config terms, never hardcode 'practice' or 'patient'",
    ],
    owner: "Corey",
    citations: ["Governance Canon v1.0", "Specialist Sentiment Lattice", "Knowledge Lattice (Hormozi, Guidara)"],
    lineage: "monday_email.canon.2026-04-02.v1.0",
    freshness: "2026-04-02",
  }, [
    // ── Category 1: Bugs Found ──
    gq("gq_me_01",
      "Monday email has NO cron schedule in the schedules table (found in April 2 audit). What happens on Monday morning?",
      "Nothing. The email does not send. The agent handler exists in the registry, but without a schedules row with agent_key='monday_email' and a cron_expression, the scheduler never picks it up. This was one of 5 critical agents missing schedules entirely."),
    gq("gq_me_02",
      "MRR was showing $17,488 instead of $13,500 on 6 surfaces. Does the Monday email reference MRR or revenue figures? If so, which source does it use?",
      "The Monday email does not display raw MRR. But if the steady-state fallback uses activity-proof counts, those counts could be inflated by test org events. The email should only reference data for the specific org, never aggregate MRR."),
    gq("gq_me_03",
      "Zero paying clients have ever logged in. The Monday email's clean-week detection checks for 'no significant finding + position unchanged + no bullets.' For a client who has never logged in, what email do they get?",
      "If they have ranking snapshots, they get a normal Monday email with rankings data. If position is stable 3+ weeks, steady-state override triggers. The email is sent regardless of login activity. But the 5-minute fix may reference dashboard actions the client has never seen, creating a disconnect."),
    gq("gq_me_04",
      "20+ orgs are test/smoke data. sendAllMondayEmails loops all orgs where subscription_status is active or checkup_score is non-null or onboarding_completed is true. How many test orgs get emails?",
      "Any test org matching those criteria gets an email attempt. If the test org has no admin user or no email, it skips. But test orgs created by the signup bug may have real admin users attached, resulting in emails sent to internal test addresses or real people's addresses associated with test accounts."),

    // ── Category 2: Data Dependencies ──
    gq("gq_me_05",
      "An org signed up 3 days ago with a checkup_score but no weekly_ranking_snapshots. What email do they receive?",
      "First-week email using checkup findings. The code checks: no snapshot AND org < 7 days old AND checkup data exists. If any condition fails, no email. This is the first-week path that uses checkup_data JSON."),
    gq("gq_me_06",
      "What tables must have data for a normal (non-first-week) Monday email to send?",
      "Required: organizations (admin user, email), weekly_ranking_snapshots (at least 1). Used if available: vocabulary_configs (terms), behavioral_events (competitor.movement, activity counts), referral_sources (drift GP detection). All behavioral_events queries are try/catch wrapped in case the table does not exist."),
    gq("gq_me_07",
      "The vocabulary_configs table has no row for this org. What terms appear in the email?",
      "Falls back to 'customer' (instead of org-specific patient/client/member term) and 'the #1 competitor' (instead of the competitor term). The email still sends but uses generic language that may feel impersonal."),
    gq("gq_me_08",
      "Mailgun returns a 500 error on email delivery. What happens?",
      "A fallback notification is written to the notifications table (type: 'monday_brief_fallback', metadata.fallback_reason: 'email_delivery_failed'). If the notifications table does not exist, the fallback is silently skipped. The function returns false. No retry until next Monday."),
    gq("gq_me_09",
      "The referral_sources table does not exist (table was added recently). What happens to the referral line in the email?",
      "The code checks db.schema.hasTable('referral_sources') before querying. If the table does not exist, the referral drift detection is skipped and no referral line appears. The email still sends normally."),
    gq("gq_me_10",
      "An org has 3+ consecutive snapshots at position #4 (steady state). discoverCompetitorsViaPlaces fails because Google Places API key was rotated (Dave's task). What happens?",
      "Falls back to review delta between newest and oldest of 4 snapshots. If delta is zero, falls back to behavioral_events activity counts. If those are also empty, sends a minimal clean-week email. The email always sends something, never fails silently."),

    // ── Category 3: Canon Compliance ──
    gq("gq_me_11",
      "Does the Monday email output include confidence, citations, freshness, and lineage per the Gate Packet schema?",
      "No. The email content has no confidence score, no citations array, no lineage. The feedback loop record (detectActionType + recordEmailOutcome) tracks action type and baseline metric but not in the Gate Packet format. The email itself should carry freshness (data as of date) for the recipient."),
    gq("gq_me_12",
      "Does the Monday email pass the Execution Gate? Is the 5-minute fix an action or a suggestion?",
      "The 5-minute fix is a suggestion: 'Send 3 review requests today.' The email tells the owner what to do but does not do it for them. Per the Execution Gate, this should have a roadmap to convert to autonomous action (auto-send review requests). Currently 100% suggestion, 0% action."),
    gq("gq_me_13",
      "Does the Monday email use the biological-economic lens for its top finding?",
      "Partially. The intelligence.finding events carry humanNeed and economicConsequence if generated by the Intelligence Agent with Claude. But template findings (fallback) do not include human needs. The email should always name the human need and dollar consequence, even in fallback mode."),
    gq("gq_me_14",
      "An org is on trial (ttfv_response is null, no first_win_attributed_at, has referral_code). Does the referral line appear?",
      "No. The referral line gate requires ALL three: ttfv_response === 'yes' AND first_win_attributed_at is set AND referral_code exists. This prevents asking clients to refer before experiencing value."),
    gq("gq_me_15",
      "Does the email content contain em-dashes? Where could they leak in?",
      "Em-dashes could leak from: (1) Claude-generated intelligence.finding text stored in behavioral_events, (2) weekly_ranking_snapshots.bullets generated by rankings_intelligence, (3) hardcoded template strings. The email template itself should strip em-dashes, but no post-processing validation exists."),

    // ── Cross-cutting ──
    gq("gq_me_16",
      "The ANTHROPIC_API_KEY is not set. The steady-state path calls discoverCompetitorsViaPlaces which may call Claude. Does the email still send?",
      "Yes. discoverCompetitorsViaPlaces wraps the Claude call in try/catch. If it fails, falls back to review delta, then activity proof. The main email path does not call Claude directly. The email never fails due to missing API key."),
    gq("gq_me_17",
      "The feedback loop calls recordEmailOutcome after every send. What happens if the feedback_outcomes table does not exist?",
      "The recordEmailOutcome function should handle missing tables gracefully. If it throws, the email was already sent successfully, so the delivery is not affected. But the feedback loop data is lost, which means the Learning Agent cannot calibrate heuristics for this send."),
    gq("gq_me_18",
      "Monday email is scheduled for 7 AM in the practice's local timezone. The org has no timezone set. What happens?",
      "Falls back to UTC or a default timezone. If the schedule itself uses a fixed timezone, the email sends at that time regardless of the org's location. Orgs on the west coast get the email at midnight. The timezone should come from the org's GBP listing or a default."),
    gq("gq_me_19",
      "If the Canon gate is PENDING (observe mode), Monday email runs but email:send scope is denied. What happens?",
      "The agent runs, queries all data, prepares the email content, and records findings to behavioral_events. But the actual Mailgun send is blocked (email:send is an action scope). The feedback loop record is not written because no email was sent. The agent observes but does not deliver."),
    gq("gq_me_20",
      "Does the Monday email respect the System Conductor gate (PASS/HOLD/ESCALATE) before sending?",
      "No. The Monday email calls sendAllMondayEmails directly without routing through the System Conductor. It does not check for client_facing:output scope or Conductor clearance. Per Canon, any client-facing output should pass through the Conductor. This is a governance gap."),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 3. INTELLIGENCE AGENT -- 20 Gold Questions
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("intelligence_agent", "intelligence_agent", {
    purpose: "Daily market intelligence for each org with ranking data. Produces 3 findings per org using the biological-economic lens: names the human need threatened and the dollar consequence at 30/90/365 days.",
    expectedBehavior: "Every org with >= 1 weekly_ranking_snapshot gets 3 intelligence.finding events in behavioral_events. Findings name real competitors, real referral sources, real dollar figures. Falls back to template findings when ANTHROPIC_API_KEY is missing.",
    constraints: [
      "Every finding must have both a human need and a dollar consequence",
      "No em-dashes in any output",
      "Must use real competitor names from ranking data, never fabricated",
      "Must use real referral source names from PMS data, never fabricated",
      "Template fallback must produce usable findings, not empty placeholders",
      "Orgs with no ranking snapshots are skipped, not errored",
      "No dental-specific language in universal contexts",
    ],
    owner: "Corey",
    citations: ["Governance Canon v1.0", "Knowledge Lattice", "Specialist Sentiment Lattice"],
    lineage: "intelligence_agent.canon.2026-04-02.v1.0",
    freshness: "2026-04-02",
  }, [
    // ── Category 1: Bugs Found ──
    gq("gq_ia_01",
      "Intelligence Agent has NO cron schedule in the schedules table (April 2 audit). It is registered in agentRegistry.ts but never dispatched. What happens at 5 AM daily?",
      "Nothing. The handler exists but the scheduler has no row for it. No findings are produced. Monday email may still send using stale intelligence.finding events from previous manual runs, or fall back to template content."),
    gq("gq_ia_02",
      "The agent writes to behavioral_events but the Dream Team dashboard reads from agent_results. Does Intelligence Agent appear as 'green' on the dashboard?",
      "No. computeAgentHealth queries agent_results for agent_type='intelligence_agent'. If Intelligence Agent only writes to behavioral_events, the dashboard shows 'gray' (no outputs). This is the invisible output bug."),
    gq("gq_ia_03",
      "Claude returns findings with em-dashes in the text. The prompt says no em-dashes. What happens?",
      "The JSON parses successfully and findings are written to behavioral_events with em-dashes intact. No post-processing validation strips or rejects them. Em-dashes leak into Monday emails via intelligence.finding events. Standing rule violation."),
    gq("gq_ia_04",
      "13 duplicate 'One Endodontics' orgs exist. All have ranking snapshots. Intelligence Agent runs for all. What happens?",
      "13 sets of 3 findings each = 39 intelligence.finding events written for duplicate orgs. If these orgs share the same GBP listing, the findings are identical. Wastes API tokens (13x Claude calls for the same data) and pollutes behavioral_events."),

    // ── Category 2: Data Dependencies ──
    gq("gq_ia_05",
      "An org has ranking data but no PMS data (no pms_jobs rows). What do the 3 template findings contain?",
      "Finding 1: topCompetitor name + review gap from rankings (or generic monitoring if no competitor). Finding 2: 'Upload your PMS data to unlock referral intelligence' nudge. Finding 3: review velocity message. Agent never fabricates source names."),
    gq("gq_ia_06",
      "The PMS data has column 'Referring source' (not 'Referral Source'). Is it detected?",
      "Yes. PMS source column detection tries three variants: 'Referral Source', 'Referring source', 'referral_source'. Second variant matches. Sources containing 'website' or 'self' are excluded from cold detection."),
    gq("gq_ia_07",
      "Claude returns a response wrapped in markdown code fences (```json ... ```). What happens?",
      "JSON.parse fails. Agent catches silently, falls back to template findings. No error event written. The org still gets findings, but template-based, not AI-synthesized. The prompt instructs raw JSON but LLM compliance is not guaranteed."),
    gq("gq_ia_08",
      "No vocabulary_configs and no vocabulary_defaults for this org's vertical. What case value is used?",
      "DEFAULT_CASE_VALUE of $500. Lookup chain: vocabulary_configs (per org) -> vocabulary_defaults (per vertical) -> $500 hardcoded fallback. Dollar consequences use this value even when it may not reflect actual economics."),
    gq("gq_ia_09",
      "ANTHROPIC_API_KEY is not set. What happens?",
      "Logs a message and uses template findings for all orgs. No error thrown. Template findings use real competitor names and review data from rankings, so they are not empty. But they lack the biological-economic lens sophistication of Claude-generated findings."),
    gq("gq_ia_10",
      "The weekly_ranking_snapshots table has data for org 5, but practice_rankings has no 'completed' rows. What context is available?",
      "The snapshot provides position, bullets, competitor data, and dollar figure. But practice_rankings (raw competitor details, review counts) is empty, so topCompetitor may be null and review gap data missing. The agent still runs but findings are less specific."),
    gq("gq_ia_11",
      "What external APIs must respond for Intelligence Agent to produce Claude-generated findings?",
      "Anthropic API (Claude). Google Places is not called by Intelligence Agent directly (that is the ranking agent's job). Intelligence Agent reads pre-computed data from weekly_ranking_snapshots and practice_rankings. Only one external dependency: Anthropic."),

    // ── Category 3: Canon Compliance ──
    gq("gq_ia_12",
      "Does the intelligence.finding event include confidence, citations, freshness, and lineage?",
      "No. The event properties are {headline, detail, humanNeed, economicConsequence}. Missing: confidence score (how sure is the agent?), citations (what data sources informed this?), freshness (when was the underlying data collected?), lineage (which model/version produced this?). Fails Gate Packet Output Schema."),
    gq("gq_ia_13",
      "Does the output pass the biological-economic lens? Does every finding name a human need AND a dollar consequence?",
      "Claude-generated findings: yes, the prompt enforces this. Template findings: partially. The template builds dollar figures from review gap * case value, but does not explicitly name the human need (safety, belonging, purpose, status). Template findings fail the lens."),
    gq("gq_ia_14",
      "Does Intelligence Agent pass the Execution Gate? Are its findings actions or suggestions?",
      "Suggestions. The findings tell the owner what is happening but do not take action. 'Your competitor gained 5 reviews' is data. The agent should have a roadmap to convert top findings into autonomous actions (e.g., auto-trigger review request campaign when competitor gains reviews)."),
    gq("gq_ia_15",
      "Does the agent route through the System Conductor before writing client-facing output?",
      "No. Intelligence Agent writes intelligence.finding events directly to behavioral_events without Conductor clearance. These findings flow into Monday email (client-facing). Per Canon, any output that reaches clients should pass PASS/HOLD/ESCALATE gate."),
    gq("gq_ia_16",
      "The Canon requires >= 20 Gold Questions per agent. Intelligence Agent has this many?",
      "Yes, this set provides exactly 20. The original code implementation had zero. The Canon (Oct 2025) was never followed for this agent."),

    // ── Cross-cutting ──
    gq("gq_ia_17",
      "If Canon gate is PENDING (observe mode), Intelligence Agent runs. It writes intelligence.finding events. Are those observation (allowed) or action (blocked)?",
      "Writing to behavioral_events is observation (behavioral_events:write scope is not an action scope). So all 3 findings are written successfully. The agent is fully functional in observe mode because its only output is behavioral_events. This is correct: the bench player is learning."),
    gq("gq_ia_18",
      "closeLoop reports a learning signal when fewer than 3 findings are produced. What happens if the org has no competitors and no PMS data?",
      "All 3 template findings use fallback text (generic monitoring, PMS nudge, review velocity). closeLoop receives all 3 findings and reports success. But the quality signal is misleading: 3 template findings scored the same as 3 Claude-synthesized findings."),
    gq("gq_ia_19",
      "The agent_key in the schedules table would be 'intelligence_agent'. The slug is 'intelligence_agent'. But the agentRegistry.ts key is also 'intelligence_agent'. Do all three match?",
      "Yes. But the agentRegistry key, the schedules.agent_key, and the agent_identities.slug must all align for the Canon gate check to work. If any are mismatched (the agent_key mapping bug from the audit), the gate check falls through to the slug lookup or fails entirely."),
    gq("gq_ia_20",
      "Intelligence Agent calls prepareAgentContext without an orgId (global context, not per-org). If the orchestrator blocks the run, what happens?",
      "Returns null immediately. No findings written for any org. No error logged to behavioral_events. The entire daily run is silently skipped. The next day's run is independent."),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 4. DREAMWEAVER -- 20 Gold Questions
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("dreamweaver", "dreamweaver", {
    purpose: "Daily hospitality moments (Will Guidara inspired). Finds one personalized gesture per org that makes the business owner feel seen. Fires after Client Monitor so health data is fresh.",
    expectedBehavior: "Each eligible org gets at most 1 moment per 7-day window. Moments written to both notifications table (user-visible) and behavioral_events (audit trail). Single best moment selected from 6 priority-ordered detectors.",
    constraints: [
      "Max 1 moment per org per 7 days (rate limited via behavioral_events query)",
      "Must run after Client Monitor (depends on fresh health data)",
      "Tone adapts based on account age via toneEvolution",
      "90-day milestone uses 3-day window (days 89-91) and must not fire twice",
      "Must never fabricate review content or milestone details",
      "No em-dashes in moment messages",
    ],
    owner: "Corey",
    citations: ["Governance Canon v1.0", "Knowledge Lattice (Guidara/Unreasonable Hospitality)", "Specialist Sentiment Lattice"],
    lineage: "dreamweaver.canon.2026-04-02.v1.0",
    freshness: "2026-04-02",
  }, [
    // ── Category 1: Bugs Found ──
    gq("gq_dw_01",
      "A 5-star review comes in, but the rating is stored as string '5' (not number 5) in behavioral_events properties. Does Dreamweaver detect it?",
      "No. Detection uses props.rating === 5 (strict equality). String '5' !== number 5. The review moment silently fails to trigger. Type coercion bug depending on how upstream review ingestion stores the value."),
    gq("gq_dw_02",
      "A client last visited the dashboard 10 days ago, then returns today. How does welcome_back calculate days away?",
      "Incorrectly. The code computes daysSinceReturn as the difference between fortyEightHoursAgo and the previous visit, not between now and the previous visit. A 10-day gap reports as ~8 days. Off-by-2 error."),
    gq("gq_dw_03",
      "All 5 paying clients have never logged in (zero dashboard.viewed events). Does the welcome_back moment ever fire for them?",
      "Never. welcome_back requires a recent dashboard.viewed event (within 48h) AND a previous visit more than 7 days before that. Zero logins means zero dashboard.viewed events. These clients will never trigger a welcome_back moment."),
    gq("gq_dw_04",
      "Dreamweaver writes to both notifications and behavioral_events. The Dream Team dashboard reads from agent_results. Does Dreamweaver show as 'green'?",
      "No. computeAgentHealth queries agent_results for agent_type='dreamweaver'. If Dreamweaver only writes to notifications + behavioral_events, it appears 'gray' on the dashboard. Same invisible output bug as other agents."),

    // ── Category 2: Data Dependencies ──
    gq("gq_dw_05",
      "What event types must exist in behavioral_events for each of the 6 moment detectors to fire?",
      "1: milestone.achieved (with milestone_type: rank_up/passed_competitor/review_count_milestone). 2: review.received (with rating === 5). 3: competitor.movement (with direction === 'client_gaining'). 4: dashboard.viewed (current + previous with 7+ day gap). 5: organizations.created_at (89-91 days ago). 6: referral.converted. Each depends on upstream agents writing the correct event_type and properties."),
    gq("gq_dw_06",
      "The notifications table does not exist. What happens?",
      "The notification insert fails. The .catch() logs the error but continues. The behavioral_events insert may succeed. The moment is counted in momentsCreated (incremented before write). The rate limit check queries behavioral_events (not notifications), so rate limiting still works."),
    gq("gq_dw_07",
      "90-day milestone: the org was created exactly 90 days ago. But a review moment fired 5 days ago. Does the milestone fire?",
      "No. The 7-day rate limit check finds the review moment (5 days < 7 days). The org is skipped. Tomorrow (day 91) the rate limit has not expired (6 days). Day 92 (7 days since review) the rate limit expires, but day 92 is outside the 89-91 window. The 90-day milestone is permanently missed."),
    gq("gq_dw_08",
      "Notifications insert succeeds but behavioral_events insert fails. What happens to rate limiting?",
      "The user sees the notification, but rate limiting (which queries behavioral_events) does not register this moment. The org could get a second moment within 7 days. Rate limit hole."),
    gq("gq_dw_09",
      "What external APIs does Dreamweaver depend on?",
      "None directly. All data comes from behavioral_events and organizations tables. No Google Places, no Anthropic, no Mailgun. This is a purely database-driven agent. But it depends on upstream agents (Client Monitor, ranking agent, review ingestion) having written the correct event types."),

    // ── Category 3: Canon Compliance ──
    gq("gq_dw_10",
      "Does the dreamweaver.moment_created event include confidence, citations, freshness, and lineage?",
      "No. Properties contain {moment_type, title, message}. No confidence score for the moment detection. No citations (which data triggered it). No freshness. No lineage. Fails Gate Packet Output Schema."),
    gq("gq_dw_11",
      "Does Dreamweaver pass the Execution Gate? Is a hospitality moment an action or a suggestion?",
      "Action. The notification is delivered directly to the client. No human approval needed. This is correct per the Execution Gate: actions compound. But the notification content should be reviewed by the System Conductor before delivery (client-facing output)."),
    gq("gq_dw_12",
      "Does Dreamweaver route through the System Conductor before writing to the notifications table?",
      "No. Moments are written directly to notifications without PASS/HOLD/ESCALATE review. Per Canon, any client_facing:output should pass through the Conductor. A badly crafted moment (wrong milestone, fabricated stat) goes directly to the client."),
    gq("gq_dw_13",
      "Does the moment message use the biological-economic lens?",
      "No. Messages are hospitality-focused ('Congratulations on reaching #3!') but do not name the human need (status, belonging) or dollar consequence. The biological-economic lens says a finding without both is data, not intelligence. Hospitality moments are not findings, but they could be stronger with economic context."),
    gq("gq_dw_14",
      "Does the tone adaptation respect the Specialist Sentiment Lattice phases?",
      "Partially. toneEvolution uses account age to set formality ('familiar' vs formal). But it does not reference the Sentiment Lattice phases (Acquisition, Activation, Retention, Expansion). A client in Retention phase should get different messaging than one in Activation, regardless of account age."),

    // ── Cross-cutting ──
    gq("gq_dw_15",
      "closeLoop's learning signal says 'Top types: 2' instead of listing actual moment types. Why?",
      "The closeLoop call incorrectly reuses summary.momentsCreated (a number) as the learning description. It says 'Top types: 2' (the count) instead of 'Top types: milestone, review' (the actual types). The Learning Agent receives garbage data for heuristic calibration."),
    gq("gq_dw_16",
      "If Canon gate is PENDING, Dreamweaver runs in observe mode. It tries to write to notifications (client_facing:output scope). What happens?",
      "client_facing:output is an action scope, denied in observe mode. The notification is not written. The behavioral_events write (dreamweaver.moment_created) may still succeed if the agent does not check scope before the behavioral_events insert. The agent effectively detects moments but does not deliver them."),
    gq("gq_dw_17",
      "What is the maximum number of moments Dreamweaver can produce in a single daily run across all orgs?",
      "One per eligible org. With 33 orgs, up to 33 moments. But rate limiting (max 1 per org per 7 days) means most orgs are skipped on any given day. In practice, 3-5 moments per run for a 33-org account base."),
    gq("gq_dw_18",
      "The referral.converted detector: an org refers another org that signs up. How does Dreamweaver know which org to credit?",
      "It queries behavioral_events for event_type='referral.converted' for each org. The event must have org_id set to the referring org. If the referral tracking system writes the event against the referred org instead, Dreamweaver credits the wrong org."),
    gq("gq_dw_19",
      "Does the craftMilestoneMessage function use vocabulary config terms (customer vs patient vs client)?",
      "Must verify. If it hardcodes 'patient' or 'practice', it violates the universality rule. A barber receiving 'Congratulations on your patient milestone!' would be confused. The message should use the org's vocabulary config terms."),
    gq("gq_dw_20",
      "The Canon requires >= 20 Gold Questions. The original code had zero. How many bug categories does this set cover?",
      "Three: (1) bugs found in April 2 session (type coercion, off-by-2, invisible output, zero logins), (2) data dependencies (event types, table existence, rate limit holes, upstream agent requirements), (3) Canon compliance (missing Gate Packet fields, no Conductor gate, no bio-econ lens, no Sentiment Lattice phases)."),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 5. CS AGENT -- 20 Gold Questions
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("cs_agent", "cs_agent", {
    purpose: "Daily proactive customer success interventions. Detects 4 trigger conditions: stalled onboarding (no GBP after 48h), short sessions (<10s for 3 days), feature non-adoption (has rankings but never viewed), billing friction (trial expiring in 7 days).",
    expectedBehavior: "Scans all active/trial orgs. For each trigger detected, writes cs.proactive_intervention event with trigger_type, suggested_action, and message. Rate-limited to 1 intervention per org per 7 days.",
    constraints: [
      "Rate limit: max 1 intervention per org per 7 days",
      "Must not fire on orgs with recent CS contact (checks cs.chat_response and cs.intervention)",
      "Event type must be consistent with downstream consumers (CS Coach queries cs_agent.% prefix)",
      "Must handle orgs with zero behavioral_events without error",
      "Billing friction trigger only for trial orgs, never active subscriptions",
      "No em-dashes in intervention messages",
      "Use vocabulary config terms, not dental-specific language",
    ],
    owner: "Corey",
    citations: ["Governance Canon v1.0", "Specialist Sentiment Lattice (Retention/Activation phases)", "Agent Trust Protocol"],
    lineage: "cs_agent.canon.2026-04-02.v1.0",
    freshness: "2026-04-02",
  }, [
    // ── Category 1: Bugs Found ──
    gq("gq_cs_01",
      "CS Agent writes event_type 'cs.proactive_intervention'. CS Coach queries 'cs_agent.%' (LIKE prefix). Does CS Coach see the intervention?",
      "No. 'cs_agent.' does not match 'cs.'. CS Coach finds zero events every run. The coach has never analyzed a single CS intervention. This is a live event type mismatch found in the April 2 audit."),
    gq("gq_cs_02",
      "The rate limit checks for cs.chat_response and cs.intervention events. CS Agent writes cs.proactive_intervention. Does the agent rate-limit itself?",
      "No. cs.proactive_intervention does not match cs.chat_response or cs.intervention. The agent's own output does not trigger rate limiting. Without manual CS events, the same org gets an intervention every single day."),
    gq("gq_cs_03",
      "CS Agent writes to behavioral_events. The Dream Team dashboard reads agent_results. Does CS Agent show as 'green'?",
      "No. computeAgentHealth queries agent_results for agent_type='cs_agent'. CS Agent only writes to behavioral_events. Dashboard shows 'gray'. Same invisible output bug as all other agents."),
    gq("gq_cs_04",
      "Zero paying clients have logged in. Feature non-adoption trigger checks for 'never viewed rankings page.' All 5 paying clients have never viewed anything. Does the trigger fire for all 5?",
      "Only if they also have practice_rankings data. The trigger requires: has rankings data (rankings have been run for this org) AND never viewed rankings page. If rankings have not been run, the trigger does not fire. But for orgs where the ranking agent has processed data, yes, all would trigger."),

    // ── Category 2: Data Dependencies ──
    gq("gq_cs_05",
      "What tables must exist for CS Agent to run all 4 triggers?",
      "organizations (subscription_status, created_at, gbp_connected_at, trial_expires_at). behavioral_events (for session duration, page views, cs.chat_response/cs.intervention rate limit check). practice_rankings (for feature non-adoption). If behavioral_events does not exist, all triggers except billing friction fail."),
    gq("gq_cs_06",
      "Stalled onboarding checks gbp_connected_at on the organizations row. If the column does not exist, what happens?",
      "The query silently returns null for gbp_connected_at. Every org appears to have no GBP connection. The stalled onboarding trigger fires for EVERY org older than 48 hours, flooding behavioral_events with false interventions."),
    gq("gq_cs_07",
      "Short sessions trigger: checks for sessions < 10s for 3 consecutive days. What event type tracks session duration?",
      "Must be a behavioral_event with session duration in properties (e.g., 'session.ended' with duration_seconds). If the frontend does not emit session duration events, this trigger can never fire. The dependency is on frontend instrumentation, not just backend tables."),
    gq("gq_cs_08",
      "Billing friction: trial_expires_at is within 7 days. An active subscriber has a stale trial_expires_at from their trial period. Does the trigger fire?",
      "Depends on implementation. If the trigger checks subscription_status === 'trial' before evaluating trial_expires_at, the active subscriber is correctly excluded. If it only checks date proximity, false positive."),
    gq("gq_cs_09",
      "Feature non-adoption: 'has rankings data but never viewed rankings page.' How is 'never viewed' determined?",
      "Queries behavioral_events for 'rankings.viewed' or 'dashboard.viewed' with page context. Zero results = never viewed. Depends on frontend correctly writing the event when rankings page renders. If event_type name does not match, trigger either always fires (false positives) or never fires."),
    gq("gq_cs_10",
      "The schedules table has agent_key='cs_agent'. The agent_identities slug is 'cs_agent'. Do these match for Canon gate check?",
      "Yes. But the agentRegistry key is also 'cs_agent'. All three must match. The agent_key mapping bug from the audit could affect this agent if any of the three values diverge."),

    // ── Category 3: Canon Compliance ──
    gq("gq_cs_11",
      "Does the cs.proactive_intervention event include confidence, citations, freshness, and lineage?",
      "No. Properties contain {trigger_type, suggested_action, message, org_name}. No confidence score (how sure is the trigger?), no citations (what data threshold was crossed?), no freshness, no lineage. Fails Gate Packet Output Schema."),
    gq("gq_cs_12",
      "Does CS Agent pass the Execution Gate? Is the intervention an action or a suggestion?",
      "Suggestion. The event contains a suggested_action ('Send onboarding reminder email') but does not execute it. The suggestion decays if ignored. Per the Execution Gate, the top 3 suggestions should have a roadmap to become autonomous actions."),
    gq("gq_cs_13",
      "Does the intervention message use the biological-economic lens?",
      "No. Messages like 'Client has not connected GBP after 48 hours' identify the symptom but not the human need (purpose: they bought the business for freedom, not more to-do items) or the dollar consequence (30-day: missed checkup window, 90-day: churn risk)."),
    gq("gq_cs_14",
      "Does CS Agent route through the System Conductor?",
      "No. cs.proactive_intervention events are written directly without Conductor clearance. If these events trigger downstream actions (CS Coach recommendations, task creation), those actions bypass the Conductor too. Governance gap."),
    gq("gq_cs_15",
      "Does the agent respect Agent Trust Protocol rule #1 (client safety gates all)?",
      "Partially. The interventions are internal (not client-facing directly). But if an intervention message is surfaced to the client (e.g., through a notification or CS email), it should pass the safety gate. Currently no mechanism ensures this."),

    // ── Cross-cutting ──
    gq("gq_cs_16",
      "An org signed up 47 hours ago without GBP. Stalled onboarding threshold is 48 hours. Does the trigger fire?",
      "No. At 47 hours, threshold not crossed. Next daily run is ~24 hours later (~71 hours). Trigger fires then. This is correct behavior but means 23 hours of delay between threshold crossing and detection."),
    gq("gq_cs_17",
      "If Canon gate is PENDING (observe mode), CS Agent runs. It tries to write cs.proactive_intervention. Is this allowed?",
      "Yes. Writing to behavioral_events uses behavioral_events:write scope, which is an observation scope (not action). The intervention event is written. But if CS Agent also creates tasks or sends emails as follow-up actions, those would be blocked (tasks:write, email:send are action scopes)."),
    gq("gq_cs_18",
      "CS Agent writes cs.proactive_intervention. Which downstream agents consume this event type?",
      "CS Coach should consume it but queries the wrong prefix (cs_agent.% instead of cs.). Morning Briefing reads behavioral_events broadly and would include it. Dreamweaver does not consume CS events. Learning Agent calibrates from all agent outputs but has no specific CS heuristics. Effectively, no downstream agent successfully consumes CS Agent output."),
    gq("gq_cs_19",
      "The Canon requires >= 20 Gold Questions. CS Agent's original code had zero Gold Questions, zero Registry entry, zero Prompt Pack, zero Output Schema. How many Canon artifacts are now present?",
      "After this build: Canon spec (1), Gold Questions (20), gate verdict (PENDING). Still missing from the full Canon v1.0 lifecycle: Agent Registry Notion row, Agent Build Playbook entry, Prompt Pack (JSON: system/developer/user_template/constraints/safety), Output Schema (JSON: mandatory fields), Confirm Gate sign-off, Pilot log. The database Canon is a simplified subset (3 sections vs 7 artifacts)."),
    gq("gq_cs_20",
      "If the CS Agent event type is fixed to 'cs_agent.proactive_intervention' (matching CS Coach's filter), what else needs to change?",
      "Three things: (1) The rate limit check must also query for 'cs_agent.proactive_intervention' so the agent can rate-limit itself. (2) Any existing 'cs.proactive_intervention' events in behavioral_events become orphaned (old format). (3) The new event type should be documented in the Canon spec as the canonical event type for this agent. The event type is a contract, not a string."),
  ]);
}

export async function down(knex: Knex): Promise<void> {
  const slugs = [
    "client_monitor",
    "monday_email",
    "intelligence_agent",
    "dreamweaver",
    "cs_agent",
  ];

  for (const slug of slugs) {
    await knex("agent_identities")
      .where({ slug })
      .update({
        agent_key: null,
        canon_spec: JSON.stringify({}),
        gold_questions: JSON.stringify([]),
        gate_verdict: "PENDING",
        gate_date: null,
        gate_expires: null,
      });
  }
}
