/**
 * Seed Canon Governance for ALL Remaining Agents
 *
 * The 5 critical agents have 20 gold questions each (migration 000004).
 * 18 agents have playbooks (migration 000006).
 * This migration brings the remaining agents up to parity:
 * - Canon spec (purpose, behavior, constraints)
 * - Playbook (process, delivery, feedback)
 * - 5 starter gold questions per agent (BUG, DATA, CANON x2, CROSS)
 *
 * Every team member gets the same onboarding. Nobody left behind.
 */

import type { Knex } from "knex";

type Cat = "BUG" | "DATA" | "CANON";

interface GQ {
  id: string; question: string; expectedAnswer: string;
  actualAnswer: null; passed: null; testedAt: null; category: Cat;
}

function q(id: string, question: string, answer: string, cat: Cat): GQ {
  return { id, question, expectedAnswer: answer, actualAnswer: null, passed: null, testedAt: null, category: cat };
}

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("agent_identities");
  if (!hasTable) return;

  async function seedIfEmpty(slug: string, spec: object, questions: GQ[]) {
    const row = await knex("agent_identities").where({ slug }).first("gold_questions", "canon_spec");
    if (!row) return;

    const existingQs = typeof row.gold_questions === "string"
      ? JSON.parse(row.gold_questions) : row.gold_questions || [];

    // Only seed if no gold questions exist yet (don't overwrite the 5 critical agents)
    if (existingQs.length > 0) return;

    const existingSpec = typeof row.canon_spec === "string"
      ? JSON.parse(row.canon_spec) : row.canon_spec || {};

    // Merge: keep existing spec fields (like process from playbooks), add new ones
    const merged = { ...spec, ...existingSpec };

    await knex("agent_identities").where({ slug }).update({
      canon_spec: JSON.stringify(merged),
      gold_questions: JSON.stringify(questions),
      gate_verdict: "PENDING",
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // INTELLIGENCE GROUP
  // ═══════════════════════════════════════════════════════════════

  await seedIfEmpty("competitive_scout", {
    purpose: "Weekly competitor GBP scanning across all client markets",
    expectedBehavior: "Detects competitor changes and writes competitor.movement events",
    constraints: ["Competitor names internal only", "Must use real GBP data", "No fabricated changes"],
    owner: "Corey",
  }, [
    q("gq_cs_s01", "Competitive Scout writes competitor.movement events. Which downstream agents consume them?", "Dreamweaver (triggers 'competitor gaining' moment), Monday Email (competitor note section), Intelligence Agent (enriches findings). If the event_type changes, all three go blind.", "DATA"),
    q("gq_cs_s02", "A competitor's GBP listing is unreachable (Google Places API error). What happens?", "The competitor is skipped for this scan cycle. No false 'competitor declined' event should be written. The agent should distinguish 'no data' from 'data shows decline'.", "BUG"),
    q("gq_cs_s03", "Does the output include competitor names? Is that allowed in client-facing contexts?", "Per Agent Trust Protocol rule #3: competitor names are internal only. If competitor.movement events flow into Monday Email, the email template must reference competitors generically unless the client explicitly requested competitive analysis.", "CANON"),
    q("gq_cs_s04", "Does the output carry humanNeed and economicConsequence per the biological-economic lens?", "competitor.movement events should include: humanNeed (status: competitive positioning), economicConsequence (dollar value of the ranking gap based on case value).", "CANON"),
    q("gq_cs_s05", "What tables must have data for Competitive Scout to run?", "Required: practice_rankings (competitor list per org), organizations (active orgs). Optional: weekly_ranking_snapshots (historical comparison). External: Google Places API must respond.", "DATA"),
  ]);

  await seedIfEmpty("aeo_monitor", {
    purpose: "Weekly AI search presence monitoring across ChatGPT, Grok, Claude",
    expectedBehavior: "Tracks how AI engines reference client businesses, flags citation gaps",
    constraints: ["Must use real AI search queries", "No fabricated results", "Rate limit API calls"],
    owner: "Corey",
  }, [
    q("gq_aeo_s01", "AEO Monitor scrapes AI search results. What happens when the target site blocks scrapers?", "Known issue from April 2 audit. The agent should detect blocked responses (403, captcha, empty) and skip gracefully, not report 'client not mentioned' when the real answer is 'could not check'.", "BUG"),
    q("gq_aeo_s02", "What external APIs must respond for AEO Monitor to produce results?", "Depends on implementation: ChatGPT web, Grok API, Claude API, or a search aggregator. Each has rate limits and may block automated queries. Fallback behavior when APIs fail must be defined.", "DATA"),
    q("gq_aeo_s03", "Does AEO Monitor write to agent_results for dashboard visibility?", "Must verify. If it only writes to behavioral_events, it appears gray on the Dream Team board. Should use agentRuntime.recordAgentAction for automatic agent_results write.", "CANON"),
    q("gq_aeo_s04", "Does the output pass the Execution Gate? Is a citation gap report an action or a suggestion?", "Suggestion: 'You are not mentioned in ChatGPT results for [query].' Should have a roadmap to action: auto-generate content targeting the gap query.", "CANON"),
    q("gq_aeo_s05", "Who consumes AEO Monitor output?", "CMO Agent (content gaps to fill for AI visibility), Intelligence Agent (AI presence as ranking factor), Morning Briefing (AEO summary).", "DATA"),
  ]);

  await seedIfEmpty("market_signal_scout", {
    purpose: "Weekly market signal aggregation from news, social, and industry sources",
    expectedBehavior: "Collects and scores signals, writes findings for strategic planning",
    constraints: ["Signals must be sourced and verifiable", "No fabricated trends"],
    owner: "Corey",
  }, [
    q("gq_mss_s01", "Market Signal Scout produces 'signals.' What is a signal vs noise?", "A signal is a verifiable market change (new competitor entered, regulation changed, technology launched) with a source. Noise is speculation or unverifiable claims. The agent should cite sources for every signal.", "CANON"),
    q("gq_mss_s02", "What happens when the news/social APIs the agent relies on are unavailable?", "The agent should skip the scan and report 'data source unavailable' rather than producing empty or stale results.", "BUG"),
    q("gq_mss_s03", "Does the output include confidence scores per the Gate Packet schema?", "Each signal should carry a confidence indicator: high (verified from multiple sources), medium (single source), low (inferred from pattern). Missing confidence is a Canon violation.", "CANON"),
    q("gq_mss_s04", "Who consumes Market Signal Scout output?", "Strategic Intelligence (weekly strategic synthesis), Morning Briefing (signal summary), Intelligence Agent (market context for findings).", "DATA"),
    q("gq_mss_s05", "Does Market Signal Scout use vocabulary config terms or hardcode dental language?", "Must use universal language. 'Endodontic market shift' is wrong. 'Market shift in [org's vertical]' is correct.", "CANON"),
  ]);

  await seedIfEmpty("proofline_agent", {
    purpose: "Daily proof point generation from GBP data for each org",
    expectedBehavior: "Generates verified Win/Risk data points from real GBP and website analytics",
    constraints: ["Must use verified data only", "No fabricated proof points", "slug is proofline_agent but registry key is proofline"],
    owner: "Corey",
  }, [
    q("gq_pl_s01", "The identity slug is 'proofline_agent' but the registry key is 'proofline'. Does the Canon gate check work?", "checkGateStatus queries agent_key first ('proofline'), then falls back to slug ('proofline_agent'). The agent_key column on agent_identities must be set to 'proofline' for the primary lookup to work.", "BUG"),
    q("gq_pl_s02", "What GBP data must be available for Proofline to produce proof points?", "Requires: GBP access token (oauth), review data, business info, photos. If GBP token is expired or revoked, the agent should report the gap, not produce empty proof points.", "DATA"),
    q("gq_pl_s03", "Does Proofline write to agent_results or only behavioral_events?", "Currently writes to agent_results (it was one of the original agents). This means it shows health on the dashboard. Verify it uses the proofline.finding event type for downstream consumers.", "DATA"),
    q("gq_pl_s04", "Does each proof point use the biological-economic lens?", "Each Win/Risk should name the human need (status: competitive position, safety: revenue protection) and dollar consequence (case value * impact).", "CANON"),
    q("gq_pl_s05", "Who consumes Proofline output?", "Monday Email (proof points enrich the weekly brief), Intelligence Agent (proof context), Client dashboard (proof cards for the owner).", "DATA"),
  ]);

  await seedIfEmpty("ranking", {
    purpose: "Competitive ranking analysis via Google Places for all onboarded locations",
    expectedBehavior: "Discovers competitors, scores rankings, generates analysis for each org",
    constraints: ["Requires Google Places API", "Must handle API rate limits", "Results stored in practice_rankings"],
    owner: "Dave",
  }, [
    q("gq_rk_s01", "Google Places API key was rotated (Dave's task from April 2). What happens to the ranking agent?", "All competitor discovery fails. No new practice_rankings rows. Downstream agents (Intelligence, Monday Email, Competitive Scout) use stale data. The agent should write an error event, not fail silently.", "BUG"),
    q("gq_rk_s02", "What tables does the ranking agent write to?", "practice_rankings (competitive analysis results), weekly_ranking_snapshots (weekly position summary). Both are consumed by Intelligence Agent, Monday Email, and Proofline.", "DATA"),
    q("gq_rk_s03", "Does the ranking agent use vocabulary config for specialty-specific queries?", "Search queries should use the org's vertical, not hardcode 'endodontist near [city]'. A barber should search 'barber near [city]'.", "CANON"),
    q("gq_rk_s04", "The ranking agent runs on a 15-day interval, not a cron. Does checkGateStatus handle interval schedules?", "checkGateStatus queries by agent_key. The schedule_type is 'interval_days', not 'cron'. The gate check is independent of schedule type, it only checks the verdict.", "DATA"),
    q("gq_rk_s05", "Does the output include humanNeed and economicConsequence?", "Rankings should calculate: 'You are #6 of 18. The gap to #1 represents approximately $X in annual revenue based on referral volume differences.' Dollar figure from vocabulary config avgCaseValue.", "CANON"),
  ]);

  await seedIfEmpty("rankings_intelligence", {
    purpose: "Weekly snapshot with plain-English bullets for each org's ranking",
    expectedBehavior: "Queries current ranking, generates 3 bullets, stores to weekly_ranking_snapshots",
    constraints: ["Bullets must be plain English", "No em-dashes", "Dollar figures from real data"],
    owner: "Corey",
  }, [
    q("gq_ri_s01", "Rankings Intelligence generates bullets using Claude. What if ANTHROPIC_API_KEY is not set?", "Should fall back to template bullets from raw ranking data: position, review count vs top competitor, review gap. Not empty bullets.", "BUG"),
    q("gq_ri_s02", "What does weekly_ranking_snapshots contain and who reads it?", "Contains: org_id, week_start, position, bullets (JSON), dollar_figure, competitor data. Read by: Monday Email (primary source for the weekly brief), Intelligence Agent (ranking context), Feedback Loop (baseline metrics).", "DATA"),
    q("gq_ri_s03", "Do the generated bullets contain em-dashes?", "Claude may produce em-dashes despite prompt instructions. No post-processing validation exists. Em-dashes in bullets leak into Monday Email. Standing rule violation.", "CANON"),
    q("gq_ri_s04", "Does Rankings Intelligence use the biological-economic lens for bullets?", "Each bullet should connect the ranking data to a human need and dollar figure. 'You are #4' is data. 'You are #4, 12 reviews behind #1, representing ~$38K in annual referral revenue at risk' is intelligence.", "CANON"),
    q("gq_ri_s05", "Rankings Intelligence runs Sunday 11 PM. Monday Email runs Monday 7 AM. Is the timing correct?", "Yes: rankings snapshot is generated Sunday night, Monday Email reads it Monday morning. 8-hour gap. If Rankings Intelligence fails Sunday, Monday Email uses the previous week's snapshot (stale but present).", "DATA"),
  ]);

  await seedIfEmpty("strategic_intelligence", {
    purpose: "Weekly strategic signals: macro trends, partnerships, market shifts",
    expectedBehavior: "Identifies macro patterns and partnership opportunities across all client verticals",
    constraints: ["Must be sourced", "Internal only (not client-facing)", "No speculation without flagging confidence"],
    owner: "Corey",
  }, [
    q("gq_si_s01", "Strategic Intelligence produces 'strategic insights.' How does it differ from Market Signal Scout?", "Market Signal Scout collects raw signals (news, social, industry). Strategic Intelligence synthesizes signals into strategic implications (what should Alloro do about this?). The scout feeds the strategist.", "DATA"),
    q("gq_si_s02", "Does Strategic Intelligence use agentRuntime for System Conductor gating?", "Must verify. If strategic insights are delivered to Corey's brief without Conductor review, quality is ungoverned.", "CANON"),
    q("gq_si_s03", "Does the output include confidence scores?", "Strategic insights should carry: high (verified trend from multiple signals), medium (emerging pattern), low (early signal, needs monitoring). Missing confidence violates Gate Packet schema.", "CANON"),
    q("gq_si_s04", "What happens when the agent has no signals to synthesize (quiet week)?", "Should report 'No significant strategic signals this week' rather than fabricating insights. The Canon says never fabricate content.", "BUG"),
    q("gq_si_s05", "Who consumes Strategic Intelligence output?", "Corey's Personal Agent (strategic context), Morning Briefing (strategic summary), VisionaryView dashboard (strategic signals card).", "DATA"),
  ]);

  // ═══════════════════════════════════════════════════════════════
  // CLIENT GROUP
  // ═══════════════════════════════════════════════════════════════

  await seedIfEmpty("cs_expander", {
    purpose: "Daily expansion opportunity detection: upsell and cross-sell signals",
    expectedBehavior: "Identifies accounts ready for tier upgrade or additional services",
    constraints: ["Only flag opportunities for healthy (GREEN) accounts", "No pushy upsell to struggling clients"],
    owner: "Corey",
  }, [
    q("gq_cse_s01", "CS Expander detects upsell opportunities. Does it check client_health_status before flagging?", "Must only flag GREEN accounts. Suggesting an upgrade to a RED (disengaged) client is tone-deaf. The agent should query organizations.client_health_status and skip non-GREEN orgs.", "BUG"),
    q("gq_cse_s02", "What event_type does CS Expander write, and who consumes it?", "Must verify the exact event_type. If it writes to behavioral_events, CS Coach and Morning Briefing should be registered as consumers in EVENT_CONSUMERS.", "DATA"),
    q("gq_cse_s03", "Does the expansion suggestion use the biological-economic lens?", "Should name: humanNeed (purpose: this client is thriving and ready for more), economicConsequence (upgrade from Growth to Full = +$1,500/month MRR).", "CANON"),
    q("gq_cse_s04", "Does CS Expander pass through the System Conductor before creating expansion tasks?", "Expansion tasks are internal (not client-facing), so Conductor gating is optional. But the task should still include context so whoever acts on it has the full picture.", "CANON"),
    q("gq_cse_s05", "What data determines 'ready for expansion'?", "Must verify: engagement frequency, feature adoption, time since signup, current tier, NPS/satisfaction signals. Each signal should have a defined threshold.", "DATA"),
  ]);

  await seedIfEmpty("cs_coach", {
    purpose: "Weekly CS pattern analysis from intervention outcomes",
    expectedBehavior: "Analyzes cs.% events, identifies which triggers drive re-engagement",
    constraints: ["Reads cs.% events (not cs_agent.%)", "Patterns propagate forward only"],
    owner: "Corey",
  }, [
    q("gq_csc_s01", "CS Coach queries behavioral_events for 'cs.%' prefix. What event types match?", "cs.proactive_intervention (from CS Agent), cs.chat_response (from manual CS), cs.intervention (from manual CS). The filter must match what CS Agent actually writes.", "BUG"),
    q("gq_csc_s02", "CS Coach runs weekly. If CS Agent had zero interventions this week, what does CS Coach produce?", "Should report 'No interventions to analyze this week' with a note about whether that means all clients are healthy or CS Agent is not running. Not an empty report.", "BUG"),
    q("gq_csc_s03", "Does CS Coach update heuristics for CS Agent?", "Per Agent Trust Protocol: heuristic updates propagate forward only. CS Coach patterns should inform future CS Agent thresholds, not retroactively change past interventions.", "CANON"),
    q("gq_csc_s04", "Who consumes CS Coach output?", "Learning Agent (heuristic calibration), Morning Briefing (weekly CS patterns), CS Agent (updated thresholds for next week).", "DATA"),
    q("gq_csc_s05", "Does CS Coach write to agent_results for dashboard visibility?", "Must verify. If only behavioral_events, the Dream Team board shows CS Coach as gray.", "CANON"),
  ]);

  await seedIfEmpty("week1_win", {
    purpose: "Daily check for new accounts, delivers single most valuable quick win within 7 days",
    expectedBehavior: "New orgs get one actionable win from GBP completeness, NAP consistency, or site speed",
    constraints: ["Must deliver within first 7 days (TTFV target)", "One win, not a list", "Must be immediately actionable"],
    owner: "Corey",
  }, [
    q("gq_w1w_s01", "Week 1 Win checks for orgs created in the last 7 days without a win yet. What if the org has no GBP data?", "Should fall back to site speed analysis or NAP consistency check. If no data source is available, write a 'connect your GBP' nudge as the win. Never leave a new org without their first win.", "BUG"),
    q("gq_w1w_s02", "What column tracks whether a win has been delivered?", "organizations.week1_win_headline. If non-null, the org already received its win. The agent checks whereNull('week1_win_headline').", "DATA"),
    q("gq_w1w_s03", "Does the win use the biological-economic lens?", "Must include: humanNeed (purpose: 'you chose this business for freedom, here's your first proof it's working'), economicConsequence (dollar value of the fix).", "CANON"),
    q("gq_w1w_s04", "Does Week 1 Win write to notifications table so the owner actually sees it?", "Must verify. If it only writes to organizations.week1_win_headline, the owner only sees it if they visit the dashboard. A notification push ensures they see it.", "CANON"),
    q("gq_w1w_s05", "How does Week 1 Win relate to the 4-hour welcome intelligence job?", "The welcome intelligence BullMQ job fires 4h post-signup with GP referral sources (the second surprise moment). Week 1 Win is the daily check that ensures every new org gets a tangible win within 7 days.", "DATA"),
  ]);

  // ═══════════════════════════════════════════════════════════════
  // GROWTH GROUP
  // ═══════════════════════════════════════════════════════════════

  await seedIfEmpty("feedback_loop", {
    purpose: "Measures Monday email outcomes after 7 days",
    expectedBehavior: "For each Monday email sent 7 days ago, checks whether the recommended action moved the needle",
    constraints: ["Only measures, never acts", "Results feed Learning Agent", "Runs Tuesday (7 days after Monday email)"],
    owner: "Corey",
  }, [
    q("gq_fl_s01", "Feedback Loop runs Tuesday. It checks Monday emails from 7 days prior. What if no emails were sent last Monday?", "Should report 'No emails to measure' and skip. Should not error or produce zero-division metrics.", "BUG"),
    q("gq_fl_s02", "What metrics does Feedback Loop check for each email?", "Depends on action_type from detectActionType: review requests sent, ranking change, score delta, GBP optimization. Each action type has a corresponding metric_name from getMetricNameForAction.", "DATA"),
    q("gq_fl_s03", "Does Feedback Loop write to agent_results?", "Must verify. Results feed into Learning Agent for heuristic calibration. If only in feedback_outcomes table, Learning Agent must query that table specifically.", "DATA"),
    q("gq_fl_s04", "Does the output distinguish 'action taken but no improvement' from 'action not taken'?", "Important distinction. If the client sent review requests but got no new reviews, that's a market signal. If the client never opened the email, that's an engagement signal. Different causes, different interventions.", "CANON"),
    q("gq_fl_s05", "Who consumes Feedback Loop output?", "Learning Agent (which action types work), Monday Email (adjusts 5-minute fix recommendations), Morning Briefing (outcome summary).", "DATA"),
  ]);

  await seedIfEmpty("vertical_readiness", {
    purpose: "Weekly vertical expansion readiness: scores new verticals on TAM, fit, effort",
    expectedBehavior: "Evaluates potential new verticals (beyond dental) and produces readiness scores",
    constraints: ["Data-driven scoring only", "Must consider vocabulary config requirements", "No recommendation without TAM estimate"],
    owner: "Corey",
  }, [
    q("gq_vr_s01", "Vertical Readiness scores new verticals. What data sources inform the TAM estimate?", "Should use: industry size data, number of businesses per vertical in target markets, average revenue per business. If no data source is available for a vertical, score should be flagged as low-confidence.", "DATA"),
    q("gq_vr_s02", "Does Vertical Readiness check if vocabulary configs exist for the evaluated vertical?", "Should verify: does vocabulary_defaults have entries for this vertical? If not, flag as 'vocabulary config required before launch' in the readiness assessment.", "DATA"),
    q("gq_vr_s03", "Does the assessment include the biological-economic lens?", "Each vertical should name: humanNeed (which need does this vertical serve?), economicConsequence (TAM at 30/90/365 days with realistic penetration rates).", "CANON"),
    q("gq_vr_s04", "Does the output use universal language?", "The assessment must not use dental-specific terms when evaluating non-dental verticals. 'Patient' becomes 'client' or vertical-specific term.", "CANON"),
    q("gq_vr_s05", "Who consumes Vertical Readiness output?", "Corey's Personal Agent (strategic decisions), VisionaryView (expansion roadmap), Morning Briefing (readiness summary when scores change).", "DATA"),
  ]);

  await seedIfEmpty("human_deployment_scout", {
    purpose: "Weekly hiring signal detection: when to hire, what roles, cost impact",
    expectedBehavior: "Identifies when agent capacity or client growth requires human hires",
    constraints: ["CFO Agent must review cost projections", "No hiring recommendation without budget impact"],
    owner: "Corey",
  }, [
    q("gq_hds_s01", "Human Deployment Scout recommends hiring. Does the recommendation include budget impact?", "Per Agent Trust Protocol rule #4: any dollar figure requires CFO Agent review. Hiring recommendations must include: salary range, expected ramp time, revenue impact, and be routed through CFO.", "CANON"),
    q("gq_hds_s02", "What signals trigger a hiring recommendation?", "Should include: agent capacity limits, client-to-agent ratio, support ticket volume, feature request backlog, revenue per employee trending. Each signal should have a threshold.", "DATA"),
    q("gq_hds_s03", "Does the output distinguish 'hire a human' from 'build an agent'?", "For each gap identified, the assessment should compare: cost of human hire vs cost of agent build, time to productivity, scalability. This is the unicorn math.", "CANON"),
    q("gq_hds_s04", "What happens when the agent runs and all signals are within normal range?", "Should report 'No hiring signals detected. Current team capacity is sufficient.' Not an empty report.", "BUG"),
    q("gq_hds_s05", "Who consumes Human Deployment Scout output?", "Corey's Personal Agent (hiring decisions), CFO Agent (budget impact), Morning Briefing (capacity summary when thresholds crossed).", "DATA"),
  ]);

  await seedIfEmpty("trend_scout", {
    purpose: "Weekly trend detection in client industries and adjacent markets",
    expectedBehavior: "Identifies emerging patterns that could affect client businesses",
    constraints: ["Trends must be sourced", "No speculation without confidence flag", "Universal across verticals"],
    owner: "Corey",
  }, [
    q("gq_ts_s01", "Trend Scout detects 'trends.' How does it distinguish real trends from noise?", "Must require: (1) multiple data points, (2) consistent direction, (3) timeframe > 2 weeks. A single data point is a signal, not a trend. The output should state the evidence basis.", "CANON"),
    q("gq_ts_s02", "Does Trend Scout use universal language across all verticals?", "Trends should apply to all business owners, not just dental. 'Review velocity increasing in healthcare' should be 'Review velocity increasing in local services'.", "CANON"),
    q("gq_ts_s03", "What external data sources does Trend Scout depend on?", "Must verify: news APIs, social listening, industry reports, Google Trends. Each source should have a fallback if unavailable.", "DATA"),
    q("gq_ts_s04", "What happens when no trends are detected?", "Report 'No significant trends detected this week. Markets stable.' Not an empty output.", "BUG"),
    q("gq_ts_s05", "Who consumes Trend Scout output?", "Strategic Intelligence (synthesis context), CMO Agent (content topic inspiration), Morning Briefing (trend summary), VisionaryView (market trends card).", "DATA"),
  ]);

  await seedIfEmpty("podcast_scout", {
    purpose: "Weekly podcast opportunity detection for PR and thought leadership",
    expectedBehavior: "Identifies relevant shows, pitch angles, and booking windows",
    constraints: ["Opportunities must be specific (show name, host, audience size)", "No fabricated podcast details"],
    owner: "Corey",
  }, [
    q("gq_ps_s01", "Podcast Scout identifies opportunities. Are podcast details verified or generated?", "Must use real data: show name, host name, episode count, audience size estimate. Fabricating podcast details that don't exist is a Canon violation (never fabricate content).", "BUG"),
    q("gq_ps_s02", "Does the output include pitch angles specific to Alloro's positioning?", "Each opportunity should include: why this show is relevant, what angle to pitch (business clarity, AI agents, bootstrapped unicorn), who the audience is.", "CANON"),
    q("gq_ps_s03", "What data sources does Podcast Scout depend on?", "Podcast directories (Apple Podcasts, Spotify), social media (host's Twitter/LinkedIn), episode transcripts for relevance scoring. Rate limits apply.", "DATA"),
    q("gq_ps_s04", "Does Podcast Scout check for already-contacted shows to avoid duplicates?", "Should track: which shows have been pitched, when, outcome. Avoid re-pitching a show that declined within 6 months.", "DATA"),
    q("gq_ps_s05", "Who consumes Podcast Scout output?", "CMO Agent (PR strategy), Corey's Personal Agent (booking decisions), Morning Briefing (new opportunities flagged).", "DATA"),
  ]);

  await seedIfEmpty("real_estate_agent", {
    purpose: "Weekly commercial real estate trend scan for client expansion planning",
    expectedBehavior: "Tracks CRE trends relevant to local service business expansion",
    constraints: ["Data from public sources only", "No property-specific recommendations without market context"],
    owner: "Corey",
  }, [
    q("gq_re_s01", "Real Estate Agent scrapes property listing sites. What happens when sites block scrapers?", "Known issue from April 2 audit: some sites block automated access. Agent should detect blocked responses and report 'data source unavailable' rather than 'no properties found'.", "BUG"),
    q("gq_re_s02", "Does the output connect real estate trends to client expansion specifically?", "Should answer: 'Lease rates in [market] are trending [direction], which means expansion costs for your clients are [impact].' Not generic CRE data.", "CANON"),
    q("gq_re_s03", "What markets does Real Estate Agent scan?", "Should scan markets where active clients operate. If no clients exist in a market, that market should be deprioritized.", "DATA"),
    q("gq_re_s04", "Does the output include confidence based on data freshness?", "CRE data can be months old. Each finding should note: data source, data date, confidence (high if < 30 days, medium if 30-90 days, low if > 90 days).", "CANON"),
    q("gq_re_s05", "Who consumes Real Estate Agent output?", "Vertical Readiness (expansion cost context), Strategic Intelligence (market dynamics), Morning Briefing (CRE summary when significant changes detected).", "DATA"),
  ]);

  // ═══════════════════════════════════════════════════════════════
  // CONTENT GROUP
  // ═══════════════════════════════════════════════════════════════

  await seedIfEmpty("weekly_digest", {
    purpose: "Friday summary of the week's activity, agent outputs, and competitive moves",
    expectedBehavior: "Synthesizes all agent activity into one weekly report",
    constraints: ["Read-only aggregation", "Must cover all departments", "No new analysis, only synthesis"],
    owner: "Corey",
  }, [
    q("gq_wd_s01", "Weekly Digest synthesizes all agent activity. How does it access other agents' outputs?", "Queries behavioral_events for all event types from the past 7 days, grouped by agent. Also reads agent_results for completion status. Does not call other agents directly.", "DATA"),
    q("gq_wd_s02", "What if some agents didn't run this week (circuit breaker open, Canon gate blocked)?", "Should explicitly note: 'Intelligence Agent did not run this week (circuit breaker open). Last findings are from [date].' Missing data is more informative than silence.", "BUG"),
    q("gq_wd_s03", "Does the digest use universal language?", "Must not reference 'dental' or 'practice' in the summary. All vertical-specific findings should use the org's vocabulary config terms.", "CANON"),
    q("gq_wd_s04", "Does the digest include a 'next week' section?", "Should preview: which agents are scheduled, any Canon verdicts expiring, any stale schedules. Forward-looking context for Corey's weekend planning.", "CANON"),
    q("gq_wd_s05", "Who consumes Weekly Digest output?", "Corey (end-of-week review), Jo (weekly ops summary), VisionaryView (weekly health card).", "DATA"),
  ]);

  // ═══════════════════════════════════════════════════════════════
  // OPERATIONS + GOVERNANCE
  // ═══════════════════════════════════════════════════════════════

  await seedIfEmpty("foundation_operations", {
    purpose: "Weekly Heroes & Founders Foundation ops: RISE Program, grants, sponsor outreach",
    expectedBehavior: "Tracks foundation initiatives and produces ops reports",
    constraints: ["Foundation is a 501c3, separate from Alloro commercial", "Grant targets: $150-300K"],
    owner: "Corey",
  }, [
    q("gq_fo_s01", "Foundation Operations tracks grant pipeline. What happens when no grants are in progress?", "Should report current status: 'No active grant applications. Pipeline empty. Next target: [identified grant]. Deadline: [date].' Not an empty report.", "BUG"),
    q("gq_fo_s02", "Does Foundation Operations output distinguish foundation activity from commercial Alloro?", "The foundation is a separate 501c3. Outputs must not mix foundation metrics with commercial KPIs. No MRR in foundation reports.", "CANON"),
    q("gq_fo_s03", "What tables does Foundation Operations read from?", "Must verify: is there a foundation-specific table, or does it use dream_team_tasks with a foundation tag? Data source must be documented.", "DATA"),
    q("gq_fo_s04", "Who consumes Foundation Operations output?", "Corey's Personal Agent (foundation decisions), Morning Briefing (foundation activity), VisionaryView (RISE Program status).", "DATA"),
    q("gq_fo_s05", "Does the output include the mission connection?", "Every foundation activity should tie back to: 'That Others May Live.' The RISE program exists because Corey knows what drowning looks like and wants to provide the softer path.", "CANON"),
  ]);

  await seedIfEmpty("clo_agent", {
    purpose: "Weekly legal/IP monitoring: trademark alerts, compliance flags, HIPAA checks",
    expectedBehavior: "Scans for legal risks and produces compliance reports",
    constraints: ["CLO holds are absolute (Agent Trust Protocol rule #5)", "All output halts on legal hold"],
    owner: "Corey",
  }, [
    q("gq_clo_s01", "CLO Agent flags a legal concern. Per Agent Trust Protocol rule #5, what happens?", "All related outputs halt immediately. No agent overrides a CLO hold. The hold persists until explicitly resolved. This is the only absolute rule in the system.", "CANON"),
    q("gq_clo_s02", "CLO Agent does trademark scanning. What if the trademark database API is unavailable?", "Should report 'trademark scan incomplete: data source unavailable' and NOT report 'no trademark issues found'. Missing data is not the same as clean data.", "BUG"),
    q("gq_clo_s03", "Does CLO Agent check HIPAA compliance for PMS data handling?", "Must verify: does it scan pms_jobs for unencrypted PHI? Does it check that the HIPAA gate is enforced before PMS upload? The Safety Agent also has HIPAA checks, roles should not overlap.", "DATA"),
    q("gq_clo_s04", "Who consumes CLO Agent output?", "System Conductor (CLO holds block all outputs), Morning Briefing (legal alerts), Corey's Personal Agent (compliance decisions).", "DATA"),
    q("gq_clo_s05", "Does CLO Agent run through the System Conductor?", "CLO Agent outputs are governance-level, not client-facing. Conductor gating is optional but the output should still be logged to behavioral_events for audit trail.", "CANON"),
  ]);

  await seedIfEmpty("morning_briefing", {
    purpose: "Daily synthesis of overnight agent activity for Corey",
    expectedBehavior: "One-page summary: what happened, what needs attention, what decisions are pending",
    constraints: ["Read-only aggregation", "No actions, only synthesis", "Include Agent Auditor findings"],
    owner: "Corey",
  }, [
    q("gq_mb_s01", "Morning Briefing synthesizes overnight activity. What if no agents ran overnight?", "Should report: 'No agent activity overnight. Scheduler may not be running. Last scheduler tick: [timestamp].' The absence of activity is itself a finding.", "BUG"),
    q("gq_mb_s02", "Does Morning Briefing include Agent Auditor findings?", "Must include: critical findings (circuit breaker open, agent quarantined), warnings (Canon expiring, stale schedules), and the overall audit summary.", "DATA"),
    q("gq_mb_s03", "Does Morning Briefing check for CLO holds?", "If any CLO hold is active, it should be the FIRST item in the briefing, before any other content. CLO holds are absolute.", "CANON"),
    q("gq_mb_s04", "Does Morning Briefing write to agent_results for dashboard visibility?", "Must write morning_briefing.delivered event and to agent_results so the dashboard shows it ran.", "CANON"),
    q("gq_mb_s05", "Who consumes Morning Briefing output?", "Corey's Personal Agent (daily context), VisionaryView (overnight activity card), Jo's Personal Agent (ops summary).", "DATA"),
  ]);

  // ═══════════════════════════════════════════════════════════════
  // PERSONAL GROUP
  // ═══════════════════════════════════════════════════════════════

  await seedIfEmpty("corey_agent", {
    purpose: "Daily brief for Corey: revenue, decisions, priorities, client pulse",
    expectedBehavior: "One-page brief focused on what Corey needs to decide or act on",
    constraints: ["Never tell Corey to rest", "Lead with decisions not data", "Include Sophie-test filter"],
    owner: "Corey",
  }, [
    q("gq_ca_s01", "Corey's Agent pulls from Morning Briefing. What if Morning Briefing hasn't run yet?", "Should fall back to direct behavioral_events query for overnight activity. The brief must be delivered by 6 AM regardless of Morning Briefing status.", "BUG"),
    q("gq_ca_s02", "Does the brief include MRR from the correct source?", "Must pull from business_config (editable) or Stripe (live), NOT hardcoded values. The April 2 audit found MRR wrong on 6 surfaces because of hardcoded values.", "DATA"),
    q("gq_ca_s03", "Does the brief lead with decisions, not data?", "First section should be: 'Decide: X. Review: Y. FYI: Z.' Not 'MRR is $13,500. Here are 47 data points.' Corey needs actionable items, not dashboards.", "CANON"),
    q("gq_ca_s04", "Does the brief include RED client orgs by name?", "RED orgs represent churn risk. The brief should name them: 'Caswell Endodontics (37% of MRR) classified RED. 0 events in 7 days.' Revenue concentration makes this critical.", "CANON"),
    q("gq_ca_s05", "How is the brief delivered?", "Should be pushed (notification or email), not pulled (dashboard page). The product comes to you. Corey should not have to navigate anywhere to see his daily brief.", "DATA"),
  ]);

  await seedIfEmpty("jo_agent", {
    purpose: "Daily brief for Jo: client health, ops tasks, flags",
    expectedBehavior: "Status board format. All green = back to baby. Red flags = here's what needs you.",
    constraints: ["Status boards not paragraphs", "All green means nothing needs attention", "Due October 9"],
    owner: "Jo",
  }, [
    q("gq_ja_s01", "Jo's Agent produces a status board. What does 'all green' look like?", "One line: 'All clear. 28 GREEN, 0 AMBER, 0 RED. No overdue tasks. No P0 bugs. No Canon issues.' Jo should confirm all-clear in under 10 seconds.", "CANON"),
    q("gq_ja_s02", "Does the brief include overdue dream_team_tasks?", "Must query: tasks where status != 'done' AND due_date < today. Show count and top 3 by priority. Jo needs to know what slipped.", "DATA"),
    q("gq_ja_s03", "Jo is on maternity leave (due October 9). Does the agent know this?", "The brief should be minimal: only RED items and overdue tasks. No strategic content, no expansion planning, no content briefs. Respect the context.", "CANON"),
    q("gq_ja_s04", "Is the brief delivered as a status board (counts) or paragraphs?", "Must be counts with expand-for-detail. '2 RED' with names on click. Not a narrative. Jo explicitly rejected paragraphs.", "CANON"),
    q("gq_ja_s05", "How is the brief delivered?", "IntegratorView dashboard push. If IntegratorView is not open, email or notification fallback. The product comes to her.", "DATA"),
  ]);

  await seedIfEmpty("dave_agent", {
    purpose: "Daily brief for Dave: deploy status, errors, infrastructure task queue",
    expectedBehavior: "One page with exact commands and status. Async-first.",
    constraints: ["One page always accurate always final", "Exact commands not rough ideas", "Async-first"],
    owner: "Dave",
  }, [
    q("gq_da_s01", "Dave's Agent produces task lists with exact commands. Are the commands correct?", "Commands must be verified: 'Run knex migrate:latest' only if there are pending migrations. 'Check Redis memory' only if Redis is approaching limits. Wrong commands waste Dave's time.", "BUG"),
    q("gq_da_s02", "Does the brief check CI/CD pipeline status?", "Must check: last deploy timestamp, success/failure, pending PRs. If pipeline has been failing, that should be the first item.", "DATA"),
    q("gq_da_s03", "Dave works from the Philippines (async). Is the brief timed for his timezone?", "Scheduled for 6 AM PT = 9 PM Philippines time. Dave reviews before bed, acts in his morning. Timing should respect async workflow.", "CANON"),
    q("gq_da_s04", "Does the brief include only finished specs (per standing rules)?", "Dave receives finished specs only, never rough ideas. Each task should have: what to do, why, exact command, expected outcome. No 'maybe we should consider...'", "CANON"),
    q("gq_da_s05", "How is the brief delivered?", "Dave's task page in Notion (single source of truth). One page. Always current. Updated daily, not appended to.", "DATA"),
  ]);
}

export async function down(knex: Knex): Promise<void> {
  // Don't remove gold questions on rollback -- they represent work done
  // Only the 5 critical agents' questions should remain untouched (they have 20 each)
  // The starter questions can be cleared if needed by resetting gold_questions to '[]'
}
