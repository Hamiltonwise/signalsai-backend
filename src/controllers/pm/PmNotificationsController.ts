import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { db } from "../../database/connection";

function handleError(res: Response, error: unknown, operation: string): Response {
  console.error(`[PM-NOTIFICATIONS] ${operation} failed:`, error);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

// GET /api/pm/notifications
export async function getNotifications(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.user!.userId;

    const notifications = await db("pm_notifications")
      .where("user_id", userId)
      .orderBy("created_at", "desc")
      .limit(50)
      .select("*");

    return res.json({ success: true, data: notifications });
  } catch (error) {
    return handleError(res, error, "getNotifications");
  }
}

// PUT /api/pm/notifications/read-all
export async function markAllRead(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.user!.userId;

    await db("pm_notifications")
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true });

    return res.json({ success: true, data: { updated: true } });
  } catch (error) {
    return handleError(res, error, "markAllRead");
  }
}

// DELETE /api/pm/notifications
export async function deleteAll(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.user!.userId;

    await db("pm_notifications").where("user_id", userId).delete();

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteAll");
  }
}
