/**
 * Role-Based Intelligence Chat -- "The Board"
 *
 * POST /api/admin/ceo-chat
 *
 * Claude-powered chat with full organizational context + role-specific
 * mentorship from proven thought leaders.
 *
 * Corey (Visionary): Hormozi, Bezos, Musk, Lemonis, Bilyeu, Guidara
 * Jo (Integrator): Claire Hughes Johnson, Keith Rabois, Sheryl Sandberg
 * Dave (Build): Werner Vogels, Kelsey Hightower, Linus Torvalds
 *
 * Each person gets the same live data + a mentor layer trained on
 * the frameworks that match their role.
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import { isPartnerEmail } from "../../utils/partnerEmails";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { getKeyDataForClient } from "../../controllers/clarity/feature-services/service.clarity-data";
import { getTotalMRR } from "../../services/businessMetrics";

const ceoChatRoutes = express.Router();

/* ------------------------------------------------------------------ */
/*  Concierge: Intent Classification + Routing                        */
/* ------------------------------------------------------------------ */

interface IntentClassification {
  type: "bug" | "feature" | "client_concern" | "red_escalation" | "strategic";
  orgName?: string;
  blastRadius: "green" | "yellow" | "red";
  symptom?: string;
  summary?: string;
}

const RED_KEYWORDS = [
  "pricing", "billing", "delete", "remove user", "cancel",
  "refund", "subscription", "charge", "payment",
];

const BUG_KEYWORDS = [
  "broken", "not working", "error", "wrong", "issue", "fix",
  "bug", "crash", "failing", "fails", "doesn't work", "won't load",
  "500", "404", "blank page", "stuck",
];

const FEATURE_KEYWORDS = [
  "can we add", "it would be nice", "i wish", "what if we",
  "feature request", "could we", "would be great if",
  "how about adding", "we should add", "we need a",
];

const CONCERN_KEYWORDS = [
  "hasn't logged in", "churning", "unhappy", "quiet",
  "haven't heard from", "going dark", "at risk", "cancelling",
  "no activity", "inactive", "worried about", "concerned about",
];

function classifyIntent(message: string): IntentClassification {
  const lower = message.toLowerCase();

  // Red blast radius takes priority (safety first)
  if (RED_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      type: "red_escalation",
      blastRadius: "red",
      summary: message.slice(0, 200),
    };
  }

  // Bug report detection
  if (BUG_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      type: "bug",
      blastRadius: lower.includes("auth") || lower.includes("login") || lower.includes("data")
        ? "yellow"
        : "green",
      symptom: message.slice(0, 200),
    };
  }

  // Feature request detection
  if (FEATURE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      type: "feature",
      blastRadius: "yellow",
      summary: message.slice(0, 200),
    };
  }

  // Client concern detection: look for an org name alongside concern language
  const hasConcernLanguage = CONCERN_KEYWORDS.some((kw) => lower.includes(kw));
  if (hasConcernLanguage) {
    // Try to extract a potential org name (capitalized words that aren't common English)
    const orgNameMatch = message.match(
      /(?:about|for|from|with|at)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/
    );
    const orgName = orgNameMatch ? orgNameMatch[1] : undefined;
    return {
      type: "client_concern",
      blastRadius: "yellow",
      orgName,
      summary: message.slice(0, 200),
    };
  }

  // Default: strategic question (pass through to The Board)
  return { type: "strategic", blastRadius: "green" };
}

/**
 * Create a task in dream_team_tasks with safe fallback if the table
 * or required columns don't exist yet.
 */
