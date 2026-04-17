/**
 * LLM Runner Service
 *
 * Generic Anthropic Claude caller. Takes a system prompt + user message,
 * calls the API, and returns the raw + parsed response.
 *
 * Does NOT persist anything — the calling code decides what to do
 * with the result (save to agent_results, return to client, etc.).
 */

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = process.env.AGENTS_LLM_MODEL || "claude-sonnet-4-6";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// =====================================================================
// TYPES
// =====================================================================

export interface LlmRunnerOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Optional assistant prefill to steer output format (e.g. "{" for JSON) */
  prefill?: string;
  /** Optional images to send alongside userMessage (multimodal input) */
  images?: Array<{
    mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    base64: string;
  }>;
}

export interface LlmRunnerResult {
  /** Raw text response from the model */
  raw: string;
  /** JSON-parsed response if parseable, null otherwise */
  parsed: any | null;
  /** Model used */
  model: string;
  /** Token usage */
  inputTokens: number;
  outputTokens: number;
}

// =====================================================================
// CORE: RUN AGENT
// =====================================================================

/**
 * Call Claude with a system prompt and user message.
 * Returns the raw text and attempts JSON parsing.
 */
export async function runAgent(
  options: LlmRunnerOptions
): Promise<LlmRunnerResult> {
  const {
    systemPrompt,
    userMessage,
    model = DEFAULT_MODEL,
    maxTokens = 16384,
    temperature = 0,
    prefill,
    images,
  } = options;

  const messages: Anthropic.MessageParam[] = [];

  if (images && images.length > 0) {
    const userContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
      ...images.map((img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: img.mediaType,
          data: stripDataUrlPrefix(img.base64),
        },
      })),
      { type: "text" as const, text: userMessage },
    ];
    messages.push({ role: "user", content: userContent });
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  if (prefill) {
    messages.push({ role: "assistant", content: prefill });
  }

  const imgSizeKB = images
    ? Math.round(
        images.reduce(
          (sum, i) => sum + stripDataUrlPrefix(i.base64).length * 0.75,
          0
        ) / 1024
      )
    : 0;
  const imgCount = images?.length ?? 0;
  console.log(
    `[LLM] → ${model} system=${systemPrompt.length}ch user=${userMessage.length}ch ` +
      `images=${imgCount}${imgCount ? ` (${imgSizeKB}kB)` : ""} maxTokens=${maxTokens}`
  );

  const callStart = Date.now();
  let response;
  try {
    response = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages,
    });
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status ?? "?";
    const body = err?.error ?? err?.response?.data ?? err?.body;
    console.error(
      `[LLM] ✗ API error (${Date.now() - callStart}ms) status=${status} message="${err?.message}"`
    );
    if (body) {
      console.error(
        `[LLM]   body: ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 500)}`
      );
    }
    throw err;
  }

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );

  let raw = textBlock?.text || "";

  // If we used a prefill, prepend it to reconstruct the full response
  if (prefill) {
    raw = prefill + raw;
  }

  // Attempt JSON parse with multiple extraction strategies
  const parsed = extractJson(raw);

  console.log(
    `[LLM] ✓ ${response.model} (${Date.now() - callStart}ms) ` +
      `tokens=${response.usage.input_tokens}/${response.usage.output_tokens} ` +
      `parsed=${parsed ? "ok" : "null"} raw=${raw.length}ch`
  );

  return {
    raw,
    parsed,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function stripDataUrlPrefix(data: string): string {
  const match = data.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.*)$/);
  return match ? match[1] : data;
}

// =====================================================================
// TOOL CALLING
// =====================================================================

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface RunWithToolsOptions {
  systemPrompt: string;
  userMessage: string;
  tools: ToolSchema[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Optional tool choice — "auto" (default), "any" (must call a tool),
   * or a specific tool name.
   */
  toolChoice?: "auto" | "any" | { type: "tool"; name: string };
}

export interface RunWithToolsResult {
  toolCalls: ToolCall[];
  textResponse: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

/**
 * Call Claude with a set of tools available. Returns structured tool calls
 * (Claude may call multiple in a single turn) and/or a text response.
 * Used for structured output scenarios (identity chat updates, critique,
 * image selection) where the LLM must pick a structured action.
 */
export async function runWithTools(
  options: RunWithToolsOptions,
): Promise<RunWithToolsResult> {
  const {
    systemPrompt,
    userMessage,
    tools,
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    temperature = 0,
    toolChoice,
  } = options;

  console.log(
    `[LLM-TOOLS] → ${model} system=${systemPrompt.length}ch user=${userMessage.length}ch ` +
      `tools=${tools.length} maxTokens=${maxTokens}`,
  );

  // Use the beta tools API (this SDK version exposes tools under client.beta.tools.messages)
  const requestBody: any = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools,
  };

  if (toolChoice === "auto") {
    requestBody.tool_choice = { type: "auto" };
  } else if (toolChoice === "any") {
    requestBody.tool_choice = { type: "any" };
  } else if (toolChoice && typeof toolChoice === "object") {
    requestBody.tool_choice = toolChoice;
  }

  const callStart = Date.now();
  let response: any;
  try {
    response = await (getClient() as any).beta.tools.messages.create(requestBody);
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status ?? "?";
    console.error(
      `[LLM-TOOLS] ✗ API error (${Date.now() - callStart}ms) status=${status} message="${err?.message}"`,
    );
    throw err;
  }

  const toolCalls: ToolCall[] = [];
  const textParts: string[] = [];

  for (const block of response.content as Array<any>) {
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    } else if (block.type === "text") {
      textParts.push(block.text);
    }
  }

  const textResponse = textParts.length > 0 ? textParts.join("\n") : null;

  console.log(
    `[LLM-TOOLS] ✓ ${response.model} (${Date.now() - callStart}ms) ` +
      `tokens=${response.usage.input_tokens}/${response.usage.output_tokens} ` +
      `toolCalls=${toolCalls.length} stop=${response.stop_reason}`,
  );

  return {
    toolCalls,
    textResponse,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason ?? null,
  };
}

// =====================================================================
// JSON EXTRACTION
// =====================================================================

/**
 * Try multiple strategies to extract valid JSON from LLM output.
 *
 * 1. Direct parse
 * 2. Strip markdown fences (```json ... ```)
 * 3. Extract first { ... } or [ ... ] block via brace/bracket matching
 */
function extractJson(text: string): any | null {
  const trimmed = text.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* continue */ }

  // 2. Strip markdown fences — handle ```json, ``` with any whitespace/newlines
  const fenceStripped = trimmed
    .replace(/^```[\w]*\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/i, "")
    .trim();
  if (fenceStripped !== trimmed) {
    try {
      return JSON.parse(fenceStripped);
    } catch { /* continue */ }
  }

  // 3. Brace/bracket matched extraction — find the outermost JSON structure
  const startChar = trimmed.indexOf("{") <= trimmed.indexOf("[") || trimmed.indexOf("[") === -1
    ? "{"
    : "[";
  const endChar = startChar === "{" ? "}" : "]";
  const startIdx = trimmed.indexOf(startChar);

  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === startChar) depth++;
    else if (ch === endChar) {
      depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(startIdx, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
