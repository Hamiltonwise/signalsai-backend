/**
 * ICP Simulation Engine -- Execution Service
 *
 * Runs 7 personas against any customer-facing output to validate
 * messaging before it ships. The 3 minimum tests (Morgan, Shawn, Dani)
 * must ALL pass for the simulation to pass.
 *
 * Uses Claude API for persona evaluation. Falls back to keyword-based
 * scoring if no API key is available.
 *
 * Writes "quality.icp_simulation" event with results.
 */

import { db } from "../../database/connection";
import Anthropic from "@anthropic-ai/sdk";

// -- Types ------------------------------------------------------------------

export interface SimulationResult {
  persona: string;
  role: string;
  passed: boolean;
  score: number;
  feedback: string;
  dropOffPoint?: string;
}

export interface SimulationContent {
  type: "email" | "dashboard" | "notification" | "landing_page" | "checkup";
  headline: string;
  body: string;
  cta?: string;
}

export interface SimulationOutput {
  passed: boolean;
  results: SimulationResult[];
  minimumTests: {
    morgan8sec: boolean;
    shawnSpecificity: boolean;
    daniUniversality: boolean;
  };
}

interface PersonaConfig {
  name: string;
  role: string;
  testName: string;
  description: string;
  prompt: string;
  keywordCheck: (content: SimulationContent) => { passed: boolean; score: number; feedback: string; dropOffPoint?: string };
}

// -- Constants --------------------------------------------------------------

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  try {
    if (!anthropic) anthropic = new Anthropic();
    return anthropic;
  } catch {
    return null;
  }
}

// -- Personas ---------------------------------------------------------------