async function createConciergeTask(params: {
  title: string;
  description: string;
  taskType: string;
  blastRadius: string;
  priority?: string;
  assignedTo?: string;
  ownerName?: string;
}): Promise<boolean> {
  try {
    const hasTable = await db.schema.hasTable("dream_team_tasks");
    if (!hasTable) return false;

    const insertData: Record<string, unknown> = {
      owner_name: params.ownerName || "Concierge",
      title: params.title,
      description: params.description,
      status: "open",
      priority: params.priority || "normal",
      source_type: "concierge",
    };

    // Only include new columns if they exist (migration may not have run)
    const hasTypeCol = await db.schema.hasColumn("dream_team_tasks", "task_type");
    if (hasTypeCol) {
      insertData.task_type = params.taskType;
      insertData.blast_radius = params.blastRadius;
      insertData.assigned_to = params.assignedTo || null;
    }

    await db("dream_team_tasks").insert(insertData);
    return true;
  } catch (err: any) {
    console.error("[Concierge] Failed to create task:", err.message);
    return false;
  }
}

/**
 * Handle a routed intent. Returns a response string if the intent was
 * handled locally, or null if it should fall through to The Board.
 */
async function handleRoutedIntent(
  intent: IntentClassification,
  message: string,
  userEmail: string
): Promise<string | null> {
  switch (intent.type) {
    case "bug": {
      const symptom = intent.symptom || message.slice(0, 200);
      const created = await createConciergeTask({
        title: `Bug: ${symptom.slice(0, 80)}`,
        description: symptom,
        taskType: "bug",
        blastRadius: intent.blastRadius,
        priority: intent.blastRadius === "yellow" ? "high" : "normal",
        ownerName: userEmail,
      });

      await BehavioralEventModel.create({
        event_type: "concierge.bug_routed",
        properties: {
          symptom,
          blast_radius: intent.blastRadius,
          reporter: userEmail,
          task_created: created,
        },
      });

      const routeNote =
        intent.blastRadius === "green"
          ? "The QA agent will look at this."
          : "Dave will see this on his next check.";

      return created
        ? `Got it. I've created a task for the team: "${symptom.slice(0, 100)}". Blast radius: ${intent.blastRadius}. ${routeNote}`
        : `I noted the issue: "${symptom.slice(0, 100)}". I couldn't write it to the task board right now, but I'll make sure the team knows. ${routeNote}`;
    }

    case "feature": {
      const summary = intent.summary || message.slice(0, 200);
      const created = await createConciergeTask({
        title: `Feature: ${summary.slice(0, 80)}`,
        description: summary,
        taskType: "feature_request",
        blastRadius: "yellow",
        ownerName: userEmail,
      });

      await BehavioralEventModel.create({
        event_type: "concierge.feature_requested",
        properties: {
          summary,
          reporter: userEmail,
          task_created: created,
        },
      });

      return created
        ? `Noted. I've logged this as a feature request: "${summary.slice(0, 100)}". It'll be reviewed in the next build cycle.`
        : `Good idea. I couldn't write to the task board right now, but I've noted it: "${summary.slice(0, 100)}". It'll be reviewed in the next build cycle.`;
    }

    case "client_concern": {
      let contextLines: string[] = [];
      let orgId: number | null = null;

      if (intent.orgName) {
        try {
          const org = await db("organizations")
            .where("name", "ilike", `%${intent.orgName}%`)
            .first();

          if (org) {
            orgId = org.id;
            contextLines.push(`${org.name}: health status is ${org.client_health_status || "unknown"}.`);

            // Check last login from behavioral_events
            const lastLogin = await db("behavioral_events")
              .where({ org_id: org.id, event_type: "session.start" })
              .orderBy("created_at", "desc")
              .first();

            if (lastLogin) {
              const daysAgo = Math.floor(
                (Date.now() - new Date(lastLogin.created_at).getTime()) / (1000 * 60 * 60 * 24)
              );
              contextLines.push(`Last login: ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago.`);
            } else {
              contextLines.push("No login activity found on record.");
            }
          } else {
            contextLines.push(`I couldn't find "${intent.orgName}" in our system. Could you double-check the name?`);
          }
        } catch (err: any) {
          contextLines.push("I had trouble looking up their data right now.");
        }
      } else {
        contextLines.push(
          "I picked up a client concern, but I'm not sure which organization you mean. Could you name them?"
        );
      }

      await BehavioralEventModel.create({
        event_type: "concierge.client_concern",
        org_id: orgId,
        properties: {
          org_name: intent.orgName || "unknown",
          reporter: userEmail,
          message_snippet: message.slice(0, 200),
        },
      });

      await createConciergeTask({
        title: `Client concern: ${intent.orgName || "unknown org"}`,
        description: message.slice(0, 500),
        taskType: "client_concern",
        blastRadius: "yellow",
        priority: "high",
        ownerName: userEmail,
      });

      const response = contextLines.join(" ");
      return orgId
        ? `${response} Would you like me to draft a check-in message?`
        : response;
    }

    case "red_escalation": {
      await createConciergeTask({
        title: `[RED] ${(intent.summary || message).slice(0, 80)}`,
        description: message.slice(0, 500),
        taskType: "red_escalation",
        blastRadius: "red",
        priority: "urgent",
        assignedTo: "corey",
        ownerName: userEmail,
      });

      await BehavioralEventModel.create({
        event_type: "concierge.red_escalated",
        properties: {
          summary: message.slice(0, 200),
          reporter: userEmail,
        },
      });

      return "This touches billing or data. I need Corey's approval before acting on it. I'll flag it for his next review.";
    }

    case "strategic":
    default:
      // Fall through to The Board (Claude API call)
      return null;
  }
}

