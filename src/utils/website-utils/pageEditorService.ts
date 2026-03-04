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
    // Strip any markdown fences (```json, ```html, ```, etc.)
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
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
