/**
 * NotificationService - Business logic layer for the notification system.
 *
 * Responsibilities:
 * - Domain resolution from google account IDs
 * - Notification CRUD operations via model layer
 * - Domain ownership verification
 * - Account lookup for notification creation
 *
 * All database access goes through NotificationModel and GoogleAccountModel.
 * No direct db() calls.
 */

import { NotificationModel, INotification } from "../../../models/NotificationModel";
import { GoogleAccountModel } from "../../../models/GoogleAccountModel";

interface DomainResolutionResult {
  domain: string | null;
  error?: string;
}

interface MarkReadResult {
  success: boolean;
  error?: string;
}

interface CreateNotificationResult {
  success: boolean;
  notificationId?: number;
  error?: string;
}

interface DeleteNotificationResult {
  success: boolean;
  error?: string;
}

export class NotificationService {
  /**
   * Resolve a domain name from a google account ID.
   * Wraps GoogleAccountModel.getDomainFromAccountId with error handling.
   *
   * @param googleAccountId - The google account ID to look up
   * @returns Domain string if found, null with optional error if not
   */
  static async resolveDomainFromAccountId(
    googleAccountId: number
  ): Promise<DomainResolutionResult> {
    try {
      const domain = await GoogleAccountModel.getDomainFromAccountId(googleAccountId);
      return { domain };
    } catch (error) {
      console.error("Error fetching domain from account ID:", error);
      return { domain: null, error: "Failed to resolve domain" };
    }
  }

  /**
   * Fetch notifications and unread count for a domain.
   *
   * @param domain - The domain name to fetch notifications for
   * @param limit - Maximum number of notifications to return (default 10)
   * @returns Notifications array and unread count
   */
  static async getNotificationsForDomain(
    domain: string,
    limit: number = 10
  ): Promise<{ notifications: INotification[]; unreadCount: number }> {
    const notifications = await NotificationModel.findByDomain(domain, limit);
    const unreadCount = await NotificationModel.countUnread(domain);
    return { notifications, unreadCount };
  }

  /**
   * Mark a single notification as read, with domain ownership verification.
   *
   * Verifies the notification exists AND belongs to the specified domain
   * before marking it as read. This prevents cross-domain access.
   *
   * @param notificationId - The notification ID to mark as read
   * @param domain - The domain that must own the notification
   * @returns Success status with error details if failed
   */
  static async markNotificationRead(
    notificationId: number,
    domain: string
  ): Promise<MarkReadResult> {
    // Verify notification belongs to domain
    const notification = await NotificationModel.findByIdAndDomain(
      notificationId,
      domain
    );

    if (!notification) {
      return {
        success: false,
        error: "Notification does not exist or does not belong to your domain",
      };
    }

    await NotificationModel.markRead(notificationId);
    return { success: true };
  }

  /**
   * Mark all unread notifications as read for a domain.
   *
   * @param domain - The domain to mark all notifications read for
   * @returns Number of notifications updated
   */
  static async markAllNotificationsRead(domain: string): Promise<number> {
    return NotificationModel.markAllRead(domain);
  }

  /**
   * Delete all notifications for a domain.
   *
   * @param domain - The domain to delete all notifications for
   * @returns Number of notifications deleted
   */
  static async deleteAllNotificationsForDomain(domain: string): Promise<number> {
    return NotificationModel.deleteAllByDomain(domain);
  }

  /**
   * Create a notification for a domain with account lookup.
   *
   * Looks up the google account by domain_name to get the account ID,
   * then creates the notification with all required fields.
   *
   * @param data - Notification creation data including domain_name, title, message, type, metadata
   * @returns Success with notification ID, or error if domain not found
   */
  static async createNotificationForDomain(data: {
    domain_name: string;
    title: string;
    message?: string;
    type?: string;
    metadata?: unknown;
  }): Promise<CreateNotificationResult> {
    // Look up google account by domain
    const account = await GoogleAccountModel.findByDomain(data.domain_name);

    if (!account) {
      return {
        success: false,
        error: `No account found for domain: ${data.domain_name}`,
      };
    }

    // Create notification
    const notificationData: Partial<INotification> = {
      google_account_id: account.id,
      domain_name: data.domain_name,
      title: data.title,
      message: data.message || null,
      type: (data.type || "system") as INotification["type"],
      metadata: data.metadata ? data.metadata as Record<string, unknown> : null,
      read: false,
    };

    const notificationId = await NotificationModel.create(notificationData);
    return { success: true, notificationId };
  }

  /**
   * Delete a single notification by ID (admin operation).
   *
   * Verifies the notification exists before attempting deletion.
   *
   * @param notificationId - The notification ID to delete
   * @returns Success status with error details if not found
   */
  static async deleteNotificationById(
    notificationId: number
  ): Promise<DeleteNotificationResult> {
    // Check if notification exists
    const notification = await NotificationModel.findById(notificationId);

    if (!notification) {
      return {
        success: false,
        error: "Notification does not exist",
      };
    }

    await NotificationModel.deleteById(notificationId);
    return { success: true };
  }
}