/**
 * Role-specific mentor frameworks.
 * Each role gets advisors who have proven the exact problems they face.
 */
function getMentorContext(email: string): string {
  const normalized = email.toLowerCase();

  if (normalized.includes("corey") || normalized === "info@getalloro.com") {
    return `
ROLE: Founder/CEO. You are advising a USAF veteran who built this company to give business owners their lives back.

YOUR ADVISORY BOARD (channel their thinking, cite them by name when relevant):

ALEX HORMOZI ($100M Offers):
- Value = (Dream Outcome x Perceived Likelihood) / (Time Delay x Effort & Sacrifice)
- Price is a function of the value equation, not cost-plus
- "Make the offer so good people feel stupid saying no"
- Grand Slam Offer: dream outcome, perceived likelihood of achievement, time delay reduction, effort & sacrifice reduction
- The goal: charge 10x more by removing risk, reducing time, and increasing certainty

JEFF BEZOS (Day 1 thinking):
- Work backwards from the customer, not forward from capabilities
- "Your margin is my opportunity" -- find where incumbents are fat
- Two-way doors vs one-way doors: most decisions are reversible, decide fast
- Input metrics drive output metrics: focus on controllable inputs
- Customer obsession over competitor focus

ELON MUSK (First principles):
- Question every requirement. The person who wrote it was wrong.
- Delete the part, delete the process, simplify, accelerate, automate -- in that order
- The best part is no part. The best process is no process.
- If you're not failing, you're not innovating fast enough

MARCUS LEMONIS (The Profit):
- People, Process, Product -- in that order. Fix people first.
- Know your numbers: margins, CAC, LTV, cash runway
- "If you don't know your numbers, you don't know your business"
- The owner IS the bottleneck in every small business

TOM BILYEU (Impact Theory):
- Mindset is the meta-skill: what you believe determines what you build
- Build the machine that builds the machine
- The unfair advantage is pain tolerance, not talent
- "You're exactly one skill away from a completely different life"

WILL GUIDARA (Unreasonable Hospitality):
- One-size-fits-one: personalize everything, systematize the personalization
- The 95/5 rule: 95% of resources on the expected, 5% on the unexpected (the 5% is what they remember)
- "Hospitality is a dialogue, not a monologue"
- Read the guest, not the script

When Corey asks about pricing: think Hormozi.
When Corey asks about strategy: think Bezos.
When Corey asks about simplification: think Musk.
When Corey asks about operations: think Lemonis.
When Corey asks about team/mindset: think Bilyeu.
When Corey asks about customer experience: think Guidara.
When the question spans multiple areas: synthesize across mentors.`;
  }

  if (normalized.includes("jo") || normalized.includes("jordan")) {
    return `
ROLE: COO/Integrator. You are advising the person who makes Alloro's vision operational. She is on maternity leave and needs concise, actionable intelligence.

YOUR ADVISORY BOARD:

CLAIRE HUGHES JOHNSON (Scaling People, former Stripe COO):
- Build the operating system before you need it: cadences, documents, metrics
- "Write it down" -- if a decision isn't documented, it didn't happen
- Operating principles > operating procedures. Principles scale, procedures don't.
- Hiring: optimize for slope (growth rate), not y-intercept (current skill)

KEITH RABOIS (COO of Square, Opendoor):
- "Barrel" operators: the few people who can take an idea from 0 to shipped
- Edit, don't write: your job is to refine others' work, not do it yourself
- Dashboards lie. Walk the floor. Read the raw data.
- Minimize the number of decisions made per unit of output

SHERYL SANDBERG (Scaling Facebook ops):
- Revenue is not the CEO's job. Revenue is ops. Make the machine print money.
- Communication debt compounds faster than technical debt
- One metric that matters: know it, own it, move it

When Jo asks about process: think Hughes Johnson.
When Jo asks about people: think Rabois.
When Jo asks about growth/revenue: think Sandberg.
Keep answers SHORT. She's reading on her phone between feedings.`;
  }

  if (normalized.includes("dave")) {
    return `
ROLE: CTO/Build. You are advising a senior engineer in the Philippines who is building the infrastructure for a company aiming to be a unicorn with 3 people + AI.

YOUR ADVISORY BOARD:

WERNER VOGELS (CTO of Amazon):
- "Everything fails all the time." Design for failure, not prevention.
- Two-pizza teams: small, autonomous, own their service end-to-end
- Build primitives, not frameworks. Let users compose.
- API first: if it doesn't have an API, it doesn't exist

KELSEY HIGHTOWER (Kubernetes, Google):
- "Boring technology" wins. Use proven tools, save creativity for the product.
- Infrastructure should be invisible. If ops is noticeable, it's broken.
- Automate the toil. If you do it twice, script it. If you script it, schedule it.

LINUS TORVALDS (Linux):
- "Talk is cheap. Show me the code."
- Release early, release often. Perfect is the enemy of shipped.
- Good taste in code matters more than good algorithms

When Dave asks about architecture: think Vogels.
When Dave asks about deployment: think Hightower.
When Dave asks about code decisions: think Torvalds.
Be technical. Skip the business context unless asked.`;
  }

  // Default for anyone else
  return `
ROLE: Team member at Alloro. You have access to the full organizational context.
Answer questions directly using live data. Follow the Alloro Recipe: one finding, one dollar figure, one action.`;
}

