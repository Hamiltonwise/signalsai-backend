/**
 * Conference Intelligence Agent -- Execution Service
 *
 * On-demand function for pre-conference preparation.
 * Accepts conference details, uses webFetch to research the event,
 * and generates a structured conference brief with talking points,
 * competitor booth intelligence, and target prospect list.
 *
 * Writes "growth.conference_intel" event.
 */

import { db } from "../../database/connection";
import { fetchPage } from "../webFetch";
import Anthropic from "@anthropic-ai/sdk";

// -- Types ------------------------------------------------------------------

export interface ConferenceInput {
  conferenceName: string;
  dates: string;
  location: string;
  targetAttendees?: string[];
  conferenceUrl?: string;
  exhibitorListUrl?: string;
  scheduleUrl?: string;
}

interface ConferenceBrief {
  conferenceName: string;
  dates: string;
  location: string;
  talkingPoints: string[];
  competitorBooths: Array<{
    name: string;
    boothInfo?: string;
    strategy: string;
  }>;
  targetProspects: Array<{
    name: string;
    role: string;
    reason: string;
  }>;
  scheduleHighlights: string[];
  overallStrategy: string;
  preparedAt: string;
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

// -- Core -------------------------------------------------------------------

/**
 * Generate a conference intelligence brief.
 * This is an on-demand function, not a scheduled cron job.
 */
export async function generateConferenceBrief(
  input: ConferenceInput
): Promise<ConferenceBrief> {
  // Gather web research
  const research: Record<string, string> = {};

  // Fetch conference main page
  if (input.conferenceUrl) {
    const result = await fetchPage(input.conferenceUrl);
    if (result.success && result.html) {
      research.mainPage = extractTextContent(result.html).substring(0, 5000);
    }
  }

  // Fetch exhibitor list
  if (input.exhibitorListUrl) {
    const result = await fetchPage(input.exhibitorListUrl);
    if (result.success && result.html) {
      research.exhibitors = extractTextContent(result.html).substring(0, 5000);
    }
  }

  // Fetch schedule
  if (input.scheduleUrl) {
    const result = await fetchPage(input.scheduleUrl);
    if (result.success && result.html) {
      research.schedule = extractTextContent(result.html).substring(0, 5000);
    }
  }

  // Generate brief
  const client = getAnthropic();
  const useAI = !!client && !!process.env.ANTHROPIC_API_KEY;

  let brief: ConferenceBrief;

  if (useAI) {
    brief = await generateWithClaude(client!, input, research);
  } else {
    brief = generateFallbackBrief(input, research);
  }

  // Write event
  await writeConferenceIntelEvent(brief);

  console.log(
    `[ConferenceIntelligence] Brief generated for ${input.conferenceName}`
  );

  return brief;
}

// -- Claude Generation ------------------------------------------------------

async function generateWithClaude(
  client: Anthropic,
  input: ConferenceInput,
  research: Record<string, string>
): Promise<ConferenceBrief> {
  try {
    const researchContext = Object.entries(research)
      .map(([key, value]) => `## ${key}\n${value}`)
      .join("\n\n---\n\n");

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a conference intelligence analyst for Alloro, a universal business clarity platform for licensed specialists.

Conference: ${input.conferenceName}
Dates: ${input.dates}
Location: ${input.location}
Target attendees: ${input.targetAttendees?.join(", ") || "General attendees"}

${researchContext ? `Research gathered:\n${researchContext}` : "No web research was available."}

Generate a conference brief in this exact JSON format:
{
  "talkingPoints": ["Point 1 - specific to this conference and audience", "Point 2", "Point 3", "Point 4", "Point 5"],
  "competitorBooths": [
    {"name": "Competitor Name", "boothInfo": "If known", "strategy": "How to position against them at this event"}
  ],
  "targetProspects": [
    {"name": "Type of attendee", "role": "Their role", "reason": "Why they're a good prospect for Alloro"}
  ],
  "scheduleHighlights": ["Session or event worth attending and why"],
  "overallStrategy": "3-5 sentence conference strategy"
}

Rules:
- Talking points should reference the specific conference context, not generic sales points
- Competitor booths: only include competitors you actually found evidence of in the research
- Target prospects: if specific names are not available, describe prospect archetypes
- Do not use em-dashes (use commas or periods instead)
- Focus on conversations that lead to the Free Referral Base Checkup as first value`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        conferenceName: input.conferenceName,
        dates: input.dates,
        location: input.location,
        talkingPoints: parsed.talkingPoints || [],
        competitorBooths: parsed.competitorBooths || [],
        targetProspects: parsed.targetProspects || [],
        scheduleHighlights: parsed.scheduleHighlights || [],
        overallStrategy: parsed.overallStrategy || "No strategy generated.",
        preparedAt: new Date().toISOString(),
      };
    }
  } catch (err: any) {
    console.error(
      `[ConferenceIntelligence] Claude generation failed:`,
      err.message
    );
  }

  return generateFallbackBrief(input, research);
}

// -- Fallback ---------------------------------------------------------------

function generateFallbackBrief(
  input: ConferenceInput,
  research: Record<string, string>
): ConferenceBrief {
  const hasExhibitors = !!research.exhibitors;
  const hasSchedule = !!research.schedule;

  // Known competitors to look for in exhibitor lists
  const knownCompetitors = [
    "Dental Intelligence",
    "Jarvis Analytics",
    "Practice by Numbers",
    "Sikka",
    "RevenueWell",
    "Weave",
    "Birdeye",
    "Podium",
  ];

  const competitorBooths: ConferenceBrief["competitorBooths"] = [];
  if (hasExhibitors) {
    for (const comp of knownCompetitors) {
      if (research.exhibitors.toLowerCase().includes(comp.toLowerCase())) {
        competitorBooths.push({
          name: comp,
          strategy: `${comp} will likely be exhibiting. Position Alloro as the universal alternative that works across verticals.`,
        });
      }
    }
  }

  return {
    conferenceName: input.conferenceName,
    dates: input.dates,
    location: input.location,
    talkingPoints: [
      "Lead with the Free Referral Base Checkup. It is the fastest way to demonstrate value.",
      "Ask: 'Do you know which of your referral sources are actually sending you patients?'",
      "Share a sample Checkup report on your phone. Visual proof beats any pitch.",
      "Connect the insight to their revenue: 'Most practices discover 30-40% of their referral base has gone silent.'",
      "Close with the zero-risk offer: 'We can run this for your practice in 48 hours, completely free.'",
    ],
    competitorBooths,
    targetProspects: [
      {
        name: "Practice Owner (1-3 locations)",
        role: "Owner/Operator",
        reason: "Most likely to feel the pain of opacity. Hands-on enough to appreciate the Checkup results.",
      },
      {
        name: "Multi-location Group COO",
        role: "COO/Operations",
        reason: "Manages data across locations. Needs consolidated intelligence.",
      },
      {
        name: "Associate looking to buy",
        role: "Associate/Future Owner",
        reason: "Evaluating practices. Alloro Checkup data would be invaluable for due diligence.",
      },
    ],
    scheduleHighlights: hasSchedule
      ? ["Review the full schedule for panels on practice management, technology, or business growth."]
      : ["Schedule not available. Check the conference website closer to the event."],
    overallStrategy: `Focus on conversations, not booth traffic. The Free Referral Base Checkup is the conversation starter. Every interaction should end with a phone number or email to send the Checkup link. ${competitorBooths.length > 0 ? `${competitorBooths.length} known competitor(s) may be exhibiting.` : "No competitor presence confirmed yet."} Qualify prospects by asking about their current visibility into referral patterns.`,
    preparedAt: new Date().toISOString(),
  };
}

// -- Utilities --------------------------------------------------------------

function extractTextContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// -- Writers ----------------------------------------------------------------

async function writeConferenceIntelEvent(
  brief: ConferenceBrief
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "growth.conference_intel",
      properties: JSON.stringify({
        conference_name: brief.conferenceName,
        dates: brief.dates,
        location: brief.location,
        talking_points_count: brief.talkingPoints.length,
        competitor_booths_count: brief.competitorBooths.length,
        target_prospects_count: brief.targetProspects.length,
        prepared_at: brief.preparedAt,
      }),
    });
  } catch (err: any) {
    console.error(
      `[ConferenceIntelligence] Failed to write conference intel event:`,
      err.message
    );
  }
}
