/**
 * CS Agent API — account-aware Claude chat
 */

import { apiPost } from "./index";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendChatMessage(params: {
  message: string;
  history: ChatMessage[];
  locationId?: number | null;
}): Promise<{ success: boolean; response?: string; error?: string }> {
  return apiPost({
    path: "/api/cs-agent/chat",
    passedData: params,
  });
}