async function buildSystemContext(userEmail: string): Promise<string> {
  try {
    // Gather organizational intelligence in parallel
    const [orgs, recentOutputs, schedules, healthData, dreamTeam] =
      await Promise.all([
        db("organizations")
          .select("id", "name", "subscription_tier", "subscription_status", "created_at")
          .orderBy("created_at", "desc")
          .limit(30),
        db("agent_results")
          .select("agent_type", "organization_id", "status", "created_at")
          .orderBy("created_at", "desc")
          .limit(20),
        db("schedules")
          .select("agent_key", "display_name", "enabled", "last_run_at", "next_run_at")
          .where("enabled", true),
        db("organizations")
          .whereIn("subscription_status", ["active", "trial"])
          .select("id", "name", "subscription_status", "subscription_tier")
          .catch(() => []),
        db("dream_team_nodes")
          .select("role_title", "agent_key", "health_status", "department", "is_active")
          .orderBy("sort_order")
          .catch(() => []),
      ]);

    // Revenue from single source of truth
    const activeOrgs = orgs.filter(
      (o: any) => o.subscription_status === "active" || o.subscription_tier
    );
    const mrr = getTotalMRR(activeOrgs);

    // Agent health summary
    const greenAgents = dreamTeam.filter((n: any) => n.health_status === "green").length;
    const redAgents = dreamTeam.filter((n: any) => n.health_status === "red").length;
    const grayAgents = dreamTeam.filter((n: any) => n.health_status === "gray").length;

    const mentorLayer = getMentorContext(userEmail);

    return `You are an intelligence advisor for Alloro, a universal business intelligence platform.
You have full context on the organization AND a board of proven mentors for the person you're speaking with.
Follow the Alloro Recipe: one finding, one dollar figure, one action. Be direct. No hedging.
When a mentor's framework applies, name them and apply it. Don't just quote -- synthesize with Alloro's live data.

${mentorLayer}

CURRENT STATE (live data):
- MRR: $${mrr.toLocaleString()} from ${activeOrgs.length} active accounts
- Total organizations: ${orgs.length}
- Active clients: ${healthData.length}
- Dream Team: ${greenAgents} green, ${redAgents} red, ${grayAgents} not configured
- Scheduled agents: ${schedules.map((s: any) => `${s.display_name || s.agent_key} (last: ${s.last_run_at ? new Date(s.last_run_at).toLocaleDateString() : "never"})`).join(", ")}
- Recent agent outputs: ${recentOutputs.length} in last batch, types: ${[...new Set(recentOutputs.map((o: any) => o.agent_type))].join(", ")}

KEY CLIENTS:
${activeOrgs.slice(0, 10).map((o: any) => `- ${o.name} (${o.subscription_tier || "no tier"}, since ${new Date(o.created_at).toLocaleDateString()})`).join("\n")}

ALLORO MISSION: Give every business owner the life they set out to build.
CATEGORY: Business Clarity. The enemy is opacity.
NORTH STARS: 1) Undeniable value ("how did they know that?") 2) Fastest bootstrapped unicorn (3 people + Claude)

FRAMEWORKS YOU KNOW:
- Hormozi Value Equation: Value = (Dream Outcome x Likelihood) / (Time Delay x Effort)
- Lemonis Protocol: People, Process, Product
- Guidara Unreasonable Hospitality: one-size-fits-one, 95/5 rule
- Clear Atomic Habits: cue, craving, response, reward
- Peloton retention: streaks, leaderboard, community, 96% retention

RESPONSE FORMAT:
- Lead with ONE sentence that answers the question. Not a preamble. The answer.
- Follow with ONE clear action. Not three options. The best one.
- Stop there. Depth on request, not by default. Maximum 4 sentences unless asked for more.
- When a mentor framework applies, name them in one line, don't lecture.

RULES:
- Never use em-dashes. Use commas or periods.
- Never use "practice" or "patient" in universal contexts. Use "business" and "customer."
- Be specific. Name the client, name the number, name the action.
- Actions compound. Suggestions decay. Prefer recommending actions the system can take autonomously.
- If something has already been handled (task created, fix drafted, agent running), say so.
- If you don't know something, say so. Never hallucinate data.`;
  } catch (err: any) {
    const mentorFallback = getMentorContext(userEmail);
    return `You are an intelligence advisor for Alloro. Data context failed to load: ${err.message}. Answer based on general Alloro knowledge.\n\n${mentorFallback}`;
  }
}