const PERSONAS: PersonaConfig[] = [
  {
    name: "Morgan",
    role: "Overwhelmed Year-One Owner",
    testName: "8-second test",
    description: "Bought a practice 9 months ago. Drowning in operational decisions. Has 8 seconds before she moves on.",
    prompt: `You are Morgan, a specialist who bought a practice 9 months ago. You are overwhelmed with operations, payroll, marketing, and patient care. You have exactly 8 seconds of attention for anything new.

Evaluate this content:
- Can you understand what this is about within 8 seconds?
- Is the language simple and direct, or does it use jargon that slows you down?
- Does the headline alone tell you why you should care?
- Would you keep reading or close the tab?

Score 1-10 (7+ passes). Identify the exact point where you would drop off, if any.`,
    keywordCheck: (content) => {
      const wordCount = content.headline.split(/\s+/).length;
      const hasJargon = /(?:synerg|leverage|optimize|holistic|paradigm|ecosystem|utilize)/i.test(content.headline + " " + content.body);
      const headlineClear = wordCount <= 12 && !hasJargon;
      const bodySimple = content.body.split(/[.!?]/).filter(Boolean).length > 0;
      const score = (headlineClear ? 5 : 2) + (bodySimple ? 3 : 1) + (hasJargon ? -2 : 2);
      const finalScore = Math.max(1, Math.min(10, score));
      return {
        passed: finalScore >= 7,
        score: finalScore,
        feedback: headlineClear
          ? "Headline is concise and clear. Morgan would keep reading."
          : "Headline is too long or uses jargon. Morgan closes the tab.",
        dropOffPoint: hasJargon ? "Jargon in the first sentence" : undefined,
      };
    },
  },
  {
    name: "Shawn",
    role: "Metrics Operator",
    testName: "specificity test",
    description: "Runs a 4-location group. Lives in spreadsheets. Will not act on anything without numbers.",
    prompt: `You are Shawn, a multi-location practice owner who runs everything by the numbers. You manage 4 locations and make decisions based on data, not feelings.

Evaluate this content:
- Are there specific numbers, percentages, or metrics?
- Is there a clear before/after comparison or quantified benefit?
- Would you trust this enough to forward it to your operations manager?
- Does it tell you something you could not calculate yourself?

Score 1-10 (7+ passes). If there are no real numbers, this fails automatically.`,
    keywordCheck: (content) => {
      const text = content.headline + " " + content.body;
      const numberMatches = text.match(/\d+[\d,.]*%?/g) || [];
      const hasComparison = /(?:more than|less than|compared to|vs\.?|increase|decrease|grew|dropped|from .+ to)/i.test(text);
      const hasMetrics = /(?:revenue|roi|score|rating|review|patient|conversion|rate|count|percent)/i.test(text);
      const score = Math.min(10, 2 + numberMatches.length * 2 + (hasComparison ? 2 : 0) + (hasMetrics ? 2 : 0));
      const finalScore = Math.max(1, score);
      return {
        passed: finalScore >= 7 && numberMatches.length > 0,
        score: finalScore,
        feedback: numberMatches.length > 0
          ? `Found ${numberMatches.length} data point(s). ${hasComparison ? "Includes comparison." : "Needs clearer before/after."}`
          : "No specific numbers found. Shawn does not act on vague claims.",
        dropOffPoint: numberMatches.length === 0 ? "No data in the first paragraph" : undefined,
      };
    },
  },
  {
    name: "Maria",
    role: "Reluctant Owner",
    testName: "trust test",
    description: "Inherited the practice. Never wanted to be a business owner. Distrusts anything that feels salesy or aggressive.",
    prompt: `You are Maria, a specialist who inherited a practice from a retiring mentor. You love clinical work but never wanted to run a business. You distrust anything that feels pushy, salesy, or aggressive.

Evaluate this content:
- Does this feel safe and supportive, or does it feel like a sales pitch?
- Is the tone respectful of someone who did not choose this path?
- Does it promise without pressuring?
- Would you feel comfortable showing this to your mentor?

Score 1-10 (7+ passes). Flag any language that feels manipulative or high-pressure.`,
    keywordCheck: (content) => {
      const text = content.headline + " " + content.body + " " + (content.cta || "");
      const salesyWords = /(?:act now|limited time|don't miss|exclusive|guaranteed|skyrocket|crush|dominate|explode|massive|urgent)/i;
      const hasSalesy = salesyWords.test(text);
      const supportiveWords = /(?:understand|help|support|clarity|simple|together|guide|free|no obligation)/i;
      const hasSupportive = supportiveWords.test(text);
      const score = 5 + (hasSalesy ? -3 : 2) + (hasSupportive ? 3 : 0);
      const finalScore = Math.max(1, Math.min(10, score));
      return {
        passed: finalScore >= 7,
        score: finalScore,
        feedback: hasSalesy
          ? "Contains high-pressure language. Maria would distrust this immediately."
          : hasSupportive
            ? "Tone is supportive and non-threatening. Maria would engage."
            : "Neutral tone. Could be warmer and more reassuring.",
      };
    },
  },
  {
    name: "Marcus",
    role: "DSO Holdout",
    testName: "mission test",
    description: "Turned down 3 DSO offers. Values independence above all. Will reject anything that feels like it erodes autonomy.",
    prompt: `You are Marcus, a practice owner who has turned down 3 acquisition offers from DSOs. You value your independence fiercely and are suspicious of any platform that might make you dependent on it.

Evaluate this content:
- Does this respect your autonomy and independence?
- Does it feel like a tool you control, or a system that controls you?
- Would this help you compete against DSOs, or make you more like one?
- Does it align with why you chose independent practice ownership?

Score 1-10 (7+ passes). Flag anything that implies dependency or loss of control.`,
    keywordCheck: (content) => {
      const text = content.headline + " " + content.body;
      const autonomyWords = /(?:your practice|your business|you control|your data|independent|freedom|ownership|your way)/i;
      const dependencyWords = /(?:lock.?in|required|mandatory|must use|exclusive|our platform|depend on us|subscription required)/i;
      const hasAutonomy = autonomyWords.test(text);
      const hasDependency = dependencyWords.test(text);
      const score = 5 + (hasAutonomy ? 3 : 0) + (hasDependency ? -3 : 2);
      const finalScore = Math.max(1, Math.min(10, score));
      return {
        passed: finalScore >= 7,
        score: finalScore,
        feedback: hasDependency
          ? "Language implies dependency or lock-in. Marcus walks away."
          : hasAutonomy
            ? "Respects independence. Marcus would listen."
            : "Neutral on autonomy. Could better emphasize owner control.",
      };
    },
  },
  {
    name: "Dani",
    role: "Non-Healthcare Owner",
    testName: "universality test",
    description: "Runs a barbershop with 3 chairs. No healthcare background. If a barber would not understand this, it fails.",
    prompt: `You are Dani, a barbershop owner with 3 chairs and 2 employees. You have no healthcare background whatsoever. You are a small business owner who cares about customers, reputation, and cash flow.

Evaluate this content:
- Can you understand every word without any industry-specific knowledge?
- Does this speak to universal business concerns (customers, reputation, revenue)?
- Would you find this relevant to YOUR business?
- Is there any jargon that only a healthcare professional would understand?

Score 1-10 (7+ passes). This fails automatically if there is ANY industry-specific jargon.`,
    keywordCheck: (content) => {
      const text = content.headline + " " + content.body;
      const healthcareJargon = /(?:patient|dental|clinical|provider|practitioner|hygienist|operatory|chairside|treatment plan|case acceptance|production|collections|perio|endo|ortho|implant|crown|filling|prophylaxis|recall|recare|new patient)/i;
      const hasJargon = healthcareJargon.test(text);
      const universalTerms = /(?:customer|client|business|revenue|growth|review|reputation|team|staff|schedule|booking)/i;
      const hasUniversal = universalTerms.test(text);
      const score = hasJargon ? 3 : 6 + (hasUniversal ? 3 : 1);
      const finalScore = Math.max(1, Math.min(10, score));
      return {
        passed: finalScore >= 7 && !hasJargon,
        score: finalScore,
        feedback: hasJargon
          ? "Contains industry-specific jargon. Dani has no idea what this means."
          : hasUniversal
            ? "Uses universal business language. Dani would understand and care."
            : "Language is generic but not specifically relatable to a small business owner.",
        dropOffPoint: hasJargon ? "Industry jargon in the content" : undefined,
      };
    },
  },
  {
    name: "James",
    role: "Veteran Founder",
    testName: "dignity test",
    description: "30 years in practice. Has seen every vendor pitch. Will reject anything that talks down to him or implies he is behind.",
    prompt: `You are James, a practice owner with 30 years of experience. You have built a successful business from scratch and have seen hundreds of vendor pitches. You demand respect for your experience and expertise.

Evaluate this content:
- Does this respect your experience and intelligence?
- Does it talk down to you or imply you are behind the times?
- Is the tone peer-to-peer, or vendor-to-prospect?
- Would you feel respected reading this, or patronized?

Score 1-10 (7+ passes). Flag any language that is condescending or implies incompetence.`,
    keywordCheck: (content) => {
      const text = content.headline + " " + content.body;
      const condescending = /(?:you need to|you should be|you're missing|you're behind|you don't know|wake up|stop doing|failing to|mistake)/i;
      const respectful = /(?:your expertise|your experience|you've built|your success|we understand|for leaders|for owners who)/i;
      const hasCondescending = condescending.test(text);
      const hasRespectful = respectful.test(text);
      const score = 5 + (hasCondescending ? -3 : 2) + (hasRespectful ? 3 : 0);
      const finalScore = Math.max(1, Math.min(10, score));
      return {
        passed: finalScore >= 7,
        score: finalScore,
        feedback: hasCondescending
          ? "Condescending tone detected. James has been doing this for 30 years and does not need to be told he is behind."
          : hasRespectful
            ? "Tone respects experience. James would engage as a peer."
            : "Neutral tone. Could better acknowledge the reader's expertise.",
      };
    },
  },
  {
    name: "Jordan",
    role: "Skeptical COO",
    testName: "brittleness test",
    description: "COO of a 6-location group. First question is always: what breaks if the data is wrong?",
    prompt: `You are Jordan, COO of a 6-location practice group. You are responsible for operations and risk. Your first question about any system or report is: "What breaks if the data is wrong?"

Evaluate this content:
- Does it acknowledge data limitations or potential inaccuracies?
- Is there a clear source for any claims or numbers?
- What happens if the underlying data is stale, missing, or incorrect?
- Would you trust this enough to make an operational decision based on it?

Score 1-10 (7+ passes). Flag any unsourced claims or brittle assumptions.`,
    keywordCheck: (content) => {
      const text = content.headline + " " + content.body;
      const hasSource = /(?:source|based on|according to|data from|as of|updated|verified|from your|from google|public data)/i.test(text);
      const hasHedge = /(?:approximately|estimated|may|could|typically|on average|based on available)/i.test(text);
      const hasAbsolute = /(?:guaranteed|always|never|definitely|certainly|100%|every single)/i.test(text);
      const score = 4 + (hasSource ? 3 : 0) + (hasHedge ? 2 : 0) + (hasAbsolute ? -2 : 1);
      const finalScore = Math.max(1, Math.min(10, score));
      return {
        passed: finalScore >= 7,
        score: finalScore,
        feedback: hasAbsolute
          ? "Contains absolute claims without hedging. Jordan asks: what if the data is wrong?"
          : hasSource
            ? "Sources are cited. Jordan would review further."
            : "No clear data source. Jordan would question the basis for these claims.",
      };
    },
  },
];

// -- Core -------------------------------------------------------------------

/**
 * Run the ICP simulation against a piece of customer-facing content.
 * Returns pass/fail for each persona plus the 3 minimum gate tests.
 */
export async function runSimulation(
  content: SimulationContent
): Promise<SimulationOutput> {
  const client = getAnthropic();
  const useAI = !!client && !!process.env.ANTHROPIC_API_KEY;

  const results: SimulationResult[] = [];

  for (const persona of PERSONAS) {
    let result: SimulationResult;

    if (useAI) {
      result = await evaluateWithClaude(client!, persona, content);
    } else {
      const check = persona.keywordCheck(content);
      result = {
        persona: persona.name,
        role: persona.role,
        passed: check.passed,
        score: check.score,
        feedback: check.feedback,
        dropOffPoint: check.dropOffPoint,
      };
    }

    results.push(result);
  }

  // Extract minimum test results
  const morganResult = results.find((r) => r.persona === "Morgan");
  const shawnResult = results.find((r) => r.persona === "Shawn");
  const daniResult = results.find((r) => r.persona === "Dani");

  const minimumTests = {
    morgan8sec: morganResult?.passed ?? false,
    shawnSpecificity: shawnResult?.passed ?? false,
    daniUniversality: daniResult?.passed ?? false,
  };

  const passed =
    minimumTests.morgan8sec &&
    minimumTests.shawnSpecificity &&
    minimumTests.daniUniversality;

  const output: SimulationOutput = { passed, results, minimumTests };

  // Write simulation event
  await writeSimulationEvent(content, output);

  return output;
}

// -- Claude Evaluation ------------------------------------------------------

async function evaluateWithClaude(
  client: Anthropic,
  persona: PersonaConfig,
  content: SimulationContent
): Promise<SimulationResult> {
  try {
    const contentText = [
      `Type: ${content.type}`,
      `Headline: ${content.headline}`,
      `Body: ${content.body}`,
      content.cta ? `CTA: ${content.cta}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `${persona.prompt}\n\n--- CONTENT TO EVALUATE ---\n${contentText}\n\n--- RESPONSE FORMAT ---\nRespond in exactly this JSON format:\n{"score": <1-10>, "passed": <true if score >= 7>, "feedback": "<2-3 sentences>", "dropOffPoint": "<where you stopped reading, or null>"}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        persona: persona.name,
        role: persona.role,
        passed: parsed.passed ?? parsed.score >= 7,
        score: Math.max(1, Math.min(10, parsed.score ?? 5)),
        feedback: parsed.feedback ?? "No feedback provided.",
        dropOffPoint: parsed.dropOffPoint ?? undefined,
      };
    }

    // Fallback: could not parse AI response, use keyword check
    const fallback = persona.keywordCheck(content);
    return {
      persona: persona.name,
      role: persona.role,
      ...fallback,
    };
  } catch (err: any) {
    console.error(
      `[ICPSimulation] Claude evaluation failed for ${persona.name}:`,
      err.message
    );
    // Fall back to keyword-based scoring
    const fallback = persona.keywordCheck(content);
    return {
      persona: persona.name,
      role: persona.role,
      ...fallback,
    };
  }
}

// -- Writers ----------------------------------------------------------------

async function writeSimulationEvent(
  content: SimulationContent,
  output: SimulationOutput
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "quality.icp_simulation",
      properties: JSON.stringify({
        content_type: content.type,
        headline: content.headline.substring(0, 200),
        passed: output.passed,
        minimum_tests: output.minimumTests,
        persona_scores: output.results.map((r) => ({
          persona: r.persona,
          score: r.score,
          passed: r.passed,
        })),
        average_score:
          output.results.reduce((sum, r) => sum + r.score, 0) /
          output.results.length,
        evaluated_at: new Date().toISOString(),
      }),
    });
  } catch (err: any) {
    console.error(
      `[ICPSimulation] Failed to write simulation event:`,
      err.message
    );
  }
}
