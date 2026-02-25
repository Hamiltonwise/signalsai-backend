import { Request, Response } from "express";
import * as chatService from "./feature-services/service.minds-chat";

export async function chat(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const { message, conversationId } = req.body;

    if (!message) return res.status(400).json({ error: "message is required" });

    const result = await chatService.chat(mindId, message, conversationId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("[MINDS] Error in chat:", error);
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Chat failed" });
  }
}

export async function getConversation(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, conversationId } = req.params;
    const messages = await chatService.getConversationMessages(mindId, conversationId);
    return res.json({ success: true, data: messages });
  } catch (error: any) {
    console.error("[MINDS] Error getting conversation:", error);
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to get conversation" });
  }
}

export async function listConversations(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const conversations = await chatService.listConversations(mindId);
    return res.json({ success: true, data: conversations });
  } catch (error: any) {
    console.error("[MINDS] Error listing conversations:", error);
    return res.status(500).json({ error: "Failed to list conversations" });
  }
}

export async function deleteConversation(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, conversationId } = req.params;
    await chatService.deleteConversation(mindId, conversationId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[MINDS] Error deleting conversation:", error);
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to delete conversation" });
  }
}