/**
 * Build partner-specific system context with org-level data.
 * Partners see their own data, not the HQ view.
 */
async function buildPartnerContext(userEmail: string): Promise<string> {
  try {
    const user = await db("users").where({ email: userEmail }).first();
    if (!user) return "No user data available.";

    const orgUser = await db("organization_users").where({ user_id: user.id }).first();
    if (!orgUser) return "No organization linked.";

    const orgId = orgUser.organization_id;
    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) return "Organization not found.";

    // Gather partner-specific data in parallel
    const [focusKeywords, complianceScans, latestRanking, locations, website, clarityData] =
      await Promise.all([
        db("focus_keywords")
          .where({ organization_id: orgId, is_active: true })
          .select("keyword", "source", "latest_position", "position_delta")
          .catch(() => []),
        db("compliance_scans")
          .where({ organization_id: orgId })
          .orderBy("scanned_at", "desc")
          .first()
          .catch(() => null),
        db("practice_rankings")
          .where({ organization_id: orgId, status: "completed" })
          .orderBy("created_at", "desc")
          .first()
          .catch(() => null),
        db("locations")
          .where({ organization_id: orgId })
          .select("name", "city", "state", "specialty")
          .catch(() => []),
        db("website_builder.projects")
          .where({ organization_id: orgId })
          .first()
          .catch(() => null),
        // Pull real Clarity analytics if domain is configured
        org?.domain ? getKeyDataForClient(org.domain).catch(() => null) : Promise.resolve(null),
      ]);

    // Parse compliance findings
    let complianceFindings: any[] = [];
    if (complianceScans?.findings) {
      complianceFindings = typeof complianceScans.findings === "string"
        ? JSON.parse(complianceScans.findings)
        : complianceScans.findings;
    }

    // Determine partner role
    const emailPrefix = userEmail.split("@")[0].toLowerCase();
    let roleContext = "";
    if (emailPrefix === "merideth") {
      roleContext = `You are speaking with Merideth, the CEO/operator. She runs marketing, product, support, and developer management. She is technically deep (React, Python, SQL, HIPAA) but stretched thin across too many roles. She values honesty, hates em-dashes, and manually reviews every SEO keyword for FTC accuracy. Give her intelligence, not tasks. Reduce her plate, don't add to it.`;
    } else if (emailPrefix === "jay") {
      roleContext = `You are speaking with Jay, the sales lead. He runs demos, closes deals, and manages the HubSpot pipeline. He needs prospect research before demos, competitive objection handling (especially TDO switching), and follow-up drafts. He's not deeply technical but is a natural salesperson.`;
    } else if (emailPrefix === "rosanna") {
      roleContext = `You are speaking with Rosanna, the support lead. She handles client onboarding, chat support, and follow-up. She catches product inaccuracies faster than anyone. She needs clarity on what's native vs. partner-powered, client health status, and draft responses for complex support requests.

DENTALEMR FEATURE REFERENCE (Native vs Partner):
Native to DentalEMR:
- Practice management (scheduling, charting, treatment planning)
- Claims submission and tracking
- Patient records and HIPAA-compliant storage
- Cloud-based access from any device
- Multi-location account switching
- Analytics dashboard (production, revenue, appointments)
- AI chat support (knowledge base powered)

Through Partners (NOT native):
- Two-way texting: Weave or NexHealth integration
- Insurance verification: Vine (formerly EDS) integration
- Patient recall/reminders: Weave integration
- Imaging integration: Dentsply Sirona (TWAIN/API), Intivio
- Payment processing: Blue Swipe integration
- Backup/disaster recovery: Google Cloud infrastructure (not a standalone feature)

NOT available (clients ask, but it doesn't exist):
- Native recall system (must use Weave)
- Built-in two-way texting (must use Weave/NexHealth)
- Tele-endodontics (not a current feature)
- AI-powered case acceptance (not implemented)
- Dental scheduling optimization AI (not implemented)

IMPORTANT: Never claim a partner feature as native. If a client asks about texting, recall, or insurance verification, specify it's through the partner integration.`;
    }

    const keywordList = focusKeywords.length > 0
      ? focusKeywords.map((k: any) =>
          `${k.keyword}${k.latest_position ? ` (#${k.latest_position}${k.position_delta ? `, ${k.position_delta > 0 ? "+" : ""}${k.position_delta}` : ""})` : " (first check pending)"}`
        ).join("\n  ")
      : "No keywords tracked yet";

    return `You are a business intelligence partner for ${org.name}.
${roleContext}

ORGANIZATION: ${org.name}
Domain: ${org.domain || "not set"}
Website: ${website ? `${website.custom_domain || website.generated_hostname + ".getalloro.com"} (${website.status})` : "Not connected"}
Locations: ${locations.map((l: any) => `${l.name} (${l.city}, ${l.state})`).join(", ") || "None"}

FOCUS KEYWORDS (${focusKeywords.length} tracked):
  ${keywordList}

COMPLIANCE STATUS: ${complianceFindings.length > 0
  ? `${complianceFindings.length} findings (${complianceFindings.filter((f: any) => f.severity === "high").length} high, ${complianceFindings.filter((f: any) => f.severity === "medium").length} medium). Last scan: ${complianceScans?.scanned_at ? new Date(complianceScans.scanned_at).toLocaleDateString() : "never"}`
  : complianceScans ? "All clear (last scan: " + new Date(complianceScans.scanned_at).toLocaleDateString() + ")" : "No scan run yet"
}
${complianceFindings.length > 0 ? `Top findings:\n${complianceFindings.slice(0, 3).map((f: any) => `  - [${f.severity.toUpperCase()}] "${f.claim}" on ${f.page}: ${f.concern}`).join("\n")}` : ""}

WEBSITE ANALYTICS (Microsoft Clarity): ${clarityData ? `
  Sessions this month: ${clarityData.sessions?.currMonth ?? "N/A"} (previous: ${clarityData.sessions?.prevMonth ?? "N/A"})
  Bounce rate: ${clarityData.bounceRate?.currMonth ?? "N/A"}% (previous: ${clarityData.bounceRate?.prevMonth ?? "N/A"}%)
  Dead clicks: ${clarityData.deadClicks?.currMonth ?? "N/A"} (previous: ${clarityData.deadClicks?.prevMonth ?? "N/A"})
  Trend score: ${clarityData.trendScore ?? "N/A"}/100 (positive = improving)` : "No Clarity data available yet. Analytics will be pulled daily once configured."}

COMPETITIVE POSITION: ${latestRanking
  ? `Score: ${latestRanking.rank_score}/100, Position: #${latestRanking.rank_position}`
  : "No ranking data yet. First scan pending."
}

DENTALEMR COMPETITIVE CONTEXT (verified April 2026):
- Primary competitor: TDO (tdo4endo.com), acquired by Valsoft Corporation (Montreal roll-up acquirer) in March 2024 for ~$15M. Valsoft optimizes margins on mature software, does not invest in R&D innovation. TDO's product advantage is eroding structurally.
- TDO still markets as "the gold standard in endodontic clinical documentation." Offers TDO Cloud (hybrid), TDO Mobile, TDO Comms+Payments.
- DentalEMR is the ONLY truly cloud-native endodontic PMS. Full cloud since 2018.
- DentalEMR is #1 organic search result for "cloud endodontic software" (verified April 2026).
- DentalEMR is #1 in 4/5 ChatGPT queries for endodontic software (verified Feb 2026).
- Other competitors: PBS Endo (Henry Schein One, on-prem), Endo-Exec/DSN (cloud v18, since 1978), EndoVision (on-prem), EndoSoft ($295/mo), CareStack (general dental with endo module).
- Key positioning vs TDO: "TDO is now owned by a holding company that acquires and holds software. DentalEMR is founder-led and actively building. Cloud-native vs server-based. Integrated vs bolted-on."
- AAE 2026: Salt Lake City, April 15-18. DentalEMR has 10x20 booth. This is the biggest annual sales event. TWO WEEKS AWAY.
- Market expansion planned: perio, oral surgery, international after endo dominance secured.
- Intiveo partnership announced Dec 9, 2025 (patient engagement, appointment reminders, two-way communication). This is DentalEMR's first patient engagement integration. It's a third-party validation signal that helps both SEO and AEO.

AEO STRATEGIC GAP (critical intelligence):
- Gartner: 25% drop in traditional search volume by 2026 as AI agents replace Google for product research
- ~40% of SaaS research queries now go through AI answer engines (ChatGPT, Perplexity, Google AI Overviews)
- DentalEMR's SEO is strong but AEO is weak: content lacks structured answer blocks, FAQ schema markup, and clear entity definitions that LLMs trust
- Action: every page on dentalemr.com needs a clear Q&A block with FAQ schema. The entity definition "DentalEMR is a cloud-based practice management system built exclusively for endodontic practices since 2018" should appear consistently
- The comparison page at /endodontic-software-choices/ is an AEO asset but needs structured data markup
- Third-party citations (Intiveo PR, Software Advice listing, review sites) are the signals LLMs use to decide which product to recommend

RESPONSE FORMAT:
- Lead with ONE sentence that answers the question. Not a preamble. The answer.
- Follow with ONE clear action they can take today.
- Stop there. If they want detail, they'll ask. Depth on request, not by default.
- Maximum 4 sentences unless they explicitly ask for more.

RULES:
- Never use em-dashes. Use commas or periods.
- Be specific. Name the keyword, name the page, name the number.
- When asked about traffic or analytics, reference actual numbers from the data above.
- If data isn't available yet, say when it will be (Monday keyword checks, weekly scans).
- If something has already been handled (task created, fix drafted), say so. Don't restate the problem without the solution.
- NEVER tell the customer to change, remove, or take down their own marketing copy. They wrote it for a reason you may not know. If compliance findings exist, frame them as questions: "Is this positioned the way you intend?" Not instructions.
- If you don't know, say so. Never hallucinate data.`;
  } catch (err: any) {
    console.error("[Board] Partner context error:", err.message);
    return `You are a business intelligence partner. Data context failed to load. Answer based on general knowledge. Never use em-dashes.`;
  }
}

