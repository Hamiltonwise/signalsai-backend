import Anthropic from "@anthropic-ai/sdk";
import { MindModel } from "../../../models/MindModel";
import { MindVersionModel } from "../../../models/MindVersionModel";
import { MindSkillModel, IMindSkill } from "../../../models/MindSkillModel";
import {
  MindSkillNeuronModel,
  IMindSkillNeuron,
} from "../../../models/MindSkillNeuronModel";
import { MindSkillCallModel } from "../../../models/MindSkillCallModel";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createSkill(
  mindId: string,
  name: string,
  definition: string,
  outputSchema: object | null,
): Promise<IMindSkill> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  let slug = slugify(name);

  // Check for collision, append suffix if needed
  const existing = await MindSkillModel.findBySlug(mindId, slug);
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  return MindSkillModel.create({
    mind_id: mindId,
    name,
    slug,
    definition,
    output_schema: outputSchema,
    status: "draft",
  });
}

export async function updateSkill(
  skillId: string,
  fields: Partial<Pick<IMindSkill, "name" | "definition" | "output_schema">>,
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (fields.name !== undefined) updateData.name = fields.name;
  if (fields.definition !== undefined) updateData.definition = fields.definition;
  if (fields.output_schema !== undefined)
    updateData.output_schema =
      fields.output_schema === null
        ? null
        : JSON.stringify(fields.output_schema);

  if (Object.keys(updateData).length > 0) {
    await MindSkillModel.updateById(skillId, updateData);
  }
}

