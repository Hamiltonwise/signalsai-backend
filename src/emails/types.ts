/**
 * Email Types and Interfaces
 *
 * Defines the structure for the Alloro email service.
 */

export interface EmailPayload {
  subject: string;
  body: string; // HTML content
  recipients: string[];
  cc?: string[];
  bcc?: string[];
}

export interface SendEmailOptions {
  /** Email subject line */
  subject: string;
  /** HTML body content */
  body: string;
  /** Primary recipients */
  recipients: string[];
  /** CC recipients */
  cc?: string[];
  /** BCC recipients */
  bcc?: string[];
  /** Preheader text (for email previews) */
  preheader?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: string;
}

export interface AdminNotificationData {
  newActionItems?: number;
  practiceRankingsCompleted?: Array<{
    practiceName: string;
    locationName: string;
    rankScore: number;
    rankPosition: number;
  }>;
  monthlyAgentsCompleted?: Array<{
    practiceName: string;
    agentType: string;
    status: string;
  }>;
  summary?: string;
}

export interface AdminErrorData {
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  context?: Record<string, any>;
  timestamp: string;
  environment: string;
}

export interface UserInquiryData {
  userName: string;
  userEmail: string;
  practiceName?: string;
  subject: string;
  message: string;
}

export interface UserNotificationData {
  recipientName?: string;
  recipientEmail: string;
  notificationType:
    | "pms_job_ready"
    | "ranking_complete"
    | "monthly_report"
    | "task_update"
    | "system";
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
}

// Email template metadata
export interface EmailTemplate {
  name: string;
  description: string;
  requiredFields: string[];
}

// Registered templates
export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  ADMIN_NOTIFICATION: {
    name: "AdminSendNotification",
    description: "Notify admins of new action items, completed rankings, etc.",
    requiredFields: ["summary"],
  },
  ADMIN_ERROR: {
    name: "AdminSendErrorMessage",
    description: "Send error snapshots to admin team",
    requiredFields: ["errorType", "errorMessage", "timestamp"],
  },
  USER_INQUIRY: {
    name: "UserSendInquiry",
    description: "Forward user inquiries to admin team",
    requiredFields: ["userName", "userEmail", "subject", "message"],
  },
  USER_NOTIFICATION: {
    name: "UserSendNotification",
    description:
      "Send notifications to users in parallel with in-app notifications",
    requiredFields: ["recipientEmail", "notificationType", "title", "message"],
  },
};