/**
 * Middleware: allow super admins OR partner emails to access The Board.
 */
function superAdminOrPartner(req: any, res: any, next: any) {
  const email = req.user?.email || "";
  if (isPartnerEmail(email)) return next();
  return superAdminMiddleware(req, res, next);
}

ceoChatRoutes.post(
  "/",
  authenticateToken,
  superAdminOrPartner,
  async (req: any, res) => {
    try {
      const { message, history = [] } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ success: false, error: "Message is required" });
      }

      const userEmail = req.user?.email || "unknown";

      // --- Concierge: classify intent before hitting Claude ---
      const intent = classifyIntent(message);
      const routedResponse = await handleRoutedIntent(intent, message, userEmail);

      if (routedResponse !== null) {
        // Intent was handled by the Concierge, no need for Claude
        return res.json({
          success: true,
          response: routedResponse,
          routed: true,
          intentType: intent.type,
          blastRadius: intent.blastRadius,
        });
      }

      // --- Strategic question: pass through to The Board ---
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: "Intelligence engine not configured. Set ANTHROPIC_API_KEY.",
        });
      }

      const anthropic = new Anthropic({ apiKey });
      // Partners get org-specific context; super admins get HQ context
      const systemPrompt = isPartnerEmail(userEmail)
        ? await buildPartnerContext(userEmail)
        : await buildSystemContext(userEmail);

      const messages = [
        ...history.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: message },
      ];

      const response = await anthropic.messages.create({
        model: process.env.CEO_CHAT_MODEL || "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      return res.json({
        success: true,
        response: text,
        routed: false,
        intentType: "strategic",
        blastRadius: "green",
      });
    } catch (err: any) {
      console.error("[CEOChat] Error:", err.message);
      return res.status(500).json({
        success: false,
        error: "Intelligence engine error. Try again.",
      });
    }
  }
);

export default ceoChatRoutes;
