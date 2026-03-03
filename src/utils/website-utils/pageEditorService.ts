/**
 * Page Editor Service
 * Handles LLM-powered HTML component editing via the Google Gemini SDK.
 */

import { GoogleGenAI } from "@google/genai";
import { getPageEditorPrompt } from "./pageEditorPrompt";

const MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    client = new GoogleGenAI({ apiKey });
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
 * Send a component's HTML + edit instruction to Gemini and get back modified HTML.
 */
export async function editHtmlComponent(params: EditRequest): Promise<EditResponse> {
  const { alloroClass, currentHtml, instruction, chatHistory = [], mediaContext = "", promptType = "admin" } = params;
  const ai = getClient();

  // Build the Gemini contents array from chat history + current instruction
  // Gemini uses "user" and "model" roles (not "assistant")
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  for (const msg of chatHistory) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  // Add the current instruction with the component HTML context
  const userMessage = `Element class: ${alloroClass}

Current HTML:
${currentHtml}

Instruction: ${instruction}${mediaContext}`;

  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const systemPrompt = await getPageEditorPrompt(promptType);

  console.log(`[PageEditor] Sending edit request to Gemini for class: ${alloroClass}`);
  console.log(`[PageEditor] Instruction: ${instruction}`);
  console.log(`[PageEditor] HTML size: ${currentHtml.length} chars, history: ${chatHistory.length} messages`);

  // Build flat messages array for debug info (original format)
  const debugMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of chatHistory) {
    debugMessages.push({ role: msg.role, content: msg.content });
  }
  debugMessages.push({ role: "user", content: userMessage });

  const response = await ai.models.generateContent({
    model: MODEL,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
    },
    contents,
  });

  // Extract the text response
  const text = response.text;
  if (!text) {
    throw new Error("No text response from Gemini");
  }

  const debugInfo: EditDebugInfo = {
    model: MODEL,
    systemPrompt,
    messages: debugMessages,
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
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
