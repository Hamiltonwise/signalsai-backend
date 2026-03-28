/**
 * Page Editor Service
 * Handles LLM-powered HTML component editing via the Anthropic Claude SDK.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getPageEditorPrompt } from "./pageEditorPrompt";

const MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

interface EditRequest {
  alloroClass: string;
  currentHtml: string;
  instruction: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  mediaContext?: string;
  promptType?: "admin" | "user";
}

interface EditDebugInfo {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  inputTokens: number;
  outputTokens: number;
}

interface EditResponse {
  editedHtml: string | null;
  message: string;
  rejected: boolean;
  debug: EditDebugInfo;
}

/**
 * Send a component's HTML + edit instruction to Claude and get back modified HTML.
 */
export async function editHtmlComponent(params: EditRequest): Promise<EditResponse> {
  const { alloroClass, currentHtml, instruction, chatHistory = [], mediaContext = "", promptType = "admin" } = params;
  const ai = getClient();

  // Build the Anthropic messages array from chat history + current instruction
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the current instruction with the component HTML context
  const userMessage = `Element class: ${alloroClass}

Current HTML:
${currentHtml}

Instruction: ${instruction}${mediaContext}`;

  messages.push({ role: "user", content: userMessage });

  const systemPrompt = await getPageEditorPrompt(promptType);

  console.log(`[PageEditor] Sending edit request to Claude for class: ${alloroClass}`);
  console.log(`[PageEditor] Instruction: ${instruction}`);
  console.log(`[PageEditor] HTML size: ${currentHtml.length} chars, history: ${chatHistory.length} messages`);

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  // Extract the text response
  const textBlock = response.content[0];
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }
  const text = textBlock.text;

  const debugInfo: EditDebugInfo = {
    model: MODEL,
    systemPrompt,
    messages,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  // Parse the JSON response from the LLM
  let parsed: { error: boolean; message: string; html?: string };
  try {
    let cleaned = text.trim();

    // Extract content from markdown fenced code blocks anywhere in the response.
    // Handles cases where the LLM wraps its output in ```json, ```html, or ```
    // with optional text/headers before and after the fence.
    const fenceMatch = cleaned.match(/```\w*\n([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // Try JSON parse first (happy path)
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // If JSON parse fails, check if it looks like raw HTML
      if (cleaned.startsWith("<")) {
        console.warn("[PageEditor] LLM returned raw HTML instead of JSON — wrapping automatically");
        parsed = {
          error: false,
          message: "Applied edit",
          html: cleaned,
        };
      } else {
        throw new Error("Response is neither valid JSON nor HTML");
      }
    }
  } catch (parseErr) {
    console.error("[PageEditor] LLM returned invalid response:", text.substring(0, 200));
    throw new Error("LLM returned invalid response — expected JSON or HTML");
  }

  // Log token usage
  console.log(
    `[PageEditor] ✓ Edit complete. Input tokens: ${debugInfo.inputTokens}, Output tokens: ${debugInfo.outputTokens}`
  );

  // Handle rejection — LLM flagged the instruction as not allowed
  if (parsed.error) {
    console.log(`[PageEditor] ✗ Edit rejected: ${parsed.message}`);
    return {
      editedHtml: null,
      message: parsed.message || "This edit is not allowed.",
      rejected: true,
      debug: debugInfo,
    };
  }

  // Validate the returned HTML
  const editedHtml = (parsed.html || "").trim();
  if (!editedHtml) {
    throw new Error("LLM returned empty HTML");
  }

  if (!editedHtml.includes(alloroClass)) {
    console.error(`[PageEditor] Alloro class "${alloroClass}" missing from LLM response`);
    throw new Error(
      `The edit removed the component identifier class "${alloroClass}". This is not allowed.`
    );
  }

  return {
    editedHtml,
    message: parsed.message || `Applied edit to ${alloroClass}`,
    rejected: false,
    debug: debugInfo,
  };
}

// =====================================================================
// Natural Language Batch Edit (WO-45)
// =====================================================================

interface NaturalEditInput {
  instructions: string;
  sections: Array<{ name: string; content: string }>;
}

interface MappedChange {
  section: string;
  oldContent: string;
  newContent: string;
  changeType: "replace" | "add" | "remove";
  confidence: "high" | "low";
  description: string;
}

export async function mapInstructionsToChanges(
  input: NaturalEditInput
): Promise<MappedChange[]> {
  const ai = getClient();

  const sectionSummary = input.sections
    .map((s) => `[Section: ${s.name}]\n${s.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = `You are a website editor for a medical practice. Given plain-English edit instructions from the practice owner and the current site content, map each instruction to specific changes.

Return a JSON array of changes. Each change must have:
- "section": the section name where the change applies
- "oldContent": the exact text/HTML being replaced (must match content verbatim)
- "newContent": the replacement text/HTML
- "changeType": "replace", "add", or "remove"
- "confidence": "high" if the mapping is clear, "low" if ambiguous
- "description": one sentence describing the change in plain English

Rules:
- Be specific. Quote exact text being changed.
- For "everywhere" instructions, return one change per section where the text appears.
- Never change anything not mentioned in the instructions.
- For "add" changes, oldContent should be the element after which to insert (or empty string to append).
- For "remove" changes, newContent should be an empty string.
- Return ONLY the JSON array, no explanation.`;

  const userMessage = `Current site sections:\n\n${sectionSummary}\n\nEdit instructions from the practice owner:\n${input.instructions}`;

  console.log(`[NaturalEdit] Processing: "${input.instructions.substring(0, 100)}..."`);

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content[0];
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  console.log(
    `[NaturalEdit] Tokens: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`
  );

  let text = textBlock.text.trim();
  const fenceMatch = text.match(/```\w*\n([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  let changes: MappedChange[];
  try {
    changes = JSON.parse(text);
  } catch {
    console.error("[NaturalEdit] Failed to parse response:", text.substring(0, 300));
    return [];
  }

  if (!Array.isArray(changes)) return [];

  const sectionNames = new Set(input.sections.map((s) => s.name));
  return changes.filter((c) => sectionNames.has(c.section));
}
