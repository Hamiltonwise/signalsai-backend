/**
 * Knowledge Bridge -- Heuristic Loader
 *
 * Loads Knowledge Lattice and Sentiment Lattice heuristics
 * from the knowledge_heuristics table. Agents call
 * getRelevantHeuristics() to receive heuristics matching
 * their domain and topic.
 *
 * Two layers:
 * 1. knowledge_heuristics table in PostgreSQL (populated by seedKnowledgeHeuristics)
 * 2. getRelevantHeuristics() queries by tags matching agent name + topic keywords
 */

import { db } from "../database/connection";

// ── Types ───────────────────────────────────────────────────────────

export interface KnowledgeHeuristic {
  id: number;
  source: "knowledge_lattice" | "sentiment_lattice";
  leaderName: string;
  category: string;
  corePrinciple: string;
  agentHeuristic: string;
  antiPattern: string;
  tags: string[];
}

// ── Seed Data ───────────────────────────────────────────────────────

const SEED_HEURISTICS = [
  {
    source: "knowledge_lattice",
    leader_name: "Daniel Kahneman",
    category: "behavioral_economics",
    core_principle:
      "Loss aversion: losses feel roughly 2x as painful as equivalent gains feel good.",
    agent_heuristic:
      "Frame findings around what the business owner stands to lose, not what they might gain. A lost referral source hits harder than a new one excites.",
    anti_pattern:
      "Never fabricate losses. Only cite loss framing when data supports a real downward trend.",
    tags: JSON.stringify([
      "monday_email",
      "score_reveal",
      "intelligence_agent",
      "loss",
      "framing",
      "behavioral",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Robert Cialdini",
    category: "influence",
    core_principle:
      "Reciprocity: people feel obligated to return favors. Give value first, then ask.",
    agent_heuristic:
      "Deliver an insight or tool before asking the business owner to take action. The free checkup earns the right to ask for signup.",
    anti_pattern:
      "Never gate value behind signup. The first experience must be undeniably useful.",
    tags: JSON.stringify([
      "review_request",
      "checkup",
      "conversion_optimizer",
      "reciprocity",
      "influence",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Robert Cialdini",
    category: "influence",
    core_principle:
      "Social Proof: people follow what others like them are doing, especially under uncertainty.",
    agent_heuristic:
      "Show how many similar businesses use Alloro, or how top performers in the market behave. Normalize the desired action.",
    anti_pattern:
      "Never fabricate social proof numbers. If data is thin, use qualitative patterns instead.",
    tags: JSON.stringify([
      "review_request",
      "checkup",
      "conversion_optimizer",
      "social_proof",
      "influence",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Robert Cialdini",
    category: "influence",
    core_principle:
      "Authority: people defer to credible experts. Establish expertise early.",
    agent_heuristic:
      "Lead with data, not opinion. Every claim should reference a specific metric or source. Authority is earned through accuracy.",
    anti_pattern:
      "Never claim authority without backing data. Unsubstantiated claims erode trust faster than silence.",
    tags: JSON.stringify([
      "checkup",
      "intelligence_agent",
      "authority",
      "influence",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Robert Cialdini",
    category: "influence",
    core_principle:
      "Scarcity: limited availability increases perceived value. Time windows drive action.",
    agent_heuristic:
      "When a competitive window is closing (e.g., competitor stalling on reviews), highlight the time-limited opportunity.",
    anti_pattern:
      "Never manufacture fake scarcity. Only use when data shows a genuine closing window.",
    tags: JSON.stringify([
      "competitive_scout",
      "conversion_optimizer",
      "scarcity",
      "influence",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Alex Hormozi",
    category: "value_creation",
    core_principle:
      "Value = (Dream Outcome x Perceived Likelihood) / (Time Delay x Effort and Sacrifice).",
    agent_heuristic:
      "Maximize perceived likelihood by showing proof. Minimize time delay by delivering insight immediately. Minimize effort by making the One Action Card dead simple.",
    anti_pattern:
      "Never increase effort for the user. If an action requires more than 2 minutes, break it into smaller steps.",
    tags: JSON.stringify([
      "conversion_optimizer",
      "one_action_card",
      "value",
      "pricing",
      "onboarding",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "BJ Fogg",
    category: "behavior_design",
    core_principle:
      "B = MAP. Behavior happens when Motivation, Ability, and Prompt converge at the same moment.",
    agent_heuristic:
      "Every prompt must arrive when motivation is high (e.g., after seeing a competitive threat) and the action is easy (one click). Miss any element and the behavior does not happen.",
    anti_pattern:
      "Never send a prompt when the user has no motivation context. Always pair the prompt with the 'why' data.",
    tags: JSON.stringify([
      "one_action_card",
      "monday_email",
      "behavior",
      "prompts",
      "motivation",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Nir Eyal",
    category: "habit_formation",
    core_principle:
      "Hook Model: Trigger, Action, Variable Reward, Investment. Hooks build habits without expensive marketing.",
    agent_heuristic:
      "Monday email is the external trigger. Dashboard visit is the action. New intelligence findings are the variable reward. Completing the One Action Card is the investment that loads the next trigger.",
    anti_pattern:
      "Never make the reward predictable. If every Monday email says the same thing, the hook breaks.",
    tags: JSON.stringify([
      "monday_email",
      "dashboard",
      "habit",
      "engagement",
      "retention",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Jeff Bezos",
    category: "customer_obsession",
    core_principle:
      "Start with the customer and work backwards. The customer experience is the strategy.",
    agent_heuristic:
      "Before any output, ask: does this serve the business owner, or does it serve us? If it does not make the owner's Tuesday morning better, it waits.",
    anti_pattern:
      "Never optimize for internal metrics (DAU, engagement) at the expense of actual owner outcomes.",
    tags: JSON.stringify([
      "all",
      "customer",
      "strategy",
      "north_star",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Andy Grove",
    category: "competitive_strategy",
    core_principle:
      "Only the paranoid survive. Strategic inflection points can be exploited or suffered.",
    agent_heuristic:
      "Monitor for inflection points: a competitor suddenly acquiring reviews, a new entrant, a regulatory change. Flag these immediately, not in the next weekly report.",
    anti_pattern:
      "Never cry wolf. Reserve high-severity alerts for genuine inflection points backed by data.",
    tags: JSON.stringify([
      "competitive_scout",
      "market_signal",
      "strategy",
      "urgency",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Steve Jobs",
    category: "product_vision",
    core_principle:
      "People don't know what they want until you show it to them. Lead with vision, not surveys.",
    agent_heuristic:
      "Do not ask the business owner what intelligence they want. Show them something they did not know they needed. The 'how did they know that?' moment is the product.",
    anti_pattern:
      "Never default to generic dashboards. Every screen should surface a specific, surprising insight.",
    tags: JSON.stringify([
      "intelligence_agent",
      "dashboard",
      "product",
      "surprise",
      "delight",
    ]),
  },
  {
    source: "sentiment_lattice",
    leader_name: "Katie Flanagan",
    category: "content_strategy",
    core_principle:
      "Teach AI who you write for, how you write, and what makes it stick. Voice is a moat.",
    agent_heuristic:
      "Every piece of content must sound like it was written by someone who understands the daily reality of running a specialist business. No corporate jargon. No motivational fluff.",
    anti_pattern:
      "Never produce content that could have come from any generic SaaS. If it reads like a template, rewrite it.",
    tags: JSON.stringify([
      "cmo_agent",
      "content",
      "voice",
      "brand",
      "writing",
    ]),
  },
  {
    source: "sentiment_lattice",
    leader_name: "Will Guidara",
    category: "hospitality",
    core_principle:
      "Unreasonable hospitality: go beyond what is expected. Make people feel seen.",
    agent_heuristic:
      "The welcome intelligence job, the personalized Monday email, the 'we noticed your competitor stalled' nudge. Every touchpoint should feel like someone is paying attention specifically to this business.",
    anti_pattern:
      "Never send a generic message when you have specific data. Personalization is not optional.",
    tags: JSON.stringify([
      "cs_agent",
      "welcome_intelligence",
      "hospitality",
      "personalization",
      "delight",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Daniel Kahneman",
    category: "behavioral_economics",
    core_principle:
      "Peak-End Rule: people judge experiences by the peak moment and the end, not the average.",
    agent_heuristic:
      "Design the checkup reveal and the Monday email as peak moments. End every interaction with a clear, achievable next step. The last impression carries disproportionate weight.",
    anti_pattern:
      "Never end an interaction with bad news alone. Always pair a negative finding with a concrete action the owner can take.",
    tags: JSON.stringify([
      "checkup",
      "monday_email",
      "score_reveal",
      "experience",
      "behavioral",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Clayton Christensen",
    category: "innovation",
    core_principle:
      "Jobs to be done: customers hire products to make progress in their lives. Understand the job, not the feature.",
    agent_heuristic:
      "The business owner hires Alloro to feel in control of their business. Every feature must serve that job. If it does not reduce anxiety or increase clarity, it is noise.",
    anti_pattern:
      "Never build features that create more questions than they answer. Every output should increase the owner's sense of control.",
    tags: JSON.stringify([
      "all",
      "product",
      "strategy",
      "jtbd",
      "clarity",
    ]),
  },
  {
    source: "sentiment_lattice",
    leader_name: "Brene Brown",
    category: "vulnerability",
    core_principle:
      "Vulnerability is not weakness. Acknowledging uncertainty builds trust faster than false confidence.",
    agent_heuristic:
      "When data is incomplete, say so. 'Based on 3 weeks of data, we see X' is more trustworthy than presenting thin data as certainty. Confidence intervals matter.",
    anti_pattern:
      "Never present uncertain data as fact. Never hide data limitations from the business owner.",
    tags: JSON.stringify([
      "intelligence_agent",
      "monday_email",
      "trust",
      "transparency",
      "communication",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Peter Drucker",
    category: "management",
    core_principle:
      "What gets measured gets managed. But only measure what matters.",
    agent_heuristic:
      "Track the metrics that directly connect to revenue: referral velocity, review gap, competitive position. Vanity metrics (page views, time on site) are noise unless they predict revenue.",
    anti_pattern:
      "Never surface a metric without explaining why it matters to the owner's bottom line.",
    tags: JSON.stringify([
      "intelligence_agent",
      "dashboard",
      "metrics",
      "measurement",
      "revenue",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Nassim Taleb",
    category: "risk",
    core_principle:
      "Antifragile: some systems gain from disorder. Build systems that improve when stressed.",
    agent_heuristic:
      "When a competitor surges or a referral source drops, treat it as signal, not just noise. The learning agent should update heuristics from every stress event. Each disruption makes the system smarter.",
    anti_pattern:
      "Never ignore anomalies. A data point that does not fit the pattern is often the most valuable signal.",
    tags: JSON.stringify([
      "learning_agent",
      "competitive_scout",
      "risk",
      "resilience",
      "anomaly",
    ]),
  },
  {
    source: "sentiment_lattice",
    leader_name: "Simon Sinek",
    category: "leadership",
    core_principle:
      "Start with why. People do not buy what you do, they buy why you do it.",
    agent_heuristic:
      "Every communication should connect back to the owner's original 'why': freedom, craft, impact. They did not buy a business to stare at dashboards. They bought it to build the life they envisioned.",
    anti_pattern:
      "Never lead with features or data dumps. Lead with the human story the data tells.",
    tags: JSON.stringify([
      "monday_email",
      "cmo_agent",
      "cs_agent",
      "purpose",
      "motivation",
      "storytelling",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "W. Edwards Deming",
    category: "quality",
    core_principle:
      "In God we trust, all others bring data. Drive out fear so people can work effectively.",
    agent_heuristic:
      "Every agent output must be traceable to a data source. When delivering findings, always include the data lineage: where the number came from, when it was collected, and what could make it wrong.",
    anti_pattern:
      "Never present an insight without its source. Unsourced claims create anxiety, not clarity.",
    tags: JSON.stringify([
      "all",
      "intelligence_agent",
      "quality",
      "data",
      "accuracy",
      "trust",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Kyle Norton",
    category: "growth",
    core_principle:
      "Before optimizing, measure conversion at every pipeline stage. Coach the bottleneck, not the outcome.",
    agent_heuristic:
      "When advising on growth, identify which pipeline stage has the lowest conversion rate first. Coach that stage specifically instead of pushing the final metric. A 2% improvement at the bottleneck beats a 10% push at the top.",
    anti_pattern:
      "Never optimize top-of-funnel when the bottleneck is mid-funnel. Pouring more leads into a broken pipeline wastes the owner's time and money.",
    tags: JSON.stringify([
      "conversion_optimizer",
      "growth",
      "pipeline",
      "analytics",
      "coaching",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Elena Verna",
    category: "plg",
    core_principle:
      "Does the free product create expansion demand without a sales touch? If expansion requires a human, PLG is broken.",
    agent_heuristic:
      "Every free touchpoint (checkup, referral base report) must create enough value that the user self-escalates to paid. If the conversion path requires a sales call, the free experience is not valuable enough.",
    anti_pattern:
      "Never rely on outbound follow-up to convert free users. If the product does not sell itself, the product needs work, not more sales effort.",
    tags: JSON.stringify([
      "conversion_optimizer",
      "plg",
      "growth",
      "checkup",
      "onboarding",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Wes Bush",
    category: "plg",
    core_principle:
      "Time to first value is the single most important PLG metric. Every step before the aha moment is friction to eliminate.",
    agent_heuristic:
      "Measure the time between signup and the moment the owner says 'I see it.' Every screen, form field, or loading state between those two moments is a candidate for elimination.",
    anti_pattern:
      "Never add steps between signup and first value. Every additional click reduces the probability of reaching the aha moment.",
    tags: JSON.stringify([
      "conversion_optimizer",
      "plg",
      "onboarding",
      "ttfv",
      "friction",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Leah Tharin",
    category: "pricing",
    core_principle:
      "Map decision moments. Monetize only at positive-gap moments where the user got more than expected.",
    agent_heuristic:
      "Identify the moments in the user journey where surprise value is delivered (score reveal, first competitive insight, milestone celebration). These are the only appropriate moments to introduce pricing or upsell. Never monetize a neutral or negative moment.",
    anti_pattern:
      "Never present pricing when the user is confused, frustrated, or has not yet received value. Billing prompts at negative moments destroy trust permanently.",
    tags: JSON.stringify([
      "conversion_optimizer",
      "pricing",
      "billing",
      "monetization",
      "plg",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Tomasz Tunguz",
    category: "analytics",
    core_principle:
      "Know your LTV/CAC, NRR, and payback period cold. If unmeasured, measuring is the priority.",
    agent_heuristic:
      "Before recommending any growth initiative, verify the core unit economics are measured. If LTV/CAC ratio, net revenue retention, or payback period are unknown, measuring them is the first priority. Scaling without unit economics is flying blind.",
    anti_pattern:
      "Never recommend scaling spend or effort without knowing the unit economics. Growth without measurement is gambling.",
    tags: JSON.stringify([
      "cfo_agent",
      "analytics",
      "retention",
      "growth",
      "metrics",
      "revenue",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Hiten Shah",
    category: "retention",
    core_principle:
      "Watch what users do, not what they say. One conversation with a churned user is worth a month of features.",
    agent_heuristic:
      "Prioritize behavioral data (dashboard visits, action completions, time between logins) over survey responses or feature requests. When a user churns, the exit interview is the most valuable data point in the system.",
    anti_pattern:
      "Never build features based on what users say they want without verifying it matches what they actually do. Stated preferences and revealed preferences diverge constantly.",
    tags: JSON.stringify([
      "learning_agent",
      "cs_agent",
      "retention",
      "analytics",
      "churn",
      "behavioral",
    ]),
  },
  {
    source: "knowledge_lattice",
    leader_name: "Oz Pearlman",
    category: "intelligence",
    core_principle:
      "The audience never sees the preparation. Do the homework before they arrive. Cross-reference two public facts into one private-feeling insight. Never reveal the data source.",
    agent_heuristic:
      "Before presenting any finding, combine at least two independent data points into a single insight the business owner could not have reached alone. The checkup, welcome email, and Monday brief each use different combinations so every touchpoint feels like fresh homework.",
    anti_pattern:
      "Never show raw data without cross-referencing. A review count alone is a number. A review count compared to the competitor's response rate is intelligence.",
    tags: JSON.stringify([
      "intelligence",
      "surprise",
      "checkup",
      "hospitality",
      "welcome_intelligence",
      "monday_email",
      "score_reveal",
      "delight",
    ]),
  },
];

// ── Seed Function ───────────────────────────────────────────────────

/**
 * Seed the knowledge_heuristics table with the top 20 heuristics.
 * Uses upsert logic: skips rows that already exist (matched by leader_name + category + source).
 */
export async function seedKnowledgeHeuristics(): Promise<number> {
  let inserted = 0;

  for (const h of SEED_HEURISTICS) {
    const exists = await db("knowledge_heuristics")
      .where({
        source: h.source,
        leader_name: h.leader_name,
        category: h.category,
      })
      .whereRaw("core_principle = ?", [h.core_principle])
      .first();

    if (!exists) {
      await db("knowledge_heuristics").insert({
        ...h,
        created_at: new Date(),
        updated_at: new Date(),
      });
      inserted++;
    }
  }

  console.log(
    `[KnowledgeBridge] Seeded ${inserted} heuristics (${SEED_HEURISTICS.length - inserted} already existed)`,
  );
  return inserted;
}

// ── Query Function ──────────────────────────────────────────────────

/**
 * Agent-name-to-tag mapping for automatic matching.
 */
const AGENT_TAG_MAP: Record<string, string[]> = {
  intelligence_agent: ["intelligence_agent", "all"],
  competitive_scout: ["competitive_scout", "all"],
  client_monitor: ["cs_agent", "all"],
  monday_email: ["monday_email", "all"],
  conversion_optimizer: ["conversion_optimizer", "all"],
  cmo_agent: ["cmo_agent", "all"],
  cs_agent: ["cs_agent", "all"],
  learning_agent: ["learning_agent", "all"],
  score_reveal: ["score_reveal", "all"],
  checkup: ["checkup", "all"],
  welcome_intelligence: ["welcome_intelligence", "all"],
  one_action_card: ["one_action_card", "all"],
  dashboard: ["dashboard", "all"],
  dreamweaver: ["cs_agent", "hospitality", "delight", "all"],
};

/**
 * Get heuristics relevant to a specific agent and optional topic.
 * Matches by JSONB tag containment: any tag from the agent's domain
 * or the topic keywords.
 */
export async function getRelevantHeuristics(
  agentName: string,
  topic?: string,
): Promise<KnowledgeHeuristic[]> {
  // Build the set of tags to search for
  const searchTags: string[] = [
    ...(AGENT_TAG_MAP[agentName] || [agentName, "all"]),
  ];

  if (topic) {
    // Split topic into keywords and add as tags
    const keywords = topic
      .toLowerCase()
      .split(/[\s,_-]+/)
      .filter((k) => k.length > 2);
    searchTags.push(...keywords);
  }

  // Query: find heuristics where tags array overlaps with our search tags
  const rows = await db("knowledge_heuristics")
    .whereRaw("tags ?| array[" + searchTags.map(() => "?").join(",") + "]", searchTags)
    .orderBy("leader_name", "asc");

  return rows.map(mapRow);
}

/**
 * Get all heuristics (for debugging or full context).
 */
export async function getAllHeuristics(): Promise<KnowledgeHeuristic[]> {
  const rows = await db("knowledge_heuristics").orderBy("leader_name", "asc");
  return rows.map(mapRow);
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapRow(row: any): KnowledgeHeuristic {
  return {
    id: row.id,
    source: row.source,
    leaderName: row.leader_name,
    category: row.category,
    corePrinciple: row.core_principle,
    agentHeuristic: row.agent_heuristic,
    antiPattern: row.anti_pattern,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
  };
}
