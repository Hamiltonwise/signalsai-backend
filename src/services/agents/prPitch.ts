/**
 * PR Pitch Generator Agent
 *
 * Generates targeted pitches for tech press and Anthropic.
 * Each target gets a distinct angle calibrated to the audience.
 * Falls back to templates when no Claude API key is available.
 *
 * Writes "pr.pitch_generated" behavioral_event on each run.
 */

import { db } from "../../database/connection";
import Anthropic from "@anthropic-ai/sdk";

// -- Types ------------------------------------------------------------------

type PitchTarget = "anthropic" | "techcrunch" | "saastr" | "vertical_press";

export interface PitchResult {
  subject: string;
  body: string;
  angle: string;
}

// -- Constants --------------------------------------------------------------

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

const PITCH_ANGLES: Record<PitchTarget, string> = {
  anthropic:
    "3 people + Claude built a category. Here's the proof.",
  techcrunch:
    "The fastest bootstrapped vertical SaaS, powered by AI agents",
  saastr:
    "47 AI agents replace a 200-person team. Here are the unit economics.",
  vertical_press:
    "Business Clarity Score: the credit score for your business's online presence",
};

const PITCH_CONTEXT: Record<PitchTarget, string> = {
  anthropic: `You are pitching Anthropic's developer relations and case study team. They care about:
- Novel use of Claude in production (not toys, not demos)
- Agent architectures that actually work at scale
- Small teams achieving outsized impact with AI
- Real business outcomes, not vanity metrics
Focus on the agent architecture: 47 agents, shared memory protocol, behavioral events, heuristic calibration loops. Emphasize that 3 people (founder, COO on leave, offshore CTO) built what would normally require 200+ staff.`,

  techcrunch: `You are pitching a TechCrunch reporter covering AI startups. They care about:
- Speed and scale of growth (bootstrapped, no VC)
- Contrarian bets that are working
- Category creation, not incremental improvement
- Founder story arc
Frame Alloro as the company that created "Business Clarity" as a category. Highlight the Business Clarity Score as the first credit-score-equivalent for online business presence.`,

  saastr: `You are pitching a SaaStr editor or conference curator. They care about:
- Unit economics and efficiency metrics
- PLG (product-led growth) mechanics
- How AI reduces CAC and increases LTV
- Benchmarks other SaaS founders can learn from
Lead with the unit economics: how 47 AI agents replace roles that would cost $X/year in salary. Show the math on agent cost vs. human cost. Include the Monday briefing as a retention mechanic.`,

  vertical_press: `You are pitching a trade publication editor for a specific business vertical. They care about:
- How their readers' businesses can improve
- Practical tools, not abstract technology
- Credibility indicators (data, testimonials, scores)
- What makes this different from existing solutions
Lead with the Business Clarity Score concept. Explain it as "the credit score for your business's online presence." Make it tangible: "In 60 seconds, you see exactly what your customers see when they search for you."`,
};

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// -- Core -------------------------------------------------------------------

/**
 * Generate a targeted PR pitch for the specified audience.
 * Uses Claude to craft the pitch when available, falls back to templates.
 */
export async function generatePitch(
  target: PitchTarget
): Promise<PitchResult> {
  const angle = PITCH_ANGLES[target];

  // Gather recent metrics for the pitch
  const metrics = await gatherMetrics();

  const client = getAnthropic();
  let result: PitchResult;

  if (client) {
    result = await generateWithClaude(client, target, angle, metrics);
  } else {
    result = generateFromTemplate(target, angle, metrics);
  }

  // Write behavioral event
  await writePitchEvent(target, result);

  console.log(`[PRPitch] Pitch generated for ${target}: "${result.subject}"`);

  return result;
}

// -- Metrics ----------------------------------------------------------------

interface PitchMetrics {
  totalOrgs: number;
  totalAgents: number;
  avgClarityScore: number;
  teamSize: number;
  monthsLive: number;
}

async function gatherMetrics(): Promise<PitchMetrics> {
  const orgCount = await db("organizations")
    .count("id as count")
    .first()
    .catch(() => ({ count: 0 }));

  const avgScore = await db("organizations")
    .whereNotNull("clarity_score")
    .avg("clarity_score as avg")
    .first()
    .catch(() => ({ avg: 0 }));

  return {
    totalOrgs:
      typeof orgCount?.count === "string"
        ? parseInt(orgCount.count, 10)
        : Number(orgCount?.count || 0),
    totalAgents: 47,
    avgClarityScore: avgScore?.avg
      ? Math.round(Number(avgScore.avg) * 10) / 10
      : 0,
    teamSize: 3,
    monthsLive: 6, // approximate, updated as the product grows
  };
}

// -- Claude Generation ------------------------------------------------------

