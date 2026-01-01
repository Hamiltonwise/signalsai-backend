import express, { Request, Response } from "express";
import { db } from "../database/connection";
import type { Notification, NotificationsResponse } from "../types/global";

const router = express.Router();

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Get domain name from google account ID
 */
async function getDomainFromAccountId(
  googleAccountId: number
): Promise<string | null> {
  try {
    const account = await db("google_accounts")
      .where({ id: googleAccountId })
      .first();
    return account?.domain_name || null;
  } catch (error) {
    console.error("Error fetching domain from account ID:", error);
    return null;
  }
}

/**
 * Error handler for routes
 */
function handleError(res: Response, error: any, operation: string): Response {
  console.error(`[NOTIFICATIONS] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
}

// =====================================================================
// CLIENT ENDPOINTS (Domain-Filtered)
// =====================================================================

/**
 * GET /api/notifications
 * Fetch latest 10 notifications for logged-in client
 * Query params: googleAccountId (required)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const googleAccountId =
      req.query.googleAccountId || req.headers["x-google-account-id"];

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        message: "googleAccountId is required",
      });
    }

    // Get domain from account ID
    const domain = await getDomainFromAccountId(Number(googleAccountId));
    if (!domain) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
        message: "Google account not found or has no domain",
      });
    }

    // Fetch latest 10 notifications
    const notifications = await db("notifications")
      .where({ domain_name: domain })
      .orderBy("created_at", "desc")
      .limit(10)
      .select("*");

    // Count unread notifications
    const unreadResult = await db("notifications")
      .where({ domain_name: domain, read: false })
      .count("* as count");
    const unreadCount = Number(unreadResult[0]?.count || 0);

    // Parse metadata if it's a string
    const parsedNotifications = notifications.map((n: any) => ({
      ...n,
      read: n.read === 1 || n.read === true,
      metadata: n.metadata
        ? typeof n.metadata === "string"
          ? JSON.parse(n.metadata)
          : n.metadata
        : null,
    }));

    const response: NotificationsResponse = {
      success: true,
      notifications: parsedNotifications,
      unreadCount,
      total: notifications.length,
    };

    return res.json(response);
  } catch (error: any) {
    return handleError(res, error, "Fetch notifications");
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 * Body: { googleAccountId: number }
 */
router.patch("/:id/read", async (req: Request, res: Response) => {
  try {
    const notificationId = parseInt(req.params.id, 10);
    const { googleAccountId } = req.body;

    if (isNaN(notificationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid notification ID",
        message: "Notification ID must be a valid number",
      });
    }

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        message: "googleAccountId is required",
      });
    }

    // Get domain from account ID
    const domain = await getDomainFromAccountId(googleAccountId);
    if (!domain) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
        message: "Google account not found",
      });
    }

    // Verify notification belongs to domain
    const notification = await db("notifications")
      .where({ id: notificationId, domain_name: domain })
      .first();

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
        message:
          "Notification does not exist or does not belong to your domain",
      });
    }

    // Update to read
    await db("notifications").where({ id: notificationId }).update({
      read: true,
      read_timestamp: new Date(),
      updated_at: new Date(),
    });

    return res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error: any) {
    return handleError(res, error, "Mark notification as read");
  }
});

/**
 * PATCH /api/notifications/mark-all-read
 * Mark all notifications as read for a domain
 * Body: { googleAccountId: number }
 */
router.patch("/mark-all-read", async (req: Request, res: Response) => {
  try {
    const { googleAccountId } = req.body;

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        message: "googleAccountId is required",
      });
    }

    // Get domain from account ID
    const domain = await getDomainFromAccountId(googleAccountId);
    if (!domain) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
        message: "Google account not found",
      });
    }

    // Update all unread notifications for this domain
    const updated = await db("notifications")
      .where({ domain_name: domain, read: false })
      .update({
        read: true,
        read_timestamp: new Date(),
        updated_at: new Date(),
      });

    return res.json({
      success: true,
      message: `${updated} notification(s) marked as read`,
      count: updated,
    });
  } catch (error: any) {
    return handleError(res, error, "Mark all notifications as read");
  }
});

/**
 * DELETE /api/notifications/delete-all
 * Delete all notifications for a domain
 * Body: { googleAccountId: number }
 */
router.delete("/delete-all", async (req: Request, res: Response) => {
  try {
    const { googleAccountId } = req.body;

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        message: "googleAccountId is required",
      });
    }

    // Get domain from account ID
    const domain = await getDomainFromAccountId(googleAccountId);
    if (!domain) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
        message: "Google account not found",
      });
    }

    // Delete all notifications for this domain
    const deleted = await db("notifications")
      .where({ domain_name: domain })
      .delete();

    return res.json({
      success: true,
      message: `${deleted} notification(s) deleted`,
      count: deleted,
    });
  } catch (error: any) {
    return handleError(res, error, "Delete all notifications");
  }
});

// =====================================================================
// ADMIN ENDPOINTS (Unrestricted Access)
// =====================================================================

/**
 * POST /api/notifications
 * Create a notification (admin/system)
 * Body: CreateNotificationRequest
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { domain_name, title, message, type, metadata } = req.body;

    // Validation
    if (!domain_name || !title) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "domain_name and title are required",
      });
    }

    // Get google_account_id from domain
    const account = await db("google_accounts").where({ domain_name }).first();

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "Domain not found",
        message: `No account found for domain: ${domain_name}`,
      });
    }

    // Create notification
    const notificationData = {
      google_account_id: account.id,
      domain_name,
      title,
      message: message || null,
      type: type || "system",
      metadata: metadata ? JSON.stringify(metadata) : null,
      read: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [result] = await db("notifications")
      .insert(notificationData)
      .returning("id");
    const notificationId = result.id;

    return res.status(201).json({
      success: true,
      notificationId,
      message: "Notification created successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Create notification");
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const notificationId = parseInt(req.params.id, 10);

    if (isNaN(notificationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid notification ID",
        message: "Notification ID must be a valid number",
      });
    }

    // Check if notification exists
    const notification = await db("notifications")
      .where({ id: notificationId })
      .first();

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
        message: "Notification does not exist",
      });
    }

    // Delete notification
    await db("notifications").where({ id: notificationId }).delete();

    return res.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Delete notification");
  }
});

// =====================================================================
// HEALTH CHECK
// =====================================================================

/**
 * GET /api/notifications/health
 * Health check endpoint
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
