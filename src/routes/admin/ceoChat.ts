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

const ceoChatRoutes = express.Router();

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

    // Calculate revenue
    const tierPricing: Record<string, number> = { DWY: 997, DFY: 2497 };
    const activeOrgs = orgs.filter(
      (o: any) => o.subscription_status === "active" || o.subscription_tier
    );
    const mrr = activeOrgs.reduce(
      (sum: number, o: any) => sum + (tierPricing[o.subscription_tier || "DWY"] ?? 0),
      0
    );

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

RULES:
- Never use em-dashes. Use commas or periods.
- Never use "practice" or "patient" in universal contexts. Use "business" and "customer."
- Be specific. Name the client, name the number, name the action.
- Actions compound. Suggestions decay. Prefer recommending actions the system can take autonomously.
- If you don't know something, say so. Never hallucinate data.`;
  } catch (err: any) {
    const mentorFallback = getMentorContext(userEmail);
    return `You are an intelligence advisor for Alloro. Data context failed to load: ${err.message}. Answer based on general Alloro knowledge.\n\n${mentorFallback}`;
  }
}

ceoChatRoutes.post(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const { message, history = [] } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ success: false, error: "Message is required" });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: "Intelligence engine not configured. Set ANTHROPIC_API_KEY.",
        });
      }

      const anthropic = new Anthropic({ apiKey });
      const userEmail = req.user?.email || "unknown";
      const systemPrompt = await buildSystemContext(userEmail);

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

      return res.json({ success: true, response: text });
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