async function generateWithClaude(
  client: Anthropic,
  target: PitchTarget,
  angle: string,
  metrics: PitchMetrics
): Promise<PitchResult> {
  try {
    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 2000,
      system: `You are a PR pitch writer for Alloro, a Business Clarity platform. You write concise, compelling pitches that journalists actually open and read.

Rules:
- No em-dashes. Use commas or periods instead.
- Subject line must be under 60 characters and create curiosity.
- Body must be under 300 words.
- Include one specific data point in the first sentence of the body.
- End with a clear, low-friction ask (demo, 15-min call, or quote for story).
- Never use buzzwords: "revolutionize," "disrupt," "synergy," "leverage."
- Sound like a human, not a press release.

${PITCH_CONTEXT[target]}

Return valid JSON:
{
  "subject": "string (under 60 chars)",
  "body": "string (under 300 words)"
}`,
      messages: [
        {
          role: "user",
          content: `Generate a ${target} pitch.

Angle: ${angle}

Current metrics:
- ${metrics.totalOrgs} businesses on the platform
- ${metrics.totalAgents} AI agents in production
- ${metrics.avgClarityScore} average Business Clarity Score
- ${metrics.teamSize}-person team
- ${metrics.monthsLive} months live

Company: Alloro (alloro.io)
Founder: Corey (built the category "Business Clarity")
Product: Business Clarity Score + AI agent team that replaces a 200-person org`,
        },
      ],
    });

    const responseText =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return {
      subject: String(parsed.subject || `${angle}`).slice(0, 60),
      body: String(parsed.body || "Pitch generation incomplete."),
      angle,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PRPitch] Claude generation failed:", message);
    return generateFromTemplate(target, angle, {} as PitchMetrics);
  }
}

// -- Template Fallback ------------------------------------------------------

function generateFromTemplate(
  target: PitchTarget,
  angle: string,
  metrics: PitchMetrics
): PitchResult {
  const templates: Record<PitchTarget, { subject: string; body: string }> = {
    anthropic: {
      subject: "3 people + Claude = a new SaaS category",
      body: [
        `We built Alloro with ${metrics.teamSize || 3} people and ${metrics.totalAgents || 47} Claude-powered agents.`,
        "",
        "Alloro is a Business Clarity platform that gives business owners a single score for their online presence health,",
        "plus an AI agent team that acts on the findings. Monday morning, every owner gets a brief with one action.",
        "The agents handle the rest.",
        "",
        "The architecture: shared memory protocol, behavioral events, heuristic calibration loops.",
        "Every agent reads from the same context, records its actions, and closes the loop.",
        "No agent reviews its own work.",
        "",
        "We would love to share the technical architecture for a case study or developer blog post.",
        "15 minutes of your time, and we will show you the agent graph live.",
      ].join("\n"),
    },
    techcrunch: {
      subject: "Bootstrapped AI SaaS just created a category",
      body: [
        "Business Clarity did not exist as a category six months ago. Now it does.",
        "",
        `Alloro gives every business owner a clarity score for their online presence (avg: ${metrics.avgClarityScore || "N/A"}).`,
        `${metrics.totalAgents || 47} AI agents do the work of a 200-person team. ${metrics.teamSize || 3} humans run the company.`,
        "",
        "No VC. No bloated team. Just a founder who trained as a specialist,",
        "bought a business, realized he had accidentally bought a second job,",
        "and built the solution he wished existed.",
        "",
        "Happy to share growth numbers and the full agent architecture for a story.",
      ].join("\n"),
    },
    saastr: {
      subject: "47 AI agents, 3 humans, $0 in funding",
      body: [
        `${metrics.totalAgents || 47} AI agents replace what would require 200+ staff roles.`,
        `Total team: ${metrics.teamSize || 3} people. Total VC raised: $0.`,
        "",
        "Each agent costs pennies per run. A human in the same role costs $60,000-$120,000/year.",
        "The math is not close.",
        "",
        "Alloro's product-led growth loop: free checkup, clarity score in 60 seconds,",
        "Monday briefing retention mechanic, agent-powered expansion.",
        "",
        "Would love to present the unit economics at SaaStr Annual.",
        "The session writes itself: 'How 3 People Built a 200-Person Company with AI.'",
      ].join("\n"),
    },
    vertical_press: {
      subject: "The credit score for your online presence",
      body: [
        "What if every business owner could see their online presence the way their customers see it?",
        "",
        "The Business Clarity Score is a 0-100 composite measuring review velocity, response engagement,",
        "search visibility, and competitive positioning. Think credit score, but for your business's digital health.",
        "",
        "60 seconds to run. Free. No login required for the initial checkup.",
        "",
        `${metrics.totalOrgs || "Hundreds of"} businesses have already checked their score.`,
        "The ones who act on it see measurable improvement within 30 days.",
        "",
        "Happy to provide a demo or a guest article for your readers.",
      ].join("\n"),
    },
  };

  const template = templates[target];
  return {
    subject: template.subject,
    body: template.body,
    angle,
  };
}

// -- Event Writing ----------------------------------------------------------

async function writePitchEvent(
  target: PitchTarget,
  result: PitchResult
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "pr.pitch_generated",
      properties: JSON.stringify({
        target,
        subject: result.subject,
        angle: result.angle,
        body_length: result.body.length,
        generated_at: new Date().toISOString(),
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PRPitch] Failed to write pitch event:", message);
  }
}
