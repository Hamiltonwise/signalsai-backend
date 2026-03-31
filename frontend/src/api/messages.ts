import { apiGet, apiPost, apiPatch } from "./index";

export interface Message {
  id: number;
  sender_id: number;
  recipient_id: number | null;
  org_context_id: number | null;
  content: string;
  message_type: "text" | "note" | "decision" | "action_item";
  read_at: string | null;
  created_at: string;
}

export interface MessagesResponse {
  success: boolean;
  messages: Message[];
  unreadCount: number;
  currentUserId: number;
}

/**
 * Fetch messages for the current user.
 * Supports filtering by org_context_id, limit, and offset.
 */
export const fetchMessages = async (params?: {
  org_context_id?: number;
  limit?: number;
  offset?: number;
}): Promise<MessagesResponse> => {
  const searchParams = new URLSearchParams();
  if (params?.org_context_id) {
    searchParams.append("org_context_id", String(params.org_context_id));
  }
  if (params?.limit) {
    searchParams.append("limit", String(params.limit));
  }
  if (params?.offset) {
    searchParams.append("offset", String(params.offset));
  }
  const qs = searchParams.toString();
  return apiGet({ path: `/messages${qs ? `?${qs}` : ""}` });
};

/**
 * Send a new message.
 */
export const sendMessage = async (data: {
  recipient_id?: number | null;
  org_context_id?: number | null;
  content: string;
  message_type?: "text" | "note" | "decision" | "action_item";
}): Promise<{ success: boolean; message: Message }> => {
  return apiPost({ path: "/messages", passedData: data });
};

/**
 * Mark a message as read.
 */
export const markAsRead = async (
  messageId: number
): Promise<{ success: boolean; updated: boolean }> => {
  return apiPatch({ path: `/messages/${messageId}/read` });
};
