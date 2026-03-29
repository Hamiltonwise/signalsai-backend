/**
 * Script Writer Agent -- On-demand Service
 *
 * Not a cron job. Called when a topic is approved.
 * Accepts topic, targetLength, tone, keyPoints.
 * Uses Claude API to generate word-for-word video scripts
 * in Corey's voice. Falls back to outline template if no API key.
 *
 * Returns { title, hook, sections[], cta, estimatedDuration }.
 * Writes "content.script_produced" event to behavioral_events.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface ScriptInput {
  topic: string;
  targetLength: "short" | "medium" | "long";
  tone: "direct" | "conversational" | "vulnerable" | "urgent";
  keyPoints: string[];
}

interface ScriptSection {
  label: string;
  content: string;
  timingMark: string;
}

interface ScriptResult {
  title: string;
  hook: string;
  sections: ScriptSection[];
  cta: string;
  estimatedDuration: string;
  energyDirection: string;
  wardrobeNote: string;
  eyeDirection: string;
  thumbnailConcept: string;
  mode: "ai" | "template";
}

// -- Length Config -----------------------------------------------------------

const LENGTH_CONFIG = {
  short: { label: "LinkedIn Native Video", seconds: 90, maxTokens: 1500 },
  medium: { label: "YouTube Long-Form", seconds: 420, maxTokens: 4000 },
  long: { label: "Podcast Solo", seconds: 1200, maxTokens: 6000 },
};

// -- Template Fallback ------------------------------------------------------

function generateTemplateScript(input: ScriptInput): ScriptResult {
  const config = LENGTH_CONFIG[input.targetLength];
  const keyPointSections: ScriptSection[] = input.keyPoints.map((point, i) => ({
    label: `Key Point ${i + 1}`,
    content: `[Write 2-3 sentences exploring: ${point}. Lead with the human experience, then the business insight. Include one specific number or example.]`,
    timingMark: `${Math.round((i + 1) * (config.seconds / (input.keyPoints.length + 2)))}s`,
  }));

  return {
    title: `[DRAFT] ${input.topic}`,
    hook: `[Opening line needed: Name the specific wound your audience feels about "${input.topic}". Must stop the scroll in 5 seconds. Declarative, not a question.]`,
    sections: [
      {
        label: "The Wound",
        content: `[Describe the pain the viewer is already feeling about ${input.topic}. Be specific. Not generic. Use a real name and number if possible.]`,
        timingMark: "0-15s",
      },
      ...keyPointSections,
      {
        label: "The Path Forward",
        content: `[Connect the key points to a clear resolution. What does the viewer do now? Not a sales pitch. A natural next step.]`,
        timingMark: `${config.seconds - 15}s`,
      },
    ],
    cta: `Run a free Checkup at getalloro.com to see where you stand on ${input.topic.toLowerCase()}.`,
    estimatedDuration: `${Math.round(config.seconds / 60)} minutes`,
    energyDirection: input.tone,
    wardrobeNote: "Navy dominant, Terracotta accent. No logos. No busy patterns.",
    eyeDirection: input.targetLength === "short" ? "Direct to camera" : "Direct for key points, slightly off-camera for stories",
    thumbnailConcept: `[Capture moment when discussing the core wound of ${input.topic}]`,
    mode: "template",
  };
}

// -- Core -------------------------------------------------------------------

/**
 * Generate a word-for-word video script.
 */
export async function generateScript(input: ScriptInput): Promise<ScriptResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[ScriptWriter] No ANTHROPIC_API_KEY set. Using template fallback.");
    const result = generateTemplateScript(input);
    await writeScriptEvent(input, result);
    return result;
  }

  const config = LENGTH_CONFIG[input.targetLength];

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: config.maxTokens,
      messages: [
        {
          role: "user",
          content: `You are the Script Writer for Corey Wise, founder of Alloro. Write a word-for-word, speakable script. Return ONLY valid JSON.

Topic: ${input.topic}
Format: ${config.label} (${Math.round(config.seconds / 60)} minutes)
Tone: ${input.tone}
Key Points to Cover: ${input.keyPoints.join("; ")}

Voice Rules (non-negotiable):
1. Complete sentences. Conversational rhythm. Never choppy.
2. Declarative openings. "Here is what nobody tells you about..." Never "Have you ever wondered..."
3. Human truth before business insight. Lead with the feeling, then the fact.
4. Specific names and numbers. Not "a doctor." Use "Dr. Kargoli." Not "improved reviews." Use "Added 14 reviews in 3 weeks."
5. Contrast language. "Not the dentistry, the business around it."
6. No em-dashes. Ever. Use commas, periods, or line breaks.
7. No pandering. No "you're amazing" or motivational tone.
8. No corporate jargon. "Visibility" not "brand awareness." "Patients finding you" not "lead generation."
9. No SaaS language. Never "onboarding," "churn," "MRR" in scripts.

Structure: wound (pain) -> framework (insight) -> resolution (path forward)
The opening line must name a specific wound. First 5 seconds must stop the scroll.
Include at least one specific dollar figure or time figure.

Return JSON:
{
  "title": "string",
  "hook": "The exact opening line, word for word",
  "sections": [
    { "label": "string", "content": "Full word-for-word script for this section", "timingMark": "string" }
  ],
  "cta": "string",
  "estimatedDuration": "string",
  "energyDirection": "string",
  "wardrobeNote": "string",
  "eyeDirection": "string",
  "thumbnailConcept": "string"
}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const parsed = JSON.parse(text);

    const result: ScriptResult = {
      title: parsed.title || input.topic,
      hook: parsed.hook || "",
      sections: parsed.sections || [],
      cta: parsed.cta || "",
      estimatedDuration: parsed.estimatedDuration || `${Math.round(config.seconds / 60)} minutes`,
      energyDirection: parsed.energyDirection || input.tone,
      wardrobeNote: parsed.wardrobeNote || "Navy dominant, Terracotta accent.",
      eyeDirection: parsed.eyeDirection || "Direct to camera",
      thumbnailConcept: parsed.thumbnailConcept || "",
      mode: "ai",
    };

    await writeScriptEvent(input, result);

    console.log(
      `[ScriptWriter] Generated script: "${result.title}" (${result.estimatedDuration}, AI mode)`
    );
    return result;
  } catch (err: any) {
    console.error("[ScriptWriter] Claude API failed, falling back to template:", err.message);
    const result = generateTemplateScript(input);
    await writeScriptEvent(input, result);
    return result;
  }
}

// -- Writers ----------------------------------------------------------------

async function writeScriptEvent(
  input: ScriptInput,
  result: ScriptResult
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.script_produced",
      properties: JSON.stringify({
        topic: input.topic,
        target_length: input.targetLength,
        tone: input.tone,
        title: result.title,
        estimated_duration: result.estimatedDuration,
        section_count: result.sections.length,
        mode: result.mode,
        energy_direction: result.energyDirection,
      }),
    });
  } catch (err: any) {
    console.error("[ScriptWriter] Failed to write script event:", err.message);
  }
}
