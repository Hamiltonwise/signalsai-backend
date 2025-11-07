import { db } from "../database/connection";
import type { NotificationType } from "../types/global";

/**
 * Create a notification for a domain/client
 * @param domain - The domain to notify
 * @param title - Notification title
 * @param message - Notification message/body
 * @param type - Notification type (default: 'system')
 * @param metadata - Optional metadata object
 * @returns The notification ID or null if failed
 */
export async function createNotification(
  domain: string,
  title: string,
  message?: string,
  type: NotificationType = "system",
  metadata?: any
): Promise<number | null> {
  try {
    // Get google_account_id from domain
    const account = await db("google_accounts")
      .where({ domain_name: domain })
      .first();

    const [result] = await db("notifications")
      .insert({
        google_account_id: account?.id || null,
        domain_name: domain,
        title,
        message: message || null,
        type,
        metadata: metadata ? JSON.stringify(metadata) : null,
        read: false,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    return result?.id || null;
  } catch (error) {
    return null;
  }
}
