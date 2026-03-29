/**
 * Guest Research Agent -- On-demand Service
 *
 * Not a cron job. Called 48 hours before a podcast recording.
 * Accepts guestName, guestCompany, topic.
 * Uses webFetch to research the guest, then Claude to generate
 * a comprehensive brief with background, suggested questions,
 * and connection points to Alloro.
 *
 * Returns { brief, suggestedQuestions[], connectionPoints[] }.
 * Writes "content.guest_brief_produced" event to behavioral_events.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../database/connection";
import { fetchPage, extractText } from "../webFetch";

// -- Types ------------------------------------------------------------------

interface GuestResearchInput {
  guestName: string;
  guestCompany: string;
  topic: string;
}

interface SuggestedQuestion {
  question: string;
  whyItMatters: string;
  gapItFills: string;
  expectedEmotionalRegister: string;
}

interface GuestBrief {
  background: string;
  keyAchievements: string[];
  currentFocus: string;
  connectionToAlloro: string;
  openingQuestion: string;
  theUntoldStory: string;
}

interface GuestResearchResult {
  brief: GuestBrief;
  suggestedQuestions: SuggestedQuestion[];
  connectionPoints: string[];
  researchSources: string[];
  mode: "ai" | "template";
}

// -- Template Fallback ------------------------------------------------------

function generateTemplateBrief(input: GuestResearchInput): GuestResearchResult {
  return {
    brief: {
      background: `${input.guestName} is associated with ${input.guestCompany}. [Manual research needed: career trajectory, stated mission, public record.]`,
      keyAchievements: [
        `[Research needed: key milestones at ${input.guestCompany}]`,
        "[Research needed: published work, talks, keynotes]",
        "[Research needed: public metrics or recognition]",
      ],
      currentFocus: `[Research needed: what ${input.guestName} is currently working on and publicly sharing about]`,
      connectionToAlloro: `[Research needed: how does ${input.guestName}'s work connect to giving business owners the life they set out to build? Look for service background, purpose-driven work, or local business angles.]`,
      openingQuestion: `[CRITICAL: This must be specific and personal. Reference something ${input.guestName} has shared publicly that shows you prepared. Never use "tell me about your journey." Check their earliest interviews, personal blog posts, and social media for the real story.]`,
      theUntoldStory: `[Layer 4 research needed: Find the turning point in ${input.guestName}'s story. Check earliest interviews before media training polished the edges. Look for personal blog posts. Find the gap between public position and actual behavior.]`,
    },
    suggestedQuestions: [
      {
        question: `What was the moment you knew ${input.guestCompany} was going to work, and what almost made you quit before that moment?`,
        whyItMatters: "Reveals the real struggle behind the public success story",
        gapItFills: "Most interviewers only ask about the success, not the near-failure",
        expectedEmotionalRegister: "Vulnerable, reflective",
      },
      {
        question: `You have talked a lot about [topic area]. What is the one thing you believe about ${input.topic} that most people in your industry would disagree with?`,
        whyItMatters: "Surfaces genuine conviction vs. consensus thinking",
        gapItFills: "Contrarian views are rarely explored in friendly interviews",
        expectedEmotionalRegister: "Passionate, convicted",
      },
      {
        question: "If you could go back to the version of yourself who was just starting, what would you tell them to stop worrying about?",
        whyItMatters: "Gets past rehearsed advice to real emotional truth",
        gapItFills: "Advice questions usually get polished answers. This one invites honesty about wasted worry.",
        expectedEmotionalRegister: "Warm, honest",
      },
      {
        question: `What is the hardest decision you have made at ${input.guestCompany} that you have never talked about publicly?`,
        whyItMatters: "This is the Layer 4 question. The story they have never told.",
        gapItFills: "Most interviews stay on the surface. This goes deeper.",
        expectedEmotionalRegister: "Thoughtful, possibly emotional",
      },
      {
        question: `What does freedom mean to you now versus when you started ${input.guestCompany}?`,
        whyItMatters: "Connects to Alloro's core mission: giving business owners the life they set out to build",
        gapItFills: "The definition of freedom evolves. This question maps that evolution.",
        expectedEmotionalRegister: "Reflective, grounded",
      },
    ],
    connectionPoints: [
      `Both Corey and ${input.guestName} built businesses to solve problems they experienced firsthand`,
      `${input.topic} connects to Alloro's Business Clarity category`,
      `[Research needed: specific shared values, experiences, or audiences]`,
    ],
    researchSources: [],
    mode: "template",
  };
}

// -- Core -------------------------------------------------------------------

/**
 * Generate a comprehensive guest research brief.
 */
