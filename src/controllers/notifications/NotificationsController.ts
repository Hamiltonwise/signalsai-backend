/**
 * NotificationsController - HTTP handler layer for notification endpoints.
 *
 * Thin controller that handles:
 * - Request parsing and validation
 * - Delegating business logic to NotificationService
 * - Data transformation via feature-utils
 * - HTTP response formatting (status codes, response shapes)
 * - Error handling
 *
 * 7 endpoints total:
 * - 4 client endpoints (domain-filtered via google account ID)
 * - 2 admin endpoints (unrestricted)
 * - 1 health check
 */

import { Request, Response } from "express";
import { NotificationService } from "./feature-services";
import {
  validateNotificationId,
  validateGoogleAccountId,
  validateCreateNotificationRequest,
  parseNotifications,
  formatNotificationsResponse,
} from "./feature-utils";

// TODO: Extract to shared error handling utility during centralized error handling refactor.
// This is intentionally kept inline per the refactor plan to avoid scope creep.
// Duplicated across ~23 route/controller files.
/**
 * Standardized error response handler.
 * Logs the error with context and returns a 500 JSON response.
 *
 * @param res - Express response object
 * @param error - The caught error
 * @param operation - Human-readable operation name for logging
 * @returns Express Response with error payload
 */
function handleError(res: Response, error: unknown, operation: string): Response {
  const err = error as { message?: string };
  console.error(`[NOTIFICATIONS] ${operation} Error:`, err?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: err?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
}

export class NotificationsController {
  /**
   * GET /api/notifications
   * Fetch latest 10 notifications for the logged-in client.
   * Query params: googleAccountId (required)
   */
  static async getNotifications(req: Request, res: Response): Promise<Response> {
    try {
      const googleAccountId = req.query.googleAccountId;

      const accountValidation = validateGoogleAccountId(googleAccountId);
      if (!accountValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
          message: accountValidation.error,
        });
      }

      // Resolve domain from account ID
      const { domain } = await NotificationService.resolveDomainFromAccountId(
        Number(googleAccountId)
      );
      if (!domain) {
        return res.status(404).json({
          success: false,
          error: "Account not found",
          message: "Google account not found or has no domain",
        });
      }

      // Fetch notifications and unread count
      const { notifications, unreadCount } =
        await NotificationService.getNotificationsForDomain(domain, 10);

      // Transform and format response
      const parsedNotifications = parseNotifications(notifications);
      const response = formatNotificationsResponse(parsedNotifications, unreadCount);

      return res.json(response);
    } catch (error: unknown) {
      return handleError(res, error, "Fetch notifications");
    }
  }

  /**
   * PATCH /api/notifications/:id/read
   * Mark a notification as read.
   * Body: { googleAccountId: number }
   */
  static async markAsRead(req: Request, res: Response): Promise<Response> {
    try {
      const idValidation = validateNotificationId(req.params.id);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Invalid notification ID",
          message: idValidation.error,
        });
      }

      const { googleAccountId } = req.body;
      const accountValidation = validateGoogleAccountId(googleAccountId);
      if (!accountValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
          message: accountValidation.error,
        });
      }

      // Resolve domain from account ID
      const { domain } = await NotificationService.resolveDomainFromAccountId(
        googleAccountId
      );
      if (!domain) {
        return res.status(404).json({
          success: false,
          error: "Account not found",
          message: "Google account not found",
        });
      }

      // Mark as read with domain ownership verification
      const result = await NotificationService.markNotificationRead(
        idValidation.notificationId!,
        domain
      );
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: "Notification not found",
          message: result.error,
        });
      }

      return res.json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error: unknown) {
      return handleError(res, error, "Mark notification as read");
    }
  }

  /**
   * PATCH /api/notifications/mark-all-read
   * Mark all notifications as read for a domain.
   * Body: { googleAccountId: number }
   */
  static async markAllAsRead(req: Request, res: Response): Promise<Response> {
    try {
      const { googleAccountId } = req.body;

      const accountValidation = validateGoogleAccountId(googleAccountId);
      if (!accountValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
          message: accountValidation.error,
        });
      }

      // Resolve domain from account ID
      const { domain } = await NotificationService.resolveDomainFromAccountId(
        googleAccountId
      );
      if (!domain) {
        return res.status(404).json({
          success: false,
          error: "Account not found",
          message: "Google account not found",
        });
      }

      // Mark all as read
      const updated = await NotificationService.markAllNotificationsRead(domain);

      return res.json({
        success: true,
        message: `${updated} notification(s) marked as read`,
        count: updated,
      });
    } catch (error: unknown) {
      return handleError(res, error, "Mark all notifications as read");
    }
  }

  /**
   * DELETE /api/notifications/delete-all
   * Delete all notifications for a domain.
   * Body: { googleAccountId: number }
   */
  static async deleteAll(req: Request, res: Response): Promise<Response> {
    try {
      const { googleAccountId } = req.body;

      const accountValidation = validateGoogleAccountId(googleAccountId);
      if (!accountValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Missing google account ID",
          message: accountValidation.error,
        });
      }

      // Resolve domain from account ID
      const { domain } = await NotificationService.resolveDomainFromAccountId(
        googleAccountId
      );
      if (!domain) {
        return res.status(404).json({
          success: false,
          error: "Account not found",
          message: "Google account not found",
        });
      }

      // Delete all notifications for this domain
      const deleted = await NotificationService.deleteAllNotificationsForDomain(
        domain
      );

      return res.json({
        success: true,
        message: `${deleted} notification(s) deleted`,
        count: deleted,
      });
    } catch (error: unknown) {
      return handleError(res, error, "Delete all notifications");
    }
  }

  /**
   * POST /api/notifications
   * Create a notification (admin/system).
   * Body: { domain_name, title, message?, type?, metadata? }
   */
  static async createNotification(req: Request, res: Response): Promise<Response> {
    try {
      const { domain_name, title, message, type, metadata } = req.body;

      const validation = validateCreateNotificationRequest({ domain_name, title });
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
          message: validation.errors?.[0] || "domain_name and title are required",
        });
      }

      // Create notification with account lookup
      const result = await NotificationService.createNotificationForDomain({
        domain_name,
        title,
        message,
        type,
        metadata,
      });

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: "Domain not found",
          message: result.error,
        });
      }

      return res.status(201).json({
        success: true,
        notificationId: result.notificationId,
        message: "Notification created successfully",
      });
    } catch (error: unknown) {
      return handleError(res, error, "Create notification");
    }
  }

  /**
   * DELETE /api/notifications/:id
   * Delete a notification (admin).
   */
  static async deleteNotification(req: Request, res: Response): Promise<Response> {
    try {
      const idValidation = validateNotificationId(req.params.id);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Invalid notification ID",
          message: idValidation.error,
        });
      }

      const result = await NotificationService.deleteNotificationById(
        idValidation.notificationId!
      );
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: "Notification not found",
          message: result.error,
        });
      }

      return res.json({
        success: true,
        message: "Notification deleted successfully",
      });
    } catch (error: unknown) {
      return handleError(res, error, "Delete notification");
    }
  }

  /**
   * GET /api/notifications/health
   * Health check endpoint.
   */
  static healthCheck(_req: Request, res: Response): Response {
    return res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  }
}
