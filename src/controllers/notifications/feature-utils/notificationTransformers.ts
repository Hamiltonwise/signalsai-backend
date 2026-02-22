/**
 * Notification data transformation utilities.
 *
 * Handles database-to-API response transformations:
 * - Boolean normalization for the `read` field (SQLite returns 0/1 integers)
 * - Metadata JSON parsing (defensive, in case model layer hasn't parsed it)
 * - Response envelope formatting for the NotificationsResponse shape
 */

import type { NotificationType } from "../../../utils/core/notificationHelper";

interface Notification {
  id: number;
  organization_id?: number;
  title: string;
  message?: string;
  type: NotificationType;
  read: boolean;
  read_timestamp?: Date;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
  unreadCount: number;
  total: number;
}

/**
 * Parse a single notification row into the API response shape.
 *
 * Normalizes the `read` field from SQLite integer (0/1) to boolean.
 * Defensively parses metadata in case it arrives as a JSON string.
 *
 * @param notification - Raw notification row (from model or db)
 * @returns Normalized Notification object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseNotification(notification: any): Notification {
  return {
    ...notification,
    read: notification.read === 1 || notification.read === true,
    metadata: notification.metadata
      ? typeof notification.metadata === "string"
        ? JSON.parse(notification.metadata)
        : notification.metadata
      : null,
  };
}

/**
 * Parse an array of notification rows into API response shape.
 *
 * @param notifications - Array of raw notification rows
 * @returns Array of normalized Notification objects
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseNotifications(notifications: any[]): Notification[] {
  return notifications.map(parseNotification);
}

/**
 * Format the complete GET /api/notifications response envelope.
 *
 * @param notifications - Already-parsed notification objects
 * @param unreadCount - Count of unread notifications for the domain
 * @returns Structured NotificationsResponse matching the API contract
 */
export function formatNotificationsResponse(
  notifications: Notification[],
  unreadCount: number
): NotificationsResponse {
  return {
    success: true,
    notifications,
    unreadCount,
    total: notifications.length,
  };
}
