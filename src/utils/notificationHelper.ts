import { db } from "../database/connection";
import type { NotificationType } from "../types/global";
import {
  sendUserNotification,
  sendAdminNotification,
  sendAdminError,
  sendUserInquiry,
} from "../emails";
import type {
  UserNotificationData,
  AdminNotificationData,
  AdminErrorData,
  UserInquiryData,
} from "../emails";

// Use explicit APP_URL environment variable, fallback to production URL by default
const APP_URL =
  process.env.APP_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://app.getalloro.com"
    : "https://app.getalloro.com"); // Default to production URL for safety in emails

/**
 * Map notification types to email notification types
 */
const notificationTypeToEmailType: Record<
  NotificationType,
  UserNotificationData["notificationType"]
> = {
  pms: "pms_job_ready",
  agent: "monthly_report",
  ranking: "ranking_complete",
  task: "task_update",
  system: "system",
};

/**
 * Create a notification for a domain/client
 * Also sends an email notification in parallel if user email is available
 * @param domain - The domain to notify
 * @param title - Notification title
 * @param message - Notification message/body
 * @param type - Notification type (default: 'system')
 * @param metadata - Optional metadata object
 * @param options - Optional configuration
 * @returns The notification ID or null if failed
 */
export async function createNotification(
  domain: string,
  title: string,
  message?: string,
  type: NotificationType = "system",
  metadata?: any,
  options?: {
    skipEmail?: boolean;
    actionUrl?: string;
    actionLabel?: string;
  }
): Promise<number | null> {
  try {
    // Get google_account_id and user email from domain
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

    const notificationId = result?.id || null;

    // Send email notification in parallel (non-blocking)
    if (!options?.skipEmail && account?.email) {
      const emailType = notificationTypeToEmailType[type] || "system";

      // Determine action URL based on notification type
      let actionUrl = options?.actionUrl;
      let actionLabel = options?.actionLabel;

      if (!actionUrl) {
        switch (type) {
          case "pms":
            actionUrl = `${APP_URL}/dashboard?tab=referrals`;
            actionLabel = "View Referral Data";
            break;
          case "agent":
            actionUrl = `${APP_URL}/dashboard`;
            actionLabel = "View Dashboard";
            break;
          case "ranking":
            actionUrl = `${APP_URL}/rankings`;
            actionLabel = "View Rankings";
            break;
          case "task":
            actionUrl = `${APP_URL}/dashboard?tab=tasks`;
            actionLabel = "View Tasks";
            break;
          default:
            actionUrl = `${APP_URL}/dashboard`;
            actionLabel = "Open Dashboard";
        }
      }

      // Fire and forget - don't await, don't block
      sendUserNotification({
        recipientEmail: account.email,
        recipientName: account.practice_name || domain,
        notificationType: emailType,
        title,
        message: message || "",
        actionUrl,
        actionLabel,
        metadata: metadata || {},
      }).catch((err) => {
        console.error(
          `[NotificationHelper] Failed to send user email for ${domain}: ${err.message}`
        );
      });
    }

    return notificationId;
  } catch (error) {
    console.error(`[NotificationHelper] Failed to create notification:`, error);
    return null;
  }
}

/**
 * Send admin email notification
 * Used for internal team notifications (PMS ready for review, errors, etc.)
 * @param data - Admin notification data
 * @returns Email result
 */
export async function notifyAdmins(data: AdminNotificationData) {
  try {
    const result = await sendAdminNotification(data);
    if (!result.success) {
      console.error(
        `[NotificationHelper] Admin notification failed:`,
        result.error
      );
    }
    return result;
  } catch (error: any) {
    console.error(
      `[NotificationHelper] Admin notification error:`,
      error.message
    );
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Send admin error alert
 * Used when system errors occur that need admin attention
 * @param data - Error data
 * @returns Email result
 */
export async function notifyAdminsOfError(data: AdminErrorData) {
  try {
    const result = await sendAdminError(data);
    if (!result.success) {
      console.error(
        `[NotificationHelper] Admin error notification failed:`,
        result.error
      );
    }
    return result;
  } catch (error: any) {
    console.error(
      `[NotificationHelper] Admin error notification error:`,
      error.message
    );
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Forward user inquiry to admin team
 * Used when a user submits a support request via help form
 * @param data - User inquiry data
 * @returns Email result
 */
export async function forwardUserInquiry(data: UserInquiryData) {
  try {
    const result = await sendUserInquiry(data);
    if (!result.success) {
      console.error(
        `[NotificationHelper] User inquiry forward failed:`,
        result.error
      );
    }
    return result;
  } catch (error: any) {
    console.error(
      `[NotificationHelper] User inquiry forward error:`,
      error.message
    );
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Notify admins when PMS parser output is ready for review
 * Trigger: When n8n webhook completes processing
 */
export async function notifyAdminsPmsReady(domain: string, jobId: number) {
  const actionUrl = `${APP_URL}/admin/pms?job=${jobId}`;

  return notifyAdmins({
    summary: `PMS parser output is ready for review for ${domain}`,
    practiceRankingsCompleted: [],
    monthlyAgentsCompleted: [],
    newActionItems: 1,
  });
}

/**
 * Notify admins when monthly agents complete
 * Trigger: After all monthly agents finish successfully
 */
export async function notifyAdminsMonthlyAgentComplete(
  domain: string,
  agentResults: {
    summaryId: number;
    referralEngineId: number;
    opportunityId: number;
    croOptimizerId: number;
  },
  tasksCreated: { user: number; alloro: number; total: number }
) {
  const actionUrl = `${APP_URL}/admin`;

  return notifyAdmins({
    summary: `Monthly agent run completed for ${domain}. Created ${tasksCreated.total} tasks (${tasksCreated.user} USER, ${tasksCreated.alloro} ALLORO).`,
    monthlyAgentsCompleted: [
      { practiceName: domain, agentType: "Summary", status: "completed" },
      {
        practiceName: domain,
        agentType: "Referral Engine",
        status: "completed",
      },
      { practiceName: domain, agentType: "Opportunity", status: "completed" },
      { practiceName: domain, agentType: "CRO Optimizer", status: "completed" },
    ],
    newActionItems: tasksCreated.total,
  });
}

/**
 * Notify admins when practice ranking completes
 * Trigger: After ranking batch analysis finishes
 */
export async function notifyAdminsRankingComplete(
  domain: string,
  batchId: string,
  locationCount: number,
  avgScore: number | null
) {
  const scoreText = avgScore ? `Average score: ${avgScore.toFixed(1)}` : "";

  return notifyAdmins({
    summary: `Practice ranking analysis completed for ${domain}. ${locationCount} location(s) analyzed. ${scoreText}`,
    practiceRankingsCompleted: [
      {
        practiceName: domain,
        locationName: `${locationCount} location(s)`,
        rankScore: avgScore || 0,
        rankPosition: 0,
      },
    ],
    newActionItems: 0,
  });
}