export async function generateNeuron(
  skillId: string,
): Promise<IMindSkillNeuron> {
  const skill = await MindSkillModel.findById(skillId);
  if (!skill) throw new Error("Skill not found");

  if (!skill.definition || !skill.definition.trim()) {
    throw new Error("Skill definition is required before generating a neuron");
  }

  const mind = await MindModel.findById(skill.mind_id);
  if (!mind) throw new Error("Mind not found");

  if (!mind.published_version_id) {
    throw new Error("Mind has no published brain. Publish a version first.");
  }

  const version = await MindVersionModel.findById(mind.published_version_id);
  if (!version) throw new Error("Published version not found");

  await MindSkillModel.updateStatus(skillId, "generating");

  try {
    const client = getClient();

    let systemPrompt = `You are a prompt engineer. Your job is to read a knowledge base and produce a comprehensive, well-structured system prompt for an AI assistant that specializes in a specific task.

TASK DEFINITION:
${skill.definition}

OUTPUT FORMAT RULES:
- Write the output as a plain-text system prompt (no markdown headers like # or ##)
- The prompt MUST start with "You are an assistant agent who specializes in..." and describe the agent's role and expertise
- Structure the prompt with clear sections using ALL CAPS labels followed by a colon (e.g., CORE RESPONSIBILITIES:, STANDARDS TO FOLLOW:, STEP-BY-STEP PROCESS:)
- Use numbered lists (1. 2. 3.) for sequential steps and processes
- Use bullet points (- ) for non-sequential rules, standards, and guidelines
- Add line breaks between sections for readability
- Categorize related information together under clear section labels
- Include specific steps the agent should follow when performing its task
- Be elaborate and thorough — extract every relevant detail from the knowledge base

CONTENT RULES:
- Read the entire knowledge base carefully
- Extract ALL facts, standards, rules, guidelines, and specifications relevant to this task
- Organize extracted knowledge into logical categories
- Include concrete examples, thresholds, and specific values where they exist in the knowledge base
- Do not invent information not present in the knowledge base
- Do not summarize or abbreviate — include the full detail for each relevant point`;

    if (skill.output_schema) {
      systemPrompt += `\n\nOUTPUT SCHEMA INSTRUCTIONS:
The prompt must instruct the agent to always respond with valid JSON conforming to this schema:
${JSON.stringify(skill.output_schema, null, 2)}

Include a section in the prompt called "RESPONSE FORMAT:" that tells the agent to respond ONLY with a JSON object matching this schema and nothing else.`;
    }

    console.log(
      `[MINDS] Generating neuron for skill "${skill.name}" (mind: ${mind.name})`,
    );

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the complete brain to transmute:\n\n${version.brain_markdown}`,
        },
      ],
    });

    const neuronMarkdown =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const neuron = await MindSkillNeuronModel.upsert(
      skillId,
      version.id,
      neuronMarkdown,
    );

    await MindSkillModel.updateStatus(skillId, "ready");

    console.log(
      `[MINDS] Neuron generated for skill "${skill.name}" (${neuronMarkdown.length} chars)`,
    );

    return neuron;
  } catch (err) {
    console.error(`[MINDS] Neuron generation failed for skill ${skillId}:`, err);
    await MindSkillModel.updateStatus(skillId, "failed");
    throw err;
  }
}

export async function executeSkill(
  agentSlug: string,
  skillSlug: string,
  inputPayload: object,
  callerIp: string | null,
): Promise<{ response: object | string; durationMs: number }> {
  const mind = await MindModel.findBySlug(agentSlug);
  if (!mind) throw new Error("Agent not found");

  const skill = await MindSkillModel.findBySlug(mind.id, skillSlug);
  if (!skill) throw new Error("Skill not found");
  if (skill.status !== "ready") throw new Error("Skill is not ready");

  const neuron = await MindSkillNeuronModel.findBySkill(skill.id);
  if (!neuron) throw new Error("Skill neuron not generated");

  const startTime = Date.now();

  try {
    const client = getClient();

    let systemPrompt = `You are ${mind.name}, operating in skill mode: "${skill.name}".

SPECIALIZED KNOWLEDGE:
${neuron.neuron_markdown}`;

    if (skill.output_schema) {
      systemPrompt += `\n\nYou MUST respond with valid JSON conforming to this schema:
${JSON.stringify(skill.output_schema, null, 2)}

Respond ONLY with the JSON object, no additional text.`;
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: JSON.stringify(inputPayload),
        },
      ],
    });

    const rawResponse =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const durationMs = Date.now() - startTime;

    // Try to parse as JSON if output schema exists
    let parsedResponse: object | string = rawResponse;
    if (skill.output_schema) {
      try {
        parsedResponse = JSON.parse(rawResponse);
      } catch {
        parsedResponse = rawResponse;
      }
    }

    // Log the call
    await MindSkillCallModel.log(
      skill.id,
      callerIp,
      inputPayload,
      typeof parsedResponse === "string"
        ? { raw: parsedResponse }
        : parsedResponse,
      "success",
      durationMs,
    );

    return { response: parsedResponse, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await MindSkillCallModel.log(
      skill.id,
      callerIp,
      inputPayload,
      null,
      "error",
      durationMs,
    );
    throw err;
  }
}

export async function getSkillAnalytics(skillId: string): Promise<{
  totalCalls: number;
  callsToday: number;
  dailyCounts: { date: string; count: number }[];
}> {
  const [totalCalls, callsToday, dailyCounts] = await Promise.all([
    MindSkillCallModel.countBySkill(skillId),
    MindSkillCallModel.countBySkillToday(skillId),
    MindSkillCallModel.dailyCountsLast7Days(skillId),
  ]);
  return { totalCalls, callsToday, dailyCounts };
}

export async function suggestSkill(
  mindId: string,
  hint: string,
): Promise<{ definition: string; outputSchema: object | null }> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a skill architect for an AI agent named "${mind.name}".
The user will give you a brief hint about what they want a skill to do.

Your job is to return a JSON object with two fields:
1. "definition" — a concise skill definition of MAXIMUM 4 sentences describing what the skill does, what input it expects, what it should focus on, and what quality standards to enforce. Keep it tight and specific.

2. "outputSchema" — a JSON Schema object that defines the expected output format for this skill. If the skill produces free-form text, set this to null. If the skill should produce structured data, define a proper JSON Schema with type, properties, required fields, and descriptions.

IMPORTANT: Respond with ONLY the JSON object. No markdown, no backticks, no explanation. The definition must be 4 sentences or fewer.

Example output:
{
  "definition": "You will validate website pages against the standards in your knowledge base. You will receive HTML content and flag issues with severity levels: critical, warning, or info. Always cite the specific standard being violated. Reject pages with any critical issues.",
  "outputSchema": {
    "type": "object",
    "properties": {
      "passed": { "type": "boolean", "description": "Whether the page passes all checks" },
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": { "type": "string", "enum": ["critical", "warning", "info"] },
            "message": { "type": "string" },
            "standard": { "type": "string" }
          },
          "required": ["severity", "message"]
        }
      }
    },
    "required": ["passed", "issues"]
  }
}`,
    messages: [
      {
        role: "user",
        content: hint,
      },
    ],
  });

  const raw =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  try {
    const parsed = JSON.parse(raw);
    return {
      definition: parsed.definition || "",
      outputSchema: parsed.outputSchema || null,
    };
  } catch {
    // If Claude didn't return valid JSON, use the raw text as definition
    return { definition: raw, outputSchema: null };
  }
}
