/**
 * Seed Canon Governance for 5 Critical Agents
 *
 * Real specs and real Gold Questions that would catch the bugs
 * we found today. These are not placeholders.
 *
 * client_monitor, monday_email, intelligence_agent, dreamweaver, cs_agent
 */

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Helper: update an agent_identities row by slug
  async function seedCanon(
    slug: string,
    agentKey: string,
    spec: object,
    questions: object[],
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
  // 1. CLIENT MONITOR
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("client_monitor", "client_monitor", {
    purpose: "Daily health scoring for every active/trial org. Classifies GREEN/AMBER/RED based on behavioral_events from last 7 days. RED creates a dream_team_task. AMBER writes a nudge event.",
    expectedBehavior: "Every active or trial org gets a client_health.scored event. RED orgs get a task created (deduplicated). AMBER orgs get a nudge event. GREEN orgs are silent. The classification is stored on the organizations row.",
    constraints: [
      "Classification thresholds use raw event count, not weighted score",
      "Must not count its own client_health.scored events as engagement",
      "RED task deduplication uses title LIKE match, not idempotency key",
      "Must handle orgs with zero behavioral_events without error",
      "Must not run twice in one day without idempotency guard",
    ],
    owner: "Corey",
  }, [
    {
      id: "gq_cm_01",
      question: "A paying client (subscription_status='active') has never logged in. They have zero behavioral_events in the last 7 days. What classification do they get, and what action is taken?",
      expectedAnswer: "RED classification. A dream_team_task is created with priority 'urgent' and owner 'Corey', unless one already exists with the org name in the title.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_cm_02",
      question: "Client Monitor runs at 6 AM. The org had 2 events yesterday: both were client_health.scored events from the previous day's run. No real user activity. What classification do they get?",
      expectedAnswer: "The org should be RED (no real engagement), but the current implementation counts all event types including its own output events. It will classify as AMBER (2 events). This is a known gap: the agent's own events inflate future scores.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_cm_03",
      question: "An org has 2 events: both are one_action.completed (weight 3 each, total weighted score = 6). What classification do they receive?",
      expectedAnswer: "AMBER. Classification uses raw eventCount (2), not weighted score (6). The threshold is >= 3 events for GREEN. The weighted score is stored in the event properties but does not affect the GREEN/AMBER/RED decision.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_cm_04",
      question: "What event_type does Client Monitor write to behavioral_events, and which downstream agents consume it?",
      expectedAnswer: "Writes client_health.scored (for every org) and client_monitor.amber_nudge (for AMBER orgs). Morning Briefing consumes behavioral_events broadly. Dreamweaver does not consume these. CS Agent does not consume these directly but checks client_health_status on the organizations row.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_cm_05",
      question: "Two orgs exist: 'Smile Dental' and 'Smile Dental Partners'. The first already has a RED task. The second goes RED today. Does it get its own task or is it blocked by the first org's task?",
      expectedAnswer: "Blocked. The RED task deduplication uses title LIKE '%Smile Dental%', which matches both org names. The second org will not get a task created. This is a known fragility in the substring-based deduplication.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 2. MONDAY EMAIL
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("monday_email", "monday_email", {
    purpose: "Weekly intelligence brief delivered every Monday morning. Synthesizes ranking snapshots, competitor intel, review gaps, referral drift, and activity data into one actionable email per org.",
    expectedBehavior: "Every eligible org gets exactly one email. First-week orgs get checkup findings. Normal orgs get ranking + finding + 5-minute fix. Steady-state orgs (3+ weeks same position) get fresh competitive data or activity proof. Clean weeks get a short reassurance email. Failed deliveries write a fallback notification.",
    constraints: [
      "Never send to orgs without an admin user with a valid email",
      "Referral line only appears after TTFV + first_win_attributed + referral_code",
      "Must handle missing weekly_ranking_snapshots gracefully",
      "Must handle missing behavioral_events table gracefully",
      "Clean week detection requires ALL three conditions (no finding + position unchanged + no bullets)",
      "Feedback loop record must be written after every successful send",
    ],
    owner: "Corey",
  }, [
    {
      id: "gq_me_01",
      question: "An org signed up 3 days ago. They have a checkup_score but no weekly_ranking_snapshots. What email do they receive?",
      expectedAnswer: "First-week email using checkup findings (score, top opportunities from checkup_data). The code checks: no snapshot AND org created within 7 days AND checkup data exists. If any of those fail, no email is sent.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_me_02",
      question: "An org has been active for 3 weeks. Their ranking position has been #4 for all 3 snapshots. What happens?",
      expectedAnswer: "Steady-state override triggers (3+ consecutive same position). The agent first tries to fetch fresh competitive data via discoverCompetitorsViaPlaces + generateSurpriseFindings. If that fails or returns nothing, it falls back to review delta between newest and oldest of 4 snapshots. If that is also zero, it queries behavioral_events for activity counts (competitor/review+source/directory+scan events) and sends an 'activity proof' email showing the system is working even when position is stable.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_me_03",
      question: "An org is on a trial. They have not completed TTFV (ttfv_response is null). They have a referral_code. Does the referral line appear in their Monday email?",
      expectedAnswer: "No. The referral line gate requires ALL three: ttfv_response === 'yes' AND first_win_attributed_at is set AND referral_code exists. Missing any one blocks the referral line. This prevents asking clients to refer before they have experienced value.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_me_04",
      question: "The ANTHROPIC_API_KEY is not set. The org has ranking data. What happens to the email content?",
      expectedAnswer: "The email still sends. The ranking snapshot already contains pre-generated bullets and findings from the rankings_intelligence agent. Monday email does not call Claude directly for the main email body. However, the steady-state path calls discoverCompetitorsViaPlaces which may use the API. If that fails, it falls back to template content. The email never fails silently due to missing API key.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_me_05",
      question: "Email delivery to Mailgun fails with a 500 error. What happens to the org?",
      expectedAnswer: "A fallback notification is written to the notifications table with type 'monday_brief_fallback' and metadata.fallback_reason 'email_delivery_failed'. If the notifications table does not exist, the fallback is silently skipped. The function returns false (not sent). The org is NOT retried automatically; the next attempt is next Monday.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 3. INTELLIGENCE AGENT
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("intelligence_agent", "intelligence_agent", {
    purpose: "Daily market intelligence for each org with ranking data. Produces 3 findings per org using the biological-economic lens: names the human need threatened (safety, belonging, purpose, status) and the dollar consequence at 30/90/365 days.",
    expectedBehavior: "Every org with at least 1 weekly_ranking_snapshot gets 3 intelligence.finding events written to behavioral_events. Findings must name real competitors, real referral sources, and real dollar figures. Falls back to template findings when ANTHROPIC_API_KEY is missing.",
    constraints: [
      "Every finding must have both a human need and a dollar consequence (the biological-economic lens)",
      "No em-dashes in any output",
      "Must use real competitor names from ranking data, never fabricated names",
      "Must use real referral source names from PMS data, never fabricated sources",
      "Template fallback must produce usable findings, not empty placeholders",
      "Orgs with no ranking snapshots are skipped entirely, not errored",
    ],
    owner: "Corey",
  }, [
    {
      id: "gq_ia_01",
      question: "An org has ranking data but no PMS data uploaded (no pms_jobs rows). What do the 3 template findings contain?",
      expectedAnswer: "Finding 1: uses topCompetitor name and review gap from ranking data (or generic monitoring message if no competitor). Finding 2: falls back to 'Upload your PMS data to unlock referral intelligence' nudge since topReferralSources is empty. Finding 3: falls back to a review velocity message since coldReferralSources is empty. The agent never fabricates source names.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_ia_02",
      question: "The PMS data has a column named 'Referring source' (not 'Referral Source'). Does the agent detect it?",
      expectedAnswer: "Yes. The PMS source column detection tries three variants in order: 'Referral Source', 'Referring source', 'referral_source'. The second variant matches. Sources containing 'website' or 'self' are excluded from cold source detection.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_ia_03",
      question: "Claude returns a response that is valid JSON but contains em-dashes in the finding text. What happens?",
      expectedAnswer: "The JSON parses successfully and the findings are written to behavioral_events with em-dashes intact. The prompt instructs Claude not to use em-dashes, but there is no post-processing validation that strips or rejects em-dashes in the response. This means em-dashes can leak into Monday emails via intelligence.finding events.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_ia_04",
      question: "An org has no vocabulary_configs and no vocabulary_defaults for its vertical. What case value is used in dollar consequence calculations?",
      expectedAnswer: "DEFAULT_CASE_VALUE of 500. The lookup chain is: vocabulary_configs (per org) -> vocabulary_defaults (per vertical) -> hardcoded $500 fallback. Dollar consequences are calculated using this value even when it may not reflect the org's actual economics.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_ia_05",
      question: "Claude returns a response wrapped in markdown code fences (```json ... ```). What happens?",
      expectedAnswer: "JSON.parse fails on the markdown-fenced response. The agent catches the error silently and falls back to template findings. No error event is written. The org still gets findings, but they are template-based, not AI-synthesized. The prompt says 'return raw JSON array, no markdown fences' but this is a known LLM compliance gap.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 4. DREAMWEAVER
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("dreamweaver", "dreamweaver", {
    purpose: "Daily hospitality moments inspired by Will Guidara. Finds one personalized gesture per org that makes the business owner feel seen. Fires after Client Monitor so health data is fresh.",
    expectedBehavior: "Each eligible org gets at most 1 moment per 7-day window. Moments are written to both the notifications table (user-visible) and behavioral_events (audit trail). The single best moment is selected from 6 priority-ordered detectors.",
    constraints: [
      "Max 1 moment per org per 7 days (rate limited)",
      "Must run after Client Monitor (depends on fresh health data)",
      "Tone adapts based on account age via toneEvolution",
      "90-day milestone uses a 3-day window (days 89-91) and must not fire twice",
      "Must never fabricate review content or milestone details",
    ],
    owner: "Corey",
  }, [
    {
      id: "gq_dw_01",
      question: "A 5-star review comes in, but the rating is stored as the string '5' (not the number 5) in behavioral_events properties. Does Dreamweaver detect it?",
      expectedAnswer: "No. The detection uses props.rating === 5 (strict equality). The string '5' does not equal the number 5 in JavaScript strict comparison. The review moment silently fails to trigger. This is a type coercion bug that depends on how the upstream review ingestion stores the rating value.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_dw_02",
      question: "A client last visited the dashboard 10 days ago, then returns today. How does the welcome_back moment calculate the days-away count?",
      expectedAnswer: "Incorrectly. The code computes daysSinceReturn as the difference between fortyEightHoursAgo and the previous visit, not between now and the previous visit. This means the reported days-away count is off by approximately 2 days. A 10-day gap would display as roughly 8 days.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_dw_03",
      question: "An org was created exactly 90 days ago. The agent ran yesterday (day 89) and did not fire the 90-day milestone because of rate limiting from a review moment 5 days ago. Today (day 90) it runs again. Does the 90-day milestone fire?",
      expectedAnswer: "It depends on whether the 5-day-old moment falls within the 7-day rate limit window. 5 days ago is within 7 days, so the org is still rate-limited. The 90-day milestone will not fire today. Tomorrow (day 91) is the last day in the 89-91 window, and the rate limit will have expired (8 days since last moment). If the agent runs on day 91, the milestone fires. If it misses day 91 (agent downtime), the window is lost forever.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_dw_04",
      question: "The notifications table insert succeeds but the behavioral_events insert fails. What happens?",
      expectedAnswer: "The user sees the notification (it was written), but there is no audit trail in behavioral_events. The moment is counted in the summary (momentsCreated increments before the behavioral_events write). The 7-day rate limit check queries behavioral_events, not notifications, so the rate limit will NOT catch this moment. The org could get a second moment within 7 days.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_dw_05",
      question: "What event_type does Dreamweaver write, and does any downstream agent consume it?",
      expectedAnswer: "Writes dreamweaver.moment_created. Morning Briefing reads behavioral_events broadly and would include it in the daily synthesis. The 90-day milestone deduplication queries for its own event type with moment_type='90_day_milestone' in properties. No other agent explicitly queries for dreamweaver events. The Learning Agent calibrates from all agent outputs but does not have specific heuristics for Dreamweaver moments.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 5. CS AGENT
  // ═══════════════════════════════════════════════════════════════════

  await seedCanon("cs_agent", "cs_agent", {
    purpose: "Daily proactive customer success interventions. Detects 4 trigger conditions: stalled onboarding (no GBP after 48h), short sessions (<10s for 3 days), feature non-adoption (has rankings but never viewed), billing friction (trial expiring in 7 days). Writes intervention events for each triggered org.",
    expectedBehavior: "Scans all active/trial orgs. For each trigger detected, writes a cs.proactive_intervention event with trigger_type, suggested_action, and message. Rate-limited to 1 intervention per org per 7 days.",
    constraints: [
      "Rate limit: max 1 intervention per org per 7 days",
      "Must not fire on orgs that have had recent CS contact (checks cs.chat_response and cs.intervention events)",
      "Event type must be consistent with downstream consumers (CS Coach queries for cs_agent.% prefix)",
      "Must handle orgs with zero behavioral_events without error",
      "Billing friction trigger must only fire for trial orgs, never active subscriptions",
    ],
    owner: "Corey",
  }, [
    {
      id: "gq_cs_01",
      question: "CS Agent writes an intervention event. CS Coach runs its weekly analysis. Does CS Coach see the intervention? What event_type does each agent use?",
      expectedAnswer: "No. CS Agent writes event_type 'cs.proactive_intervention'. CS Coach queries for events matching 'cs_agent.%' (LIKE prefix). The prefix 'cs_agent.' does not match 'cs.' so CS Coach finds zero events. The coach has never analyzed a single CS intervention. This is a live event type mismatch bug.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_cs_02",
      question: "An org signed up 47 hours ago and has not connected GBP. Does the stalled onboarding trigger fire?",
      expectedAnswer: "No. The threshold is 48 hours since org creation without GBP connection. At 47 hours, the org has not crossed the threshold. The trigger fires at 48+ hours. This is a boundary condition: the org must be checked again at the next daily run (24 hours later, at ~71 hours) to trigger.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_cs_03",
      question: "The rate limit check queries for cs.chat_response and cs.intervention events, but CS Agent writes cs.proactive_intervention. Can a CS Agent intervention rate-limit itself for the next day's run?",
      expectedAnswer: "No. The rate limit check (checkRecentContact) looks for event_types cs.chat_response and cs.intervention, neither of which match cs.proactive_intervention. The agent's own output does not trigger the rate limit. The 7-day rate limiting only applies if a human CS rep manually logged a cs.chat_response or cs.intervention event. Without those, the same org can get a cs.proactive_intervention every single day.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_cs_04",
      question: "An active (paid) subscriber's trial_expires_at field still has an old date from their trial period. Does the billing friction trigger fire?",
      expectedAnswer: "It depends on implementation. If the trigger checks subscription_status === 'trial' before evaluating trial_expires_at, the active subscriber is correctly excluded. If it only checks trial_expires_at proximity without validating subscription status, it could falsely fire. The constraint says billing friction must only fire for trial orgs.",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
    {
      id: "gq_cs_05",
      question: "Feature non-adoption trigger: an org has practice_rankings data (rankings have been run) but the owner has never viewed the rankings page. How is 'never viewed' determined?",
      expectedAnswer: "The agent queries behavioral_events for event_type 'rankings.viewed' (or 'dashboard.viewed' with page context) for that org. Zero results means never viewed. The detection depends on the frontend correctly writing a behavioral_event when the rankings page is rendered. If the frontend event logging is broken or the event_type name doesn't match what CS Agent queries, the trigger will either always fire (false positives) or never fire (false negatives).",
      actualAnswer: null,
      passed: null,
      testedAt: null,
    },
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
