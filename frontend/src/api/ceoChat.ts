/**
 * CEO Intelligence Chat API -- The Conversation
 *
 * Full-context Claude chat for the CEO dashboard.
 * Has access to: org overview, agent status, revenue data,
 * competitive intelligence, and Notion knowledge base.
 */

import { apiPost } from "./index";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendCEOChatMessage(params: {
  message: string;
  history: ChatMessage[];
}): Promise<{ success: boolean; response?: string; error?: string }> {
  return apiPost({
    path: "/admin/ceo-chat",
    passedData: params,
  });
}
