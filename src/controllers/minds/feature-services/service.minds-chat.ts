import Anthropic from "@anthropic-ai/sdk";
import { MindModel } from "../../../models/MindModel";
import { MindVersionModel } from "../../../models/MindVersionModel";
import { MindConversationModel, IMindConversation } from "../../../models/MindConversationModel";
import { MindMessageModel, IMindMessage } from "../../../models/MindMessageModel";
import { shouldCompact, compactConversation } from "./service.minds-compaction";

const MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";
const MAX_HISTORY_MESSAGES = 30;

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function buildSystemPrompt(
  mindName: string,
  personalityPrompt: string,
  brainMarkdown: string
): string {
  return `You are ${mindName}.

PERSONALITY:
${personalityPrompt}

KNOWLEDGE BASE (MARKDOWN):
${brainMarkdown}

RULES:
- Prefer the knowledge base. Quote/anchor to it where helpful.
- If the knowledge base does not contain the answer, say you are not sure and suggest what info is needed.
- Do not invent facts.`;
}

function generateTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const truncated = cleaned.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 20 ? truncated.slice(0, lastSpace) + "..." : truncated + "...";
}

function buildApiMessages(
  history: IMindMessage[]
): Array<{ role: "user" | "assistant"; content: string }> {
  const apiMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const m of history) {
    if (m.role === "system") {
      // Parse compaction messages and inject as a user context message
      try {
        const parsed = JSON.parse(m.content);
        if (parsed.type === "compaction") {
          apiMessages.push({
            role: "user",
            content: `[Context from our earlier conversation]: ${parsed.summary}`,
          });
          apiMessages.push({
            role: "assistant",
            content: "Understood, I have the context from our earlier conversation. How can I help?",
          });
          continue;
        }
      } catch {
        // Not JSON — skip system messages
      }
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      apiMessages.push({ role: m.role, content: m.content });
    }
  }

  return apiMessages;
}

export async function chat(
  mindId: string,
  message: string,
  conversationId?: string,
  adminId?: string
): Promise<{
  conversationId: string;
  reply: string;
}> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  // Load brain
  let brainMarkdown = "";
  if (mind.published_version_id) {
    const version = await MindVersionModel.findById(mind.published_version_id);
    if (version) brainMarkdown = version.brain_markdown;
  }

  // Get or create conversation
  let convId = conversationId;
  let isNewConversation = false;
  if (!convId) {
    const conv = await MindConversationModel.createConversation(mindId, adminId);
    convId = conv.id;
    isNewConversation = true;
  } else {
    const conv = await MindConversationModel.findById(convId);
    if (!conv || conv.mind_id !== mindId) throw new Error("Conversation not found");
  }

  // Store user message + increment count
  await MindMessageModel.addMessage(convId, "user", message);
  await MindConversationModel.incrementMessageCount(convId);

  // Auto-generate title on first message
  if (isNewConversation) {
    await MindConversationModel.updateTitle(convId, generateTitle(message));
  }

  // Check if compaction is needed before building context
  try {
    if (await shouldCompact(convId)) {
      await compactConversation(convId, mind.name);
    }
  } catch (err) {
    console.error("[MINDS] Compaction failed, skipping:", err);
    // Continue without compaction — conversation still works
  }

  // Load recent history
  const history = await MindMessageModel.getRecentMessages(convId, MAX_HISTORY_MESSAGES);
  const apiMessages = buildApiMessages(history);

  const systemPrompt = buildSystemPrompt(
    mind.name,
    mind.personality_prompt,
    brainMarkdown
  );

  console.log(
    `[MINDS] Chat request for mind ${mind.name}, conversation ${convId}, ${apiMessages.length} messages in history`
  );

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: apiMessages,
  });

  const reply =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  // Store assistant response + increment count
  await MindMessageModel.addMessage(convId, "assistant", reply);
  await MindConversationModel.incrementMessageCount(convId);

  return { conversationId: convId, reply };
}

export async function getConversationMessages(
  mindId: string,
  conversationId: string
): Promise<IMindMessage[]> {
  const conv = await MindConversationModel.findById(conversationId);
  if (!conv || conv.mind_id !== mindId) throw new Error("Conversation not found");

  return MindMessageModel.listByConversation(conversationId);
}

export async function listConversations(
  mindId: string
): Promise<IMindConversation[]> {
  return MindConversationModel.listByMind(mindId);
}

export async function deleteConversation(
  mindId: string,
  conversationId: string
): Promise<boolean> {
  const conv = await MindConversationModel.findById(conversationId);
  if (!conv || conv.mind_id !== mindId) throw new Error("Conversation not found");

  // Messages cascade-delete via FK
  const deleted = await MindConversationModel.deleteById(conversationId);
  return deleted > 0;
}