export async function researchGuest(
  input: GuestResearchInput
): Promise<GuestResearchResult> {
  // Attempt to gather public information
  const researchData = await gatherResearch(input);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[GuestResearch] No ANTHROPIC_API_KEY set. Using template fallback."
    );
    const result = generateTemplateBrief(input);
    result.researchSources = researchData.sources;
    await writeResearchEvent(input, result);
    return result;
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      messages: [
        {
          role: "user",
          content: `You are the Guest Research Agent for Corey Wise, founder of Alloro. Produce a comprehensive guest brief. Return ONLY valid JSON.

Guest: ${input.guestName}
Company: ${input.guestCompany}
Conversation Topic: ${input.topic}

Research gathered:
${researchData.text || "No external research available. Use your training knowledge only."}

Four Research Layers to address:
1. PUBLIC RECORD: Career trajectory, published work, past interviews, company history
2. GAPS: What has this person never been asked? Topics they care about but rarely explore?
3. FOUNDATION LENS: Connection to military service, purpose beyond profit, giving business owners freedom?
4. THE MOMENT: One story they have never told publicly. Found in earliest interviews, personal posts, the gap between public position and behavior.

The 30-Second Rule: If the guest does not feel seen within 30 seconds, the interview becomes transactional. The opening question is the most important moment.

Rules:
- Opening question MUST reference something specific and personal. Never "tell me about your journey."
- Each suggested question includes: the question, why it matters, the gap it fills, expected emotional register
- Connection points must be specific to Alloro's mission: giving business owners the life they set out to build
- No em-dashes. Use commas, periods, or semicolons.
- If you cannot find a clear untold story, say so honestly.

Return JSON:
{
  "brief": {
    "background": "3-sentence career summary",
    "keyAchievements": ["string", "string", "string"],
    "currentFocus": "string",
    "connectionToAlloro": "string",
    "openingQuestion": "string - must reference something specific and personal",
    "theUntoldStory": "string - Layer 4 finding, or honest flag that none was found"
  },
  "suggestedQuestions": [
    {
      "question": "string",
      "whyItMatters": "string",
      "gapItFills": "string",
      "expectedEmotionalRegister": "string"
    }
  ],
  "connectionPoints": ["string"]
}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const parsed = JSON.parse(text);

    const result: GuestResearchResult = {
      brief: {
        background: parsed.brief?.background || "",
        keyAchievements: parsed.brief?.keyAchievements || [],
        currentFocus: parsed.brief?.currentFocus || "",
        connectionToAlloro: parsed.brief?.connectionToAlloro || "",
        openingQuestion: parsed.brief?.openingQuestion || "",
        theUntoldStory: parsed.brief?.theUntoldStory || "",
      },
      suggestedQuestions: (parsed.suggestedQuestions || []).map((q: any) => ({
        question: q.question || "",
        whyItMatters: q.whyItMatters || "",
        gapItFills: q.gapItFills || "",
        expectedEmotionalRegister: q.expectedEmotionalRegister || "",
      })),
      connectionPoints: parsed.connectionPoints || [],
      researchSources: researchData.sources,
      mode: "ai",
    };

    await writeResearchEvent(input, result);

    console.log(
      `[GuestResearch] Brief generated for ${input.guestName} (AI mode, ${result.suggestedQuestions.length} questions)`
    );
    return result;
  } catch (err: any) {
    console.error(
      "[GuestResearch] Claude API failed, falling back to template:",
      err.message
    );
    const result = generateTemplateBrief(input);
    result.researchSources = researchData.sources;
    await writeResearchEvent(input, result);
    return result;
  }
}

// -- Research Gathering -----------------------------------------------------

async function gatherResearch(
  input: GuestResearchInput
): Promise<{ text: string; sources: string[] }> {
  const sources: string[] = [];
  const textParts: string[] = [];

  // Try to fetch the guest's company website
  const companyUrl = inferCompanyUrl(input.guestCompany);
  if (companyUrl) {
    try {
      const page = await fetchPage(companyUrl);
      if (page.success && page.html) {
        const text = await extractText(page.html);
        textParts.push(
          `Company website (${companyUrl}):\n${text.substring(0, 2000)}`
        );
        sources.push(companyUrl);
      }
    } catch {
      // Best effort
    }
  }

  // Check behavioral_events for any prior interactions
  try {
    const priorEvents = await db("behavioral_events")
      .whereRaw("properties::text ILIKE ?", [`%${input.guestName}%`])
      .orderBy("created_at", "desc")
      .limit(5);

    if (priorEvents.length > 0) {
      textParts.push(
        `Prior Alloro interactions: ${priorEvents.length} events found involving ${input.guestName}`
      );
      sources.push("Alloro behavioral_events");
    }
  } catch {
    // Best effort
  }

  return {
    text: textParts.join("\n\n"),
    sources,
  };
}

function inferCompanyUrl(companyName: string): string | null {
  // Simple heuristic: try common URL patterns
  const cleaned = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
  if (!cleaned) return null;
  return `https://www.${cleaned}.com`;
}

// -- Writers ----------------------------------------------------------------

async function writeResearchEvent(
  input: GuestResearchInput,
  result: GuestResearchResult
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.guest_brief_produced",
      properties: JSON.stringify({
        guest_name: input.guestName,
        guest_company: input.guestCompany,
        topic: input.topic,
        mode: result.mode,
        question_count: result.suggestedQuestions.length,
        connection_points: result.connectionPoints.length,
        research_sources: result.researchSources,
        has_untold_story: !result.brief.theUntoldStory.includes("[Research needed"),
      }),
    });
  } catch (err: any) {
    console.error(
      "[GuestResearch] Failed to write research event:",
      err.message
    );
  }
}
